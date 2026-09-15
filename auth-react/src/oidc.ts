import { PPUSSHError } from "./errors";

/** Cryptographically random base64url state/nonce. */
export function generateState(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface LoginUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  /** Presentation hint only — never alters OAuth semantics. */
  display?: "popup";
}

/** Full-page fallback entry: Accounts frontend login with OIDC params. */
export function buildLoginUrl(accountsUrl: string, params: LoginUrlParams): string {
  const url = new URL("/login", accountsUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  if (params.display) {
    url.searchParams.set("display", params.display);
  }
  return url.toString();
}

export interface AuthCodeResult {
  code: string;
  state: string;
}

/**
 * Consume the existing `redirect_url` continuation contract without navigating.
 * The backend mints a standard auth code bound to the registered redirect_uri;
 * the product BFF exchanges it via POST /oauth/token exactly as in the
 * full-page flow.
 */
export function parseAuthResult(redirectUrl: string, expectedState?: string): AuthCodeResult {
  let url: URL;
  try {
    url = new URL(redirectUrl);
  } catch {
    throw new PPUSSHError("invalid_response", "Authorize returned an unparseable redirect_url");
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    throw new PPUSSHError("missing_code", "Authorize response did not contain an authorization code");
  }
  if (expectedState !== undefined && state !== expectedState) {
    throw new PPUSSHError("state_mismatch", "State mismatch in authorize response");
  }
  return { code, state: state ?? "" };
}

/**
 * Full-page fallback: navigate the main window to Accounts login.
 * Used when popups are blocked or the modal cannot complete. This is the
 * pre-existing canonical flow — same URL, same callback, same BFF exchange.
 */
export function redirectToAccounts(accountsUrl: string, params: LoginUrlParams): void {
  window.location.href = buildLoginUrl(accountsUrl, params);
}
