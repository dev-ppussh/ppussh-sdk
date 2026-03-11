// ppussh/src/accounts/types.ts
/**
 * TypeScript interfaces for every response shape returned by the Accounts service.
 *
 * Mirror of the Python SDK's accounts/models.py — kept in sync manually.
 */

// ── Token exchange ────────────────────────────────────────────────────────────

/** Minimal user profile embedded inside a TokenResponse. */
export interface UserInToken {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  picture_url: string | null;
  is_superuser: boolean;
}

/**
 * Response from POST /oauth/token (both grant types).
 *
 * Exactly one of access_token / admin_access_token is populated:
 * - Regular users  → access_token is set, admin_access_token is null.
 * - Superusers     → admin_access_token is set, access_token is null.
 */
export interface TokenResponse {
  access_token: string | null;
  admin_access_token: string | null;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  user: UserInToken;
}

/** Returns whichever access token is present (regular or admin). */
export function effectiveAccessToken(token: TokenResponse): string | null {
  return token.access_token ?? token.admin_access_token;
}

// ── Token verification ────────────────────────────────────────────────────────

/** Response from GET /auth/verify-token. */
export interface VerifyTokenResult {
  valid: boolean;
  type: "access" | "admin_access";
  user_id: string;
  email: string;
}

// ── User profile ──────────────────────────────────────────────────────────────

/** Full user profile returned by GET /users/me. */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  is_superuser: boolean;
  is_active: boolean;
  is_verified: boolean;
  created_at: string; // ISO 8601
  updated_at: string | null; // ISO 8601
}

// ── Logout ────────────────────────────────────────────────────────────────────

/** Response from POST /oauth/logout. */
export interface LogoutResult {
  ok: boolean;
  sessions_revoked: number;
  products_notified: number;
}

// ── Entitlements ──────────────────────────────────────────────────────────────

/** Single entitlement entry from GET /users/me/entitlements. */
export interface EntitlementResponse {
  product_id: string;
  client_id: string;
  name: string;
  slug: string;
  granted_at: string; // ISO 8601
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/** Single session entry from GET /users/me/sessions. */
export interface SessionResponse {
  session_id: string;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  device_name: string | null;
  created_at: string; // ISO 8601
  last_used_at: string; // ISO 8601
  is_current: boolean;
}
