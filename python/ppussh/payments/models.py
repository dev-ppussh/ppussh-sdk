# ppussh/payments/models.py
"""
Pydantic models for every response shape returned by the Payments service.

Monetary amounts are always integer cents — never float or Decimal.
Currency is always an ISO 4217 string stored alongside amount_cents.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── Shared config ──────────────────────────────────────────────────────────────
_cfg = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Customers ──────────────────────────────────────────────────────────────────

class CustomerResponse(BaseModel):
    """Response from ``POST /customers`` or ``GET /customers/{id}``."""
    model_config = _cfg

    id: str                                   # UUID string
    owner_user_id: str                        # UUID string — Accounts user ID
    workspace_id: str | None = None           # UUID string or None (personal account)
    provider_customer_ids: dict[str, str]     # e.g. {"paddle": "ctm_01abc..."}
    billing_email: str | None = None
    created_at: datetime


class CustomerCreateRequest(BaseModel):
    """Request body for ``POST /customers``."""
    model_config = _cfg

    owner_user_id: str                        # UUID string
    workspace_id: str | None = None
    billing_email: str | None = None
    metadata: dict[str, Any] | None = None


# ── Plans ──────────────────────────────────────────────────────────────────────

class PlanResponse(BaseModel):
    """Response from ``GET /admin/products/{id}/plans``."""
    model_config = _cfg

    id: str                                   # UUID string
    product_id: str                           # UUID string
    plan_key: str                             # e.g. "pro", "enterprise"
    provider_plan_ids: dict[str, str]         # e.g. {"paddle": "pri_01abc...", "dodo": "plan_xyz..."}
    amount_cents: int                         # integer — never float
    currency: str                             # ISO 4217 e.g. "USD"
    billing_cycle: str                        # "monthly" | "yearly"
    status: str                               # "active" | "archived"
    features: list[dict] | None = None       # e.g. [{"code": "premium_nodes", "name": "Premium AI Nodes", "limit": 500}]
    created_at: datetime

    def amount_display(self) -> str:
        """Human-readable amount, e.g. '$29.00'."""
        major = self.amount_cents / 100
        return f"{major:,.2f} {self.currency}"


# ── Access check ──────────────────────────────────────────────────────────────

class AccessResult(BaseModel):
    """Response from ``POST /access/check``."""
    model_config = _cfg

    has_access: bool
    feature_name: str | None = None
    limit: int | bool | None = None


# ── Subscriptions ──────────────────────────────────────────────────────────────

class SubscriptionResponse(BaseModel):
    """Response from ``POST /subscriptions`` or ``GET /subscriptions/{id}``."""
    model_config = _cfg

    id: str                                   # UUID string
    customer_id: str                          # UUID string
    plan_id: str                              # UUID string
    provider: str                             # "paddle" | "dodo"
    provider_subscription_ids: dict[str, str]
    status: str                               # trialing|active|past_due|paused|cancelled|unpaid|pending_payment
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancelled_at: datetime | None = None
    trial_ends_at: datetime | None = None
    checkout_url: str | None = None     # Hosted checkout page (only on create)
    created_at: datetime
    updated_at: datetime

    @property
    def is_active(self) -> bool:
        """True if the subscription is in a billable / usable state."""
        return self.status in ("trialing", "active")

    @property
    def is_cancelled(self) -> bool:
        return self.status == "cancelled"


class SubscriptionListResponse(BaseModel):
    """Paginated response from ``GET /subscriptions``."""
    model_config = _cfg

    items: list[SubscriptionResponse]
    total: int
    page: int
    page_size: int


class SubscriptionCreateRequest(BaseModel):
    """Request body for ``POST /subscriptions``."""
    model_config = _cfg

    customer_id: str                          # UUID string
    payment_product_id: str                   # UUID string
    plan_key: str                             # e.g. "pro"
    idempotency_key: str                      # caller-supplied, unique per attempt
    provider: str | None = None              # "paddle" | "dodo" | None (use plan default)
    metadata: dict[str, Any] | None = None
    return_url: str | None = None           # hosted checkout: redirect here after payment


class SubscriptionCancelRequest(BaseModel):
    """Request body for ``DELETE /subscriptions/{id}``."""
    model_config = _cfg

    cancel_immediately: bool = False


# ── Payments product (admin) ───────────────────────────────────────────────────

class PaymentProductResponse(BaseModel):
    """Response from ``GET /admin/products/by-accounts-id/{id}``."""
    model_config = _cfg

    id: str                                   # UUID string (payments product ID)
    accounts_product_id: str                  # string (accounts product UUID)
    name: str
    description: str | None = None
    created_at: datetime


# ── Analytics ─────────────────────────────────────────────────────────────────

class MRRByProduct(BaseModel):
    model_config = _cfg

    product_id: str
    product_name: str
    mrr_cents: int
    currency: str


class MRRByPlan(BaseModel):
    model_config = _cfg

    plan_id: str
    plan_key: str
    mrr_cents: int
    currency: str


class MRRResponse(BaseModel):
    """Response from ``GET /admin/analytics/mrr``."""
    model_config = _cfg

    total_mrr_cents: int
    currency: str
    by_product: list[MRRByProduct]
    by_plan: list[MRRByPlan]


# ── Checkout session ──────────────────────────────────────────────────────────

class CheckoutSessionRequest(BaseModel):
    """Request body for ``POST /subscriptions/checkout-session``."""
    model_config = _cfg

    user_id: str                           # UUID string — Accounts user ID
    plan_id: str                           # UUID string — Payments Plan ID
    return_url: str                        # Portal redirects here after checkout
    idempotency_key: str                   # Unique per attempt (UUID v4)


class CheckoutSessionResponse(BaseModel):
    """Response from ``POST /subscriptions/checkout-session``."""
    model_config = _cfg

    checkout_url: str                      # Portal SPA URL with txn + return_url


class PaddleConfigResponse(BaseModel):
    """Response from ``GET /subscriptions/paddle-config``."""
    model_config = _cfg

    client_token: str                      # Paddle client-side token
    environment: str                       # "sandbox" | "production"


# ── Credit purchases (one-time) ─────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    """Request body for ``POST /checkout``."""
    model_config = _cfg

    package_id: str
    return_url: str
    idempotency_key: str | None = None
    user_id: str | None = None          # required for server-to-server callers


class CheckoutResponse(BaseModel):
    """Response from ``POST /checkout``."""
    model_config = _cfg

    checkout_url: str
    transaction_id: str                      # UUID string


class ClaimRequest(BaseModel):
    """Request body for ``POST /transactions/{id}/claim``."""
    model_config = _cfg

    user_id: str                             # UUID string


class ClaimResponse(BaseModel):
    """Response from ``POST /transactions/{id}/claim``."""
    model_config = _cfg

    claimed: bool
    credit_amount: int | None = None


class TransactionResponse(BaseModel):
    """Response from ``GET /transactions/unclaimed``."""
    model_config = _cfg

    id: str                                  # UUID string
    user_id: str                             # UUID string
    product_id: str                          # UUID string
    package_id: str
    credit_amount: int
    amount_paid_cents: int
    status: str                              # PENDING | PAID | FAILED
    delivered: bool
    delivered_at: datetime | None = None
    provider: str
    provider_tx_id: str | None = None
    created_at: datetime


# ── Credit packages (admin) ─────────────────────────────────────────────────────


class PackageCreateRequest(BaseModel):
    """Request body for ``POST /admin/packages``."""
    model_config = _cfg

    id: str                                  # e.g. "pack_waitly_500"
    product_id: str                          # UUID string
    credit_amount: int
    price_cents: int
    currency: str = "USD"
    provider_price_ids: dict[str, str] = {}
    is_active: bool = True


class PackageUpdateRequest(BaseModel):
    """Request body for ``PATCH /admin/packages/{id}``."""
    model_config = _cfg

    credit_amount: int | None = None
    price_cents: int | None = None
    currency: str | None = None
    provider_price_ids: dict[str, str] | None = None
    is_active: bool | None = None


class PackageResponse(BaseModel):
    """Response from the ``/admin/packages`` endpoints."""
    model_config = _cfg

    id: str
    product_id: str                          # UUID string
    credit_amount: int
    price_cents: int
    currency: str
    provider_price_ids: dict[str, str]
    is_active: bool
    created_at: datetime


# ── Subscription billing details ───────────────────────────────────────────────


class InvoiceHistoryItem(BaseModel):
    """A single paid invoice in a subscription's billing history."""
    model_config = _cfg

    invoice_id: str                          # UUID string
    amount_cents: int
    currency: str
    paid_at: datetime | None = None
    status: str


