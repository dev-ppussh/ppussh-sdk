// ppussh/src/accounts/namespace.ts
/**
 * AccountsNamespace — server-side OIDC + user operations.
 *
 * Handles the product-backend half of the OIDC flow:
 *   buildLoginUrl()   → build the redirect URL to send the user to Accounts (synchronous)
 *   exchangeCode()    → trade the auth code (from callback URL) for tokens
 *   refresh()         → rotate tokens using a refresh token
 *   verifyToken()     → validate an incoming access token (e.g. from a request header)
 *   logout()          → revoke a session via refresh token (POST /oauth/logout)
 *   logoutAll()       → revoke ALL sessions via access token (POST /auth/logout)
 *   revokeSession()   → revoke a single session by ID (DELETE /auth/sessions/{id})
 *   getUser()         → fetch the full user profile for the stored access token
 *   getEntitlements() → list entitlements for the authenticated user
 *   getSessions()     → list active sessions for the authenticated user
 *
 * Session state:
 * After a successful exchangeCode() or refresh() call, the client stores:
 *   _accessToken    — attached automatically to getUser() / getEntitlements() / getSessions()
 *   _refreshToken   — used automatically by refresh() and logout() if not passed explicitly
 *   _tokenExpiresAt — informational; not used for auto-refresh (caller's responsibility)
 */

import { HttpTransport } from "../http";
import {
  effectiveAccessToken,
  EntitlementResponse,
  LogoutResult,
  SessionResponse,
  TokenResponse,
  UserProfile,
  VerifyTokenResult,
} from "./types";

export class AccountsNamespace {
  private readonly _http: HttpTransport;
  private readonly _clientId: string;
  private readonly _clientSecret: string;
  private readonly _accountsUrl: string;

  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _tokenExpiresAt: Date | null = null;

  constructor(
    transport: HttpTransport,
    options: { clientId: string; clientSecret: string; accountsUrl: string },
  ) {
    this._http = transport;
    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._accountsUrl = options.accountsUrl;
  }

  // ── Login URL builder ──────────────────────────────────────────────────────

