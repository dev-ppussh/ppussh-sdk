# ppussh/payments/__init__.py
"""
Payments namespace — re-exports models for convenient top-level imports.

    from ppussh.payments import CustomerResponse, SubscriptionResponse, PlanResponse
"""
from __future__ import annotations

from ppussh.payments.models import (
    CustomerCreateRequest,
    CustomerResponse,
    MRRByPlan,
    MRRByProduct,
    MRRResponse,
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
    "CustomerResponse",
    "CustomerCreateRequest",
    "PlanResponse",
    "SubscriptionResponse",
    "SubscriptionListResponse",
    "SubscriptionCreateRequest",
    "SubscriptionCancelRequest",
    "PaymentProductResponse",
    "MRRResponse",
    "MRRByProduct",
    "MRRByPlan",
]
