// ppussh/src/accounts/types.ts
/**
 * TypeScript interfaces for the response shapes returned by the Accounts service
 * that the SDK depends on.
 *
 * The SDK authenticates **as a product** (OAuth client credentials + product/admin
 * API keys) and never forwards end-user tokens, so the only Accounts shapes the
 * SDK needs are the OAuth token response and the embedded user claims.
 *
 * Mirror of the Python SDK's accounts/models.py — kept in sync manually.
 */

// ── OAuth token response ────────────────────────────────────────────────────────

/** The user object embedded inside an OAuth token response. */
export interface UserInToken {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  email_verified: boolean;
  is_superuser: boolean;
}

/** Response from POST /oauth/token (authorization_code grant). */
export interface TokenResponse {
  access_token?: string | null;
  token_type: string; // "Bearer"
  expires_in?: number | null;
  refresh_token?: string | null;
  admin_access_token?: string | null;
  user: UserInToken;
}
