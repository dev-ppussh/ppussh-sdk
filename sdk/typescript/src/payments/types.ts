// ppussh/src/payments/types.ts
/**
 * TypeScript interfaces for every response shape returned by the Payments service.
 *
 * Mirror of the Python SDK's payments/models.py — kept in sync manually.
 * Monetary amounts are always integer cents — never float.
 */

// ── Customers ─────────────────────────────────────────────────────────────────

/** Response from POST /customers or GET /customers/{id}. */
export interface CustomerResponse {
  id: string;
  owner_user_id: string;
  workspace_id: string | null;
  provider_customer_ids: Record<string, string>;
  billing_email: string | null;
  created_at: string; // ISO 8601
}

/** Request body for POST /customers. */
export interface CustomerCreateRequest {
  owner_user_id: string;
  workspace_id?: string | null;
  billing_email?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ── Plans ─────────────────────────────────────────────────────────────────────

/** Response from GET /admin/products/{id}/plans. */
export interface PlanResponse {
  id: string;
  product_id: string;
  plan_key: string;
  provider_plan_ids: Record<string, string>;
  amount_cents: number; // integer — never float
  currency: string; // ISO 4217 e.g. "USD"
  billing_cycle: "monthly" | "yearly";
  status: "active" | "archived";
  features: Record<string, unknown>[] | null; // e.g. [{code: "premium_nodes", name: "Premium AI Nodes", limit: 500}]
  created_at: string; // ISO 8601
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled"
  | "unpaid"
  | "pending_payment";

/** Response from POST /subscriptions or GET /subscriptions/{id}. */
export interface SubscriptionResponse {
  id: string;
  customer_id: string;
  plan_id: string;
  provider: string;
  provider_subscription_ids: Record<string, string>;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  trial_ends_at: string | null;
  checkout_url: string | null; // Hosted checkout page (only on create)
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/** Paginated response from GET /subscriptions. */
export interface SubscriptionListResponse {
  items: SubscriptionResponse[];
  total: number;
  page: number;
  page_size: number;
}

/** Request body for POST /subscriptions. */
export interface SubscriptionCreateRequest {
  customer_id: string;
  payment_product_id: string;
  plan_key: string;
  idempotency_key: string;
  provider?: string | null;
  return_url?: string | null;  // URL to redirect after checkout
  metadata?: Record<string, unknown> | null;
}

/** Request body for DELETE /subscriptions/{id}. */
export interface SubscriptionCancelRequest {
  cancel_immediately?: boolean;
}

/** Extended response includes checkout URL from provider */
export interface SubscriptionResponse {
  id: string;
  customer_id: string;
  plan_id: string;
  provider: string;
  provider_subscription_ids: Record<string, string>;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
  checkout_url: string | null;  // Only populated on creation
}

/** Request body for DELETE /subscriptions/{id}. */
export interface SubscriptionCancelRequest {
  cancel_immediately?: boolean;
}

// ── Payments product (admin) ──────────────────────────────────────────────────

/** Response from GET /admin/products/by-accounts-id/{id}. */
export interface PaymentProductResponse {
  id: string;
  accounts_product_id: string;
  name: string;
  description: string | null;
  created_at: string; // ISO 8601
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface MRRByProduct {
  product_id: string;
  product_name: string;
  mrr_cents: number;
  currency: string;
}

export interface MRRByPlan {
  plan_id: string;
  plan_key: string;
  mrr_cents: number;
  currency: string;
}

/** Response from GET /admin/analytics/mrr. */
export interface MRRResponse {
  total_mrr_cents: number;
  currency: string;
  by_product: MRRByProduct[];
  by_plan: MRRByPlan[];
}

// ── Access check ──────────────────────────────────────────────────────────────

/** Response from POST /access/check. */
export interface AccessResult {
  hasAccess: boolean;
  featureName: string | null;
  limit: number | boolean | null;
}

// ── Checkout session ─────────────────────────────────────────────────────────

/** Request body for POST /subscriptions/checkout-session. */
export interface CheckoutSessionRequest {
  user_id: string;
  plan_id: string;
  return_url: string;
  idempotency_key: string;
  billing_email?: string | null;
}

/** Response from POST /subscriptions/checkout-session. */
export interface CheckoutSessionResponse {
  checkout_url: string;
}

/** Response from GET /subscriptions/paddle-config. */
export interface PaddleConfigResponse {
  client_token: string;
  environment: string;
}
