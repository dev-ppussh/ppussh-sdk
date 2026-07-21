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
import { TokenResponse } from "./types";

export class AccountsNamespace {
  private readonly _http: HttpTransport;
  private readonly _clientId: string;
  private readonly _clientSecret: string;
  private readonly _accountsFrontendUrl: string;

  constructor(
    transport: HttpTransport,
    options: { clientId: string; clientSecret: string; accountsFrontendUrl: string },
  ) {
    this._http = transport;
    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._accountsFrontendUrl = options.accountsFrontendUrl;
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
}
