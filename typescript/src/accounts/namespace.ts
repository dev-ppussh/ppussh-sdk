// ppussh/src/accounts/namespace.ts
/**
 * AccountsNamespace — stateless helpers for Accounts service API calls.
 *
 * The product backend handles the OIDC flow (login, callback, token exchange)
 * and cookie management itself. This namespace provides lightweight wrappers
 * for the few server-side calls the product backend needs:
 *
 *   buildLoginUrl()   → build the redirect URL to send the user to Accounts
 *   verifyToken()     → validate an incoming access token (from request cookies)
 *   getUser()         → fetch the full user profile
 *   getEntitlements() → list products the user has granted consent to
 *   getSessions()     → list active sessions for the authenticated user
 *   revokeSession()   → revoke a single session by ID
 *
 * No tokens are stored internally — every method requiring authentication
 * expects an explicit ``accessToken`` parameter.
 */

import { HttpTransport } from "../http";
import {
  EntitlementResponse,
  SessionResponse,
  UserProfile,
  VerifyTokenResult,
} from "./types";

export class AccountsNamespace {
  private readonly _http: HttpTransport;
  private readonly _clientId: string;
  private readonly _clientSecret: string;
  private readonly _accountsUrl: string;
  private readonly _accountsFrontendUrl: string;

  constructor(
    transport: HttpTransport,
    options: { clientId: string; clientSecret: string; accountsUrl: string; accountsFrontendUrl: string },
  ) {
    this._http = transport;
    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._accountsUrl = options.accountsUrl;
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

  // ── Token verification ─────────────────────────────────────────────────────

  async verifyToken(accessToken: string): Promise<VerifyTokenResult> {
    const response = await this._http.request("GET", "/auth/verify-token", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data as VerifyTokenResult;
  }

  // ── User profile ───────────────────────────────────────────────────────────

  async getUser(accessToken: string): Promise<UserProfile> {
    const response = await this._http.request("GET", "/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data as UserProfile;
  }

  // ── Entitlements & sessions ────────────────────────────────────────────────

  async getEntitlements(accessToken: string): Promise<EntitlementResponse[]> {
    const response = await this._http.request("GET", "/users/me/entitlements", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data as EntitlementResponse[];
  }

  async getSessions(accessToken: string): Promise<SessionResponse[]> {
    const response = await this._http.request("GET", "/users/me/sessions", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data as SessionResponse[];
  }

  async revokeSession(sessionId: string, accessToken: string): Promise<void> {
    await this._http.request("DELETE", `/auth/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