  /**
   * Build the URL to redirect the user's browser to the Accounts login page.
   *
   * This is step 2 of the OIDC flow — call this in your route handler and
   * issue a 302 redirect to the returned URL.  The Accounts frontend handles
   * email/password login as well as Google and GitHub social login; the
   * product backend never needs to call social-auth endpoints directly.
   *
   * @param redirectUri Must exactly match the redirect_uri registered for your product.
   * @param state       A cryptographically random string stored in the user's session
   *                    to prevent CSRF attacks.
   * @param opts.nextUrl Optional URL the Accounts frontend redirects to after login
   *                     within its own domain (rarely needed).
   * @returns The full login URL, e.g. `https://accounts.example.com/login?client_id=...`
   */
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
    return `${this._accountsUrl}/login?${params.toString()}`;
  }

  // ── OIDC token exchange ────────────────────────────────────────────────────

  /**
   * Exchange the authorization code received on your callback URL for tokens.
   *
   * This is step 6 of the OIDC flow — called by your server after the
   * Accounts frontend redirects the user back to your redirectUri with
   * `?code=...&state=...` in the query string.
   *
   * @param code        The raw 64-char hex auth code from the callback URL.
   * @param redirectUri Must exactly match the redirect_uri registered for your product.
   * @returns TokenResponse — contains tokens and an embedded UserInToken.
   *          Tokens are also stored internally for subsequent calls.
   * @throws PpusshAuthError        If the code is invalid, expired, or already used.
   * @throws PpusshConsentRequired  If the user has not consented to your product.
   * @throws PpusshNetworkError     If the request fails after all retries.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    const response = await this._http.request("POST", "/oauth/token", {
      form: {
        grant_type: "authorization_code",
        code,
        client_id: this._clientId,
        client_secret: this._clientSecret,
        redirect_uri: redirectUri,
      },
    });
    const token = response.data as TokenResponse;
    this._storeTokens(token);
    return token;
  }

  /**
   * Rotate tokens using a refresh token.
   *
   * If refreshToken is omitted, the internally stored refresh token
   * from the last exchangeCode() / refresh() call is used.
   *
   * @throws PpusshAuthError  If the refresh token is invalid, expired, or replayed.
   *                          Note: a replayed token causes ALL sessions to be revoked
   *                          server-side — this is a security feature, not a bug.
   */
  async refresh(refreshToken?: string): Promise<TokenResponse> {
    const tokenToUse = refreshToken ?? this._refreshToken;
    if (!tokenToUse) {
      throw new Error(
        "No refreshToken provided and none stored. " +
          "Call exchangeCode() first or pass refreshToken explicitly.",
      );
    }
    const response = await this._http.request("POST", "/oauth/token", {
      form: {
        grant_type: "refresh_token",
        refresh_token: tokenToUse,
        client_id: this._clientId,
        client_secret: this._clientSecret,
      },
    });
    const token = response.data as TokenResponse;
    this._storeTokens(token);
    return token;
  }

  // ── Token verification ─────────────────────────────────────────────────────

  /**
   * Validate an access token your server received from an end-user request.
   *
   * Use this in your middleware / request handler to verify that the Bearer
   * token a user sent to your product's API is valid and not expired.
   *
   * @param accessToken The raw JWT string from the `Authorization: Bearer ...` header.
   * @returns VerifyTokenResult with valid, type, user_id, and email.
   * @throws PpusshAuthError  If the token is invalid, expired, or the account is deleted.
   */
  async verifyToken(accessToken: string): Promise<VerifyTokenResult> {
    const response = await this._http.request("GET", "/auth/verify-token", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data as VerifyTokenResult;
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  /**
   * Revoke a session and trigger front-channel logout to all connected products.
   *
   * Uses POST /oauth/logout with the refresh token — this is the standard
   * per-session logout that also notifies downstream products via webhooks.
   *
   * If refreshToken is omitted, the internally stored refresh token is used.
   * On success, stored tokens are cleared from the client instance.
   *
   * Logout is always safe to call — if the token is already invalid or the session
   * doesn't exist, the Accounts server returns ok=true silently.
   *
   * @throws PpusshAuthError  If client_id or client_secret are invalid.
   */
  async logout(refreshToken?: string): Promise<LogoutResult> {
    const tokenToUse = refreshToken ?? this._refreshToken;
    if (!tokenToUse) {
      throw new Error(
        "No refreshToken provided and none stored. " +
          "Call exchangeCode() first or pass refreshToken explicitly.",
      );
    }
    const response = await this._http.request("POST", "/oauth/logout", {
      json: {
        refresh_token: tokenToUse,
        client_id: this._clientId,
        client_secret: this._clientSecret,
      },
    });
    const result = response.data as LogoutResult;
    this._clearTokens();
    return result;
  }

  /**
   * Revoke **all** sessions for the current user immediately.
   *
   * Uses POST /auth/logout with the access token (Bearer header).
   * Unlike logout(), this does not require a refresh token and revokes every
   * active session across all devices — useful for "sign out everywhere" UX.
   *
   * On success, stored tokens are cleared from the client instance.
   *
   * @param accessToken JWT access token. Optional if stored internally.
   * @throws PpusshAuthError  If the token is invalid or expired.
   */
  async logoutAll(accessToken?: string): Promise<void> {
    const tokenToUse = accessToken ?? this._accessToken;
    if (!tokenToUse) {
      throw new Error(
        "No accessToken provided and none stored. " +
          "Call exchangeCode() first or pass accessToken explicitly.",
      );
    }
    await this._http.request("POST", "/auth/logout", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    });
    this._clearTokens();
  }

  // ── Session management ─────────────────────────────────────────────────────

  /**
   * Revoke a specific session by its ID.
   *
   * Uses DELETE /auth/sessions/{sessionId} — the user can only revoke their
   * own sessions.  Useful for "sign out of this device" UX in a session
   * management screen.
   *
   * @param sessionId   The UUID of the session to revoke (from getSessions()).
   * @param accessToken JWT access token. Optional if stored internally.
   * @throws PpusshAuthError  If the token is invalid or the session does not
   *                          belong to the authenticated user.
   */
  async revokeSession(sessionId: string, accessToken?: string): Promise<void> {
    const tokenToUse = accessToken ?? this._accessToken;
    if (!tokenToUse) {
      throw new Error(
        "No accessToken provided and none stored. " +
          "Call exchangeCode() first or pass accessToken explicitly.",
      );
    }
    await this._http.request("DELETE", `/auth/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    });
  }

  // ── User profile ───────────────────────────────────────────────────────────

  /**
   * Fetch the full user profile for an access token.
   *
   * If accessToken is omitted, the internally stored token from the last
   * exchangeCode() or refresh() is used.
   *
   * @throws PpusshAuthError  If the token is invalid or expired.
   */
  async getUser(accessToken?: string): Promise<UserProfile> {
    const tokenToUse = accessToken ?? this._accessToken;
    if (!tokenToUse) {
      throw new Error(
        "No accessToken provided and none stored. " +
          "Call exchangeCode() first or pass accessToken explicitly.",
      );
    }
    const response = await this._http.request("GET", "/users/me", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    });
    return response.data as UserProfile;
  }

  // ── Entitlements & sessions ────────────────────────────────────────────────

  /**
   * List products the user has granted consent to (their entitlements).
   *
   * @param accessToken JWT access token. Optional if stored internally.
   */
  async getEntitlements(accessToken?: string): Promise<EntitlementResponse[]> {
    const tokenToUse = accessToken ?? this._accessToken;
    if (!tokenToUse) {
      throw new Error("No accessToken provided and none stored.");
    }
    const response = await this._http.request("GET", "/users/me/entitlements", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    });
    return response.data as EntitlementResponse[];
  }

  /**
   * List all active sessions for the authenticated user.
   *
   * @param accessToken JWT access token. Optional if stored internally.
   */
  async getSessions(accessToken?: string): Promise<SessionResponse[]> {
    const tokenToUse = accessToken ?? this._accessToken;
    if (!tokenToUse) {
      throw new Error("No accessToken provided and none stored.");
    }
    const response = await this._http.request("GET", "/users/me/sessions", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    });
    return response.data as SessionResponse[];
  }

  // ── Internal token management ──────────────────────────────────────────────

  private _storeTokens(token: TokenResponse): void {
    this._accessToken = effectiveAccessToken(token);
    this._refreshToken = token.refresh_token;
    this._tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);
  }

  private _clearTokens(): void {
    this._accessToken = null;
    this._refreshToken = null;
    this._tokenExpiresAt = null;
  }

  /** The currently stored access token, if any. */
  get accessToken(): string | null {
    return this._accessToken;
  }

  /** The currently stored refresh token, if any. */
  get refreshToken(): string | null {
    return this._refreshToken;
  }

  /** UTC Date at which the stored access token expires, if known. */
  get tokenExpiresAt(): Date | null {
    return this._tokenExpiresAt;
  }
}
