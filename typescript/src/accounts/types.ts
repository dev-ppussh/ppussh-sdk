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

// ── Entitlements ──────────────────────────────────────────────────────────────

/** Entitlement feature flags are always booleans. */
export type FeatureFlags = Record<string, boolean>;

/** Response from GET /users/{id}/entitlements (one per product). */
export interface EntitlementWithProductResponse {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  role: string; // e.g. "owner" | "admin" | "member" | "viewer"
  feature_flags: FeatureFlags;
  created_at: string; // ISO 8601
}

/** Request body for POST /admin/entitlements. */
export interface EntitlementCreateRequest {
  user_id: string;
  product_id: string;
  role: string;
  feature_flags?: FeatureFlags;
}

/** Request body for PATCH /admin/entitlements/{id}. */
export interface EntitlementUpdateRequest {
  feature_flags?: Record<string, boolean | null>; // null removes a flag
}
