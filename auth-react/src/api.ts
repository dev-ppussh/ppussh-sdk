import { PPUSSHError } from "./errors";
import { parseAuthResult } from "./oidc";

export interface ProductInfo {
  client_id: string;
  product_name: string;
  product_description?: string | null;
  product_base_url?: string | null;
  has_consent?: boolean;
}

export type AuthorizeSigninResult =
  | { status: "authorized"; code: string; state: string }
  | { status: "consent_required"; product: ProductInfo };

export interface SigninRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  email: string;
  password: string;
  captchaToken?: string;
}

export interface ConsentRequest {
  clientId: string;
  redirectUri: string;
  state: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(data: unknown, fallback: string): string {
  if (isRecord(data)) {
    const detail = data["detail"];
    if (typeof detail === "string" && detail) {
      return detail;
    }
    if (isRecord(detail) && typeof detail["message"] === "string" && detail["message"]) {
      return detail["message"] as string;
    }
    if (typeof data["message"] === "string" && data["message"]) {
      return data["message"] as string;
    }
  }
  return fallback;
}

async function postJson(apiBaseUrl: string, path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PPUSSHError("network_error", `Network error calling ${path}`);
  }
  let data: unknown;
  try {
    const text = await res.text();
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new PPUSSHError("invalid_response", `Invalid JSON response from ${path}`, res.status);
  }
  return { status: res.status, data };
}

function toProductInfo(data: Record<string, unknown>): ProductInfo {
  return {
    client_id: typeof data["client_id"] === "string" ? (data["client_id"] as string) : "",
    product_name: typeof data["product_name"] === "string" ? (data["product_name"] as string) : "",
    product_description:
      typeof data["product_description"] === "string" ? (data["product_description"] as string) : null,
    product_base_url: typeof data["product_base_url"] === "string" ? (data["product_base_url"] as string) : null,
    has_consent: typeof data["has_consent"] === "boolean" ? (data["has_consent"] as boolean) : undefined,
  };
}

/**
 * Existing-user email sign-in via POST /auth/authorize.
 * Consumes the returned redirect_url continuation without navigating.
 */
export async function authorizeSignin(apiBaseUrl: string, req: SigninRequest): Promise<AuthorizeSigninResult> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/authorize", {
    action: "signin",
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    state: req.state,
    email: req.email,
    password: req.password,
    ...(req.captchaToken ? { captcha_token: req.captchaToken } : {}),
  });

  if (status === 200 && isRecord(data) && typeof data["redirect_url"] === "string") {
    const { code, state } = parseAuthResult(data["redirect_url"] as string, req.state);
    return { status: "authorized", code, state };
  }
  if (status === 403 && isRecord(data) && data["status"] === "CONSENT_REQUIRED") {
    return { status: "consent_required", product: toProductInfo(data) };
  }
  if (status === 401) {
    throw new PPUSSHError("invalid_credentials", "Invalid email or password", 401);
  }
  if (status === 202) {
    throw new PPUSSHError(
      "email_verification_required",
      "Account created — please verify your email to continue",
      202,
    );
  }
  throw new PPUSSHError("unknown", errorMessage(data, "Sign-in failed"), status);
}

/** Grant product authorization via POST /auth/consent. */
export async function grantConsent(
  apiBaseUrl: string,
  req: ConsentRequest,
): Promise<{ code: string; state: string }> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/consent", {
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    state: req.state,
  });
  if (status === 200 && isRecord(data) && typeof data["redirect_url"] === "string") {
    return parseAuthResult(data["redirect_url"] as string, req.state);
  }
  throw new PPUSSHError("unknown", errorMessage(data, "Authorization failed"), status);
}

export type SocialProvider = "google" | "github";

export interface SocialAuthorizeRequest {
  provider: SocialProvider;
  clientId: string;
  redirectUri: string;
  state: string;
}

/**
 * Start provider OAuth via POST /auth/social/authorize.
 * Returns the provider URL to open in a popup. Accounts owns the provider
 * callback; completion arrives via <PPUSSHCallbackHandler /> on the
 * product's existing callback route.
 */
