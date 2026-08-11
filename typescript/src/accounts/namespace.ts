// ppussh/src/accounts/namespace.ts
/**
 * AccountsNamespace — product-side helpers for the Accounts service.
 *
 * The product backend owns the full OIDC lifecycle (login redirect, callback,
 * token handling, refresh, logout, cookie management). This namespace provides
 * the two server-side calls the product backend needs from the SDK:
 *
 *   buildLoginUrl()   → build the redirect URL to send the user to Accounts login
 *   exchangeCode()    → exchange an OAuth authorization code for a token
 *
 * The SDK never forwards end-user tokens. Profile/session/entitlement lookups
 * are intentionally out of scope — the product reads those from its own cookies
 * or calls the Accounts API directly with its own credentials.
 */

import { HttpTransport } from "../http";
import {
  EntitlementCreateRequest,
  EntitlementUpdateRequest,
  EntitlementWithProductResponse,
  TokenResponse,
} from "./types";

export class AccountsNamespace {
  private readonly _http: HttpTransport;
  private readonly _clientId: string;
  private readonly _clientSecret: string;
  private readonly _accountsFrontendUrl: string;
  private readonly _adminKey: string | null;

  constructor(
    transport: HttpTransport,
    options: {
      clientId: string;
      clientSecret: string;
      accountsFrontendUrl: string;
      adminKey?: string | null;
    },
  ) {
    this._http = transport;
    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._accountsFrontendUrl = options.accountsFrontendUrl;
    this._adminKey = options.adminKey ?? null;
  }

  // ── Login URL builder ──────────────────────────────────────────────────────

  buildLoginUrl(
    redirectUri: string,
    state: string,
    opts?: { nextUrl?: string },
  ): string {
    const params = new URLSearchParams({
      client_id: this._clientId,
      redirect_uri: redirectUri,
      state,
    });
    if (opts?.nextUrl) {
      params.set("next", opts.nextUrl);
    }
    return `${this._accountsFrontendUrl}/login?${params.toString()}`;
  }

  // ── OAuth token exchange ───────────────────────────────────────────────────

  /**
   * Exchange an authorization code for a token (OAuth authorization_code grant).
   *
   * Call this from your OIDC callback route. The SDK authenticates **as the
   * product** using the clientId / clientSecret supplied to PpusshClient and
   * POSTs to the Accounts /oauth/token endpoint.
   *
   * @param code         The `code` query parameter Accounts redirected back with.
   * @param redirectUri  Must exactly match the redirectUri used in buildLoginUrl().
   * @param opts.state   Optional; echoed back from the callback for CSRF validation.
   * @param opts.nextUrl Optional; forwarded so Accounts can resume the post-login target.
   * @returns TokenResponse — set token.user.id / token.access_token as your own
   *   session cookie. The SDK does not store or forward the token.
   * @throws PpusshAuthError  If the code is invalid/expired or credentials are wrong.
   */
  async exchangeCode(
    code: string,
    redirectUri: string,
    opts?: { state?: string; nextUrl?: string },
  ): Promise<TokenResponse> {
    const body: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: this._clientId,
      client_secret: this._clientSecret,
      code,
      redirect_uri: redirectUri,
    };
    if (opts?.state != null) body["state"] = opts.state;
    if (opts?.nextUrl != null) body["next_url"] = opts.nextUrl;

    const response = await this._http.request("POST", "/oauth/token", {
      form: body,
    });
    return response.data as TokenResponse;
  }

  // ── Entitlements (admin / server-to-server) ────────────────────────────────

  /**
   * List every entitlement (per-product role + feature flags) for a user.
   *
   * Requires the accountsAdminKey configured on PpusshClient.
   *
   * @param userId  UUID string of the Accounts user.
   * @throws Error  If no accountsAdminKey was provided at construction.
   */
  async listUserEntitlements(userId: string): Promise<EntitlementWithProductResponse[]> {
    this._requireAdminKey("listUserEntitlements");
    const response = await this._http.request(
      "GET",
      `/users/${userId}/entitlements`,
      {
        headers: this._adminHeaders(),
      },
    );
    return response.data as EntitlementWithProductResponse[];
  }

  /**
   * Grant a user an entitlement for a product.
   *
   * Server-to-server: the SDK authenticates with the Accounts admin key and
   * passes ``userId`` explicitly — the user does not need to be logged in.
   *
   * @param options.userId        UUID string of the Accounts user.
   * @param options.productId     UUID string of the Accounts product.
   * @param options.role          Role to grant (e.g. "owner", "admin", "member").
   * @param options.featureFlags  Optional initial feature flags (boolean values only).
   * @throws Error                If no accountsAdminKey was provided at construction.
   */
  async grantEntitlement(options: {
    userId: string;
    productId: string;
    role: string;
    featureFlags?: Record<string, boolean>;
  }): Promise<EntitlementWithProductResponse> {
    this._requireAdminKey("grantEntitlement");
    const body: EntitlementCreateRequest = {
      user_id: options.userId,
      product_id: options.productId,
      role: options.role,
      feature_flags: options.featureFlags,
    };
    const response = await this._http.request("POST", "/admin/entitlements", {
      json: body,
      headers: this._adminHeaders(),
    });
    return response.data as EntitlementWithProductResponse;
  }

  /**
   * Update an entitlement's feature flags.
   *
   * Pass ``null`` as a flag value to remove that flag; other flags are merged.
   * For example ``{ beta: false, founding: null }`` sets beta=false and
   * removes founding.
   *
   * @param entitlementId  UUID string of the entitlement.
   * @param featureFlags   Partial flag updates — boolean to set, null to remove.
   */
  async updateEntitlementFlags(
    entitlementId: string,
    featureFlags: Record<string, boolean | null>,
  ): Promise<EntitlementWithProductResponse> {
    this._requireAdminKey("updateEntitlementFlags");
    const body: EntitlementUpdateRequest = { feature_flags: featureFlags };
    const response = await this._http.request(
      "PATCH",
      `/admin/entitlements/${entitlementId}`,
      {
        json: body,
        headers: this._adminHeaders(),
      },
    );
    return response.data as EntitlementWithProductResponse;
  }

  /**
   * Revoke a user's entitlement for a product.
   *
   * @param entitlementId  UUID string of the entitlement.
   */
  async revokeEntitlement(entitlementId: string): Promise<void> {
    this._requireAdminKey("revokeEntitlement");
    await this._http.request(
      "DELETE",
      `/admin/entitlements/${entitlementId}`,
      {
        headers: this._adminHeaders(),
      },
    );
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _adminHeaders(): Record<string, string> {
    return { "X-Admin-Key": this._adminKey! };
  }

  private _requireAdminKey(method: string): void {
    if (!this._adminKey) {
      throw new Error(
        `accounts.${method}() requires an accountsAdminKey. ` +
          "Pass accountsAdminKey: '...' to PpusshClient().",
      );
    }
  }
}
