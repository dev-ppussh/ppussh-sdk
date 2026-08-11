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

// ── Credit purchases (one-time) ─────────────────────────────────────────────────

/** Request body for POST /checkout. */
export interface CheckoutRequest {
  package_id: string;
  return_url: string;
  idempotency_key?: string | null;
  user_id?: string | null; // required for server-to-server callers
}

/** Response from POST /checkout. */
export interface CheckoutResponse {
  checkout_url: string;
  transaction_id: string;
}

/** Request body for POST /transactions/{id}/claim. */
export interface ClaimRequest {
  user_id: string;
}

/** Response from POST /transactions/{id}/claim. */
export interface ClaimResponse {
  claimed: boolean;
  credit_amount: number | null;
}

/** Response from GET /transactions/unclaimed. */
export interface TransactionResponse {
  id: string;
  user_id: string;
  product_id: string;
  package_id: string;
  credit_amount: number;
  amount_paid_cents: number;
  status: string; // PENDING | PAID | FAILED
  delivered: boolean;
  delivered_at: string | null;
  provider: string;
  provider_tx_id: string | null;
  created_at: string; // ISO 8601
}

// ── Credit packages (admin) ────────────────────────────────────────────────────

/** Response from the /admin/packages endpoints. */
export interface PackageResponse {
  id: string;
  product_id: string;
  credit_amount: number;
  price_cents: number;
  currency: string;
  provider_price_ids: Record<string, string>;
  is_active: boolean;
  created_at: string; // ISO 8601
}

/** Request body for POST /admin/packages. */
export interface PackageCreateRequest {
  id: string; // e.g. "pack_waitly_500"
  product_id: string;
  credit_amount: number;
  price_cents: number;
  currency?: string;
  provider_price_ids?: Record<string, string>;
  is_active?: boolean;
}

/** Request body for PATCH /admin/packages/{id}. */
export interface PackageUpdateRequest {
  credit_amount?: number | null;
  price_cents?: number | null;
  currency?: string | null;
  provider_price_ids?: Record<string, string> | null;
  is_active?: boolean | null;
}

// ── Subscription billing details ───────────────────────────────────────────────

/** A single paid invoice in a subscription's billing history. */
export interface InvoiceHistoryItem {
  invoice_id: string;
  amount_cents: number;
  currency: string;
  paid_at: string | null;
  status: string;
}

/** Response from GET /subscriptions/{id}/details. */
export interface SubscriptionBillingDetails {
  subscription: SubscriptionResponse;
  billing_history: InvoiceHistoryItem[];
}

// ── Sandbox ────────────────────────────────────────────────────────────────────

/** Request body for POST /sandbox/checkout. */
export interface SandboxCheckoutRequest {
  product_accounts_id: string;
  item_type: "CREDIT_PACKAGE" | "SUBSCRIPTION";
  price_id: string;
  return_url?: string | null;
  idempotency_key?: string | null;
  user_id?: string | null; // required for server-to-server callers
}

/** Response from POST /sandbox/checkout. */
export interface SandboxCheckoutResponse {
  checkout_url: string;
  transaction_id: string;
}

/** A single row in GET /sandbox/transactions. */
export interface SandboxTransactionItem {
  id: string;
  type: "CREDIT_PACKAGE" | "SUBSCRIPTION";
  product_id: string;
  amount: number;
  currency: string;
  status: string;
  delivered: boolean;
  created_at: string;
}

/** Response from GET /sandbox/transactions. */
export interface SandboxTransactionsResponse {
  transactions: SandboxTransactionItem[];
}

/** Request body for POST /sandbox/claim. */
export interface SandboxClaimRequest {
  transaction_id: string;
  user_id?: string | null; // required for server-to-server callers
}

/** Response from POST /sandbox/claim. */
export interface SandboxClaimResponse {
  claimed: boolean;
  credit_amount: number | null;
}