export async function socialAuthorize(apiBaseUrl: string, req: SocialAuthorizeRequest): Promise<string> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/social/authorize", {
    provider: req.provider,
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    state: req.state,
  });
  if (status === 200 && isRecord(data) && typeof data["redirect_url"] === "string") {
    return data["redirect_url"] as string;
  }
  throw new PPUSSHError("unknown", errorMessage(data, "Social sign-in failed to start"), status);
}

/** Product signup via POST /auth/authorize. Always returns 202 — email verification happens next. */
export async function authorizeSignup(
  apiBaseUrl: string,
  req: {
    clientId: string;
    redirectUri: string;
    state: string;
    name: string;
    email: string;
    password: string;
    captchaToken?: string;
  },
): Promise<{ userId: string }> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/authorize", {
    action: "signup",
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    state: req.state,
    name: req.name,
    email: req.email,
    password: req.password,
    ...(req.captchaToken ? { captcha_token: req.captchaToken } : {}),
  });
  if (status === 202 && isRecord(data) && typeof data["user_id"] === "string") {
    return { userId: data["user_id"] as string };
  }
  if (status === 409) {
    throw new PPUSSHError("unknown", "An account with this email already exists", 409);
  }
  throw new PPUSSHError("unknown", errorMessage(data, "Sign-up failed"), status);
}

/**
 * Consume an email-verification token (e.g. pasted from the verification
 * email when the product wants the flow to stay in-modal). The standard path
 * is the Accounts /activate page; this helper covers token-in-modal.
 */
export async function verifyEmailToken(
  apiBaseUrl: string,
  req: { token: string; clientId: string; redirectUri: string; state: string },
): Promise<{ code: string; state: string }> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/verify-email", {
    token: req.token,
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
  });
  if (status === 200 && isRecord(data) && typeof data["redirect_url"] === "string") {
    return parseAuthResult(data["redirect_url"] as string, req.state);
  }
  if (status === 403 && isRecord(data) && data["status"] === "CONSENT_REQUIRED") {
    throw new PPUSSHError("unknown", "Verification succeeded — product authorization is still required", 403);
  }
  throw new PPUSSHError("unknown", errorMessage(data, "Email verification failed"), status);
}

/** Resend the verification email. Always succeeds (anti-enumeration). */
export async function resendVerification(apiBaseUrl: string, email: string, captchaToken?: string): Promise<void> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/resend-verification", {
    email,
    ...(captchaToken ? { captcha_token: captchaToken } : {}),
  });
  if (status !== 204 && status !== 200) {
    throw new PPUSSHError("unknown", errorMessage(data, "Failed to resend verification email"), status);
  }
}

/** Start password recovery. Always succeeds (anti-enumeration). */
export async function forgotPassword(apiBaseUrl: string, email: string, captchaToken?: string): Promise<void> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/forgot-password", {
    email,
    ...(captchaToken ? { captcha_token: captchaToken } : {}),
  });
  if (status !== 204 && status !== 200) {
    throw new PPUSSHError("unknown", errorMessage(data, "Failed to start password recovery"), status);
  }
}

/** Complete password reset with the token from the recovery email. */
export async function resetPassword(apiBaseUrl: string, token: string, newPassword: string): Promise<void> {
  const { status, data } = await postJson(apiBaseUrl, "/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  if (status !== 200) {
    throw new PPUSSHError("unknown", errorMessage(data, "Password reset failed"), status);
  }
}

/** Product metadata for the SDK consent screen. */
export async function getProductInfo(apiBaseUrl: string, clientId: string): Promise<ProductInfo> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/public/products/by-client-id/${encodeURIComponent(clientId)}`, {
      credentials: "include",
    });
  } catch {
    throw new PPUSSHError("network_error", "Network error fetching product info");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PPUSSHError("invalid_response", "Invalid product info response", res.status);
  }
  if (res.status !== 200 || !isRecord(data)) {
    throw new PPUSSHError("unknown", errorMessage(data, "Failed to load product info"), res.status);
  }
  return toProductInfo(data);
}
