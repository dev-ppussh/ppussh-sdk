// ppussh/src/accounts/types.ts
/**
 * TypeScript interfaces for every response shape returned by the Accounts service.
 *
 * Mirror of the Python SDK's accounts/models.py — kept in sync manually.
 */

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
