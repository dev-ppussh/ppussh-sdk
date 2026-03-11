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
    created_at: datetime

    def amount_display(self) -> str:
        """Human-readable amount, e.g. '$29.00'."""
        major = self.amount_cents / 100
        return f"{major:,.2f} {self.currency}"


# ── Subscriptions ──────────────────────────────────────────────────────────────

class SubscriptionResponse(BaseModel):
    """Response from ``POST /subscriptions`` or ``GET /subscriptions/{id}``."""
    model_config = _cfg

    id: str                                   # UUID string
    customer_id: str                          # UUID string
    plan_id: str                              # UUID string
    provider: str                             # "paddle" | "dodo"
    provider_subscription_ids: dict[str, str]
    status: str                               # trialing|active|past_due|paused|cancelled|unpaid
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancelled_at: datetime | None = None
    trial_ends_at: datetime | None = None
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