class SubscriptionBillingDetails(BaseModel):
    """Response from ``GET /subscriptions/{id}/details``."""
    model_config = _cfg

    subscription: SubscriptionResponse
    billing_history: list[InvoiceHistoryItem]


# ── Sandbox ────────────────────────────────────────────────────────────────────


class SandboxCheckoutRequest(BaseModel):
    """Request body for ``POST /sandbox/checkout``."""
    model_config = _cfg

    product_accounts_id: str
    item_type: str                          # "CREDIT_PACKAGE" | "SUBSCRIPTION"
    price_id: str
    return_url: str | None = None
    idempotency_key: str | None = None
    user_id: str | None = None              # required for server-to-server callers


class SandboxCheckoutResponse(BaseModel):
    """Response from ``POST /sandbox/checkout``."""
    model_config = _cfg

    checkout_url: str
    transaction_id: str


class SandboxTransactionItem(BaseModel):
    """A single row in ``GET /sandbox/transactions``."""
    model_config = _cfg

    id: str
    type: str                               # "CREDIT_PACKAGE" | "SUBSCRIPTION"
    product_id: str
    amount: int
    currency: str
    status: str
    delivered: bool
    created_at: str


class SandboxTransactionsResponse(BaseModel):
    """Response from ``GET /sandbox/transactions``."""
    model_config = _cfg

    transactions: list[SandboxTransactionItem]


class SandboxClaimRequest(BaseModel):
    """Request body for ``POST /sandbox/claim``."""
    model_config = _cfg

    transaction_id: str
    user_id: str | None = None              # required for server-to-server callers


class SandboxClaimResponse(BaseModel):
    """Response from ``POST /sandbox/claim``."""
    model_config = _cfg

    claimed: bool
    credit_amount: int | None = None
