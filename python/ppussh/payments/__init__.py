# ppussh/payments/__init__.py
"""
Payments namespace — re-exports models for convenient top-level imports.

    from ppussh.payments import CustomerResponse, SubscriptionResponse, PlanResponse
"""
from __future__ import annotations

from ppussh.payments.models import (
    AccessResult,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CustomerCreateRequest,
    CustomerResponse,
    MRRByPlan,
    MRRByProduct,
    MRRResponse,
    PaddleConfigResponse,
    PaymentProductResponse,
    PlanResponse,
    SubscriptionCancelRequest,
    SubscriptionCreateRequest,
    SubscriptionListResponse,
    SubscriptionResponse,
)
from ppussh.payments.namespace import PaymentsNamespace

__all__ = [
    "PaymentsNamespace",
    # Models
    "AccessResult",
    "CheckoutSessionRequest",
    "CheckoutSessionResponse",
    "CustomerCreateRequest",
    "CustomerResponse",
    "MRRByPlan",
    "MRRByProduct",
    "MRRResponse",
    "PaddleConfigResponse",
    "PaymentProductResponse",
    "PlanResponse",
    "SubscriptionCancelRequest",
    "SubscriptionCreateRequest",
    "SubscriptionListResponse",
    "SubscriptionResponse",
]
