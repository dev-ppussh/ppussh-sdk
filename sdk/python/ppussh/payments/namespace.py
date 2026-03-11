# ppussh/payments/namespace.py
"""
PaymentsNamespace — customer, subscription, and plan operations.

Auth model
----------
- Customer + subscription endpoints (POST /customers, POST /subscriptions, etc.)
  are unauthenticated at the HTTP level — the Payments service validates the
  owner_user_id against Accounts internally.
- Admin endpoints (list_plans, get_mrr) require the payments ADMIN_API_KEY
  sent as the ``X-Admin-Key`` header. This is set once at PpusshClient
  construction time via ``payments_admin_key``.

Idempotency
-----------
``create_subscription()`` requires a caller-supplied ``idempotency_key``.
Retry with the *same* key after a 502 (provider unavailable) — the server
guarantees exactly-once creation if the key matches.
``create_customer()`` is idempotent on (owner_user_id, workspace_id) — no key needed.
"""
from __future__ import annotations

import logging
from typing import Any

from ppussh._http import HttpTransport
from ppussh.payments.models import (
    CustomerCreateRequest,
    CustomerResponse,
    MRRResponse,
    PaymentProductResponse,
    PlanResponse,
    SubscriptionCancelRequest,
    SubscriptionCreateRequest,
    SubscriptionListResponse,
    SubscriptionResponse,
)

logger = logging.getLogger(__name__)


class PaymentsNamespace:
    """
    Access via ``client.payments``.

    All methods are coroutines — use ``await``.
    """

    def __init__(
        self,
        transport: HttpTransport,
        *,
        admin_key: str | None = None,
    ) -> None:
        self._http = transport
        self._admin_key = admin_key

    # ── Customers ──────────────────────────────────────────────────────────────

    async def create_customer(
        self,
        owner_user_id: str,
        *,
        workspace_id: str | None = None,
        billing_email: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> CustomerResponse:
        """
        Create (or retrieve) a Payments customer for a PPUSSH user.

        This operation is idempotent on ``(owner_user_id, workspace_id)``:
        if a customer already exists for that pair, the existing record is
        returned without creating a duplicate.

        The Payments service verifies that ``owner_user_id`` exists in the
        Accounts service before persisting. Pass a UUID string.

        Parameters
        ----------
        owner_user_id:  UUID string of the Accounts user (from TokenResponse.user.id).
        workspace_id:   UUID string of the workspace, or None for a personal account.
        billing_email:  Optional billing email — falls back to the user's account email.
        metadata:       Arbitrary key/value pairs stored alongside the customer record.

        Returns
        -------
        CustomerResponse

        Raises
        ------
        PpusshPaymentError  code="accounts_user_not_found" if owner_user_id doesn't exist.
        PpusshNetworkError  If the request fails after all retries.
        """
        body = CustomerCreateRequest(
            owner_user_id=owner_user_id,
            workspace_id=workspace_id,
            billing_email=billing_email,
            metadata=metadata,
        )
        response = await self._http.request(
            "POST",
            "/customers",
            json=body.model_dump(exclude_none=True),
            is_payments=True,
        )
        customer = CustomerResponse.model_validate(response.json())
        logger.debug("ppussh: customer ready id=%s", customer.id)
        return customer

    async def get_customer(self, customer_id: str) -> CustomerResponse:
        """
        Retrieve a Payments customer by their Payments UUID.

        Parameters
        ----------
        customer_id:  UUID string (from CustomerResponse.id).

        Raises
        ------
        PpusshPaymentError  code="customer_not_found" on 404.
        """
        response = await self._http.request(
            "GET",
            f"/customers/{customer_id}",
            is_payments=True,
        )
        return CustomerResponse.model_validate(response.json())

    # ── Subscriptions ──────────────────────────────────────────────────────────

    async def create_subscription(
        self,
        *,
        customer_id: str,
        payment_product_id: str,
        plan_key: str,
        idempotency_key: str,
        provider: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SubscriptionResponse:
        """
        Create a subscription for a customer on a billing plan.

        This is the core billing operation. The Payments service:
        1. Validates the customer exists.
        2. Resolves the plan by ``plan_key`` within the product.
        3. Verifies the user holds an Accounts entitlement for the product.
        4. Lazily creates a provider customer (Paddle / Dodo) if needed.
        5. Calls the provider API to create the subscription.
        6. Persists the result and returns it.

        The operation is idempotent on ``idempotency_key``. On a 502
        (provider unavailable), retry with the **same key** — this is safe
        and guaranteed to produce at most one subscription.

        Parameters
        ----------
        customer_id:          UUID from ``create_customer()``.
        payment_product_id:   UUID of the PaymentProduct (from the admin console).
        plan_key:             Plan identifier, e.g. ``"pro"`` or ``"enterprise"``.
        idempotency_key:      Unique string per subscription attempt (use UUID v4).
        provider:             ``"paddle"`` | ``"dodo"`` | None (uses plan default).
        metadata:             Arbitrary key/value pairs.

        Returns
        -------
        SubscriptionResponse

        Raises
        ------
        PpusshPaymentError  Various codes — see error.code for specifics:
                            "customer_not_found", "plan_not_found",
                            "entitlement_required", "provider_unavailable", etc.
        PpusshNetworkError  If all retries are exhausted.
        """
        body = SubscriptionCreateRequest(
            customer_id=customer_id,
            payment_product_id=payment_product_id,
            plan_key=plan_key,
            idempotency_key=idempotency_key,
            provider=provider,
            metadata=metadata,
        )
        response = await self._http.request(
            "POST",
            "/subscriptions",
            json=body.model_dump(exclude_none=True),
            is_payments=True,
        )
        sub = SubscriptionResponse.model_validate(response.json())
        logger.debug(
            "ppussh: subscription created id=%s status=%s provider=%s",
            sub.id, sub.status, sub.provider,
        )
        return sub

    async def list_subscriptions(
        self,
        customer_id: str,
        *,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> SubscriptionListResponse:
        """
        List subscriptions for a customer, with optional status filter.

        Parameters
        ----------
        customer_id:  UUID string.
        status:       Filter by status: "active", "cancelled", "trialing", etc.
        page:         1-indexed page number.
        page_size:    Number of results per page (max 100).

        Returns
        -------
        SubscriptionListResponse  with ``items``, ``total``, ``page``, ``page_size``.
        """
        params: dict[str, Any] = {
            "customer_id": customer_id,
            "page": page,
            "page_size": page_size,
        }
        if status:
            params["status"] = status

        response = await self._http.request(
            "GET",
            "/subscriptions",
            params=params,
            is_payments=True,
        )
        return SubscriptionListResponse.model_validate(response.json())

    async def get_subscription(self, subscription_id: str) -> SubscriptionResponse:
        """
        Retrieve a single subscription by its Payments UUID.

        Raises
        ------
        PpusshPaymentError  code="subscription_not_found" on 404.
        """
        response = await self._http.request(
            "GET",
            f"/subscriptions/{subscription_id}",
            is_payments=True,
        )
        return SubscriptionResponse.model_validate(response.json())

    async def cancel_subscription(
        self,
        subscription_id: str,
        *,
        cancel_immediately: bool = False,
    ) -> SubscriptionResponse:
        """
        Cancel a subscription.

        This operation is idempotent — cancelling an already-cancelled
        subscription returns the existing record without error.

        Parameters
        ----------
        subscription_id:    UUID string.
        cancel_immediately: If True, cancel at once. If False (default),
                            cancel at end of the current billing period.

        Returns
        -------
        SubscriptionResponse with updated status.
        """
        body = SubscriptionCancelRequest(cancel_immediately=cancel_immediately)
        response = await self._http.request(
            "DELETE",
            f"/subscriptions/{subscription_id}",
            json=body.model_dump(),
            is_payments=True,
        )
        return SubscriptionResponse.model_validate(response.json())

    # ── Plans (admin) ──────────────────────────────────────────────────────────

    async def list_plans(self, payment_product_id: str) -> list[PlanResponse]:
        """
        List all billing plans for a Payments product.

        Requires the ``payments_admin_key`` set on PpusshClient construction.
        Plans with status ``"archived"`` are included — filter client-side if needed.

        Parameters
        ----------
        payment_product_id:  UUID string of the PaymentProduct.

        Returns
        -------
        list[PlanResponse]  ordered by created_at descending.

        Raises
        ------
        PpusshPaymentError   code="product_not_found" on 404.
        ValueError           If no payments_admin_key was provided at construction.
        """
        self._require_admin_key("list_plans")
        response = await self._http.request(
            "GET",
            f"/admin/products/{payment_product_id}/plans",
            headers={"X-Admin-Key": self._admin_key},  # type: ignore[arg-type]
            is_payments=True,
        )
        return [PlanResponse.model_validate(p) for p in response.json()]

    async def get_product_by_accounts_id(
        self,
        accounts_product_id: str,
    ) -> PaymentProductResponse | None:
        """
        Look up a Payments product by its Accounts product ID.

        Returns None if the product has not yet been registered in Payments
        (HTTP 404 is treated as a non-exceptional "not registered yet" state).

        Parameters
        ----------
        accounts_product_id:  UUID string from the Accounts admin console.

        Raises
        ------
        ValueError  If no payments_admin_key was provided at construction.
        """
        self._require_admin_key("get_product_by_accounts_id")
        from ppussh.errors import PpusshPaymentError
        try:
            response = await self._http.request(
                "GET",
                f"/admin/products/by-accounts-id/{accounts_product_id}",
                headers={"X-Admin-Key": self._admin_key},  # type: ignore[arg-type]
                is_payments=True,
            )
        except PpusshPaymentError as exc:
            if exc.status_code == 404:
                return None
            raise
        return PaymentProductResponse.model_validate(response.json())

    # ── Analytics (admin) ──────────────────────────────────────────────────────

    async def get_mrr(
        self,
        *,
        product_id: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> MRRResponse:
        """
        Fetch Monthly Recurring Revenue breakdown.

        Requires ``payments_admin_key``.

        Parameters
        ----------
        product_id:   Filter to a specific product UUID (optional).
        start_date:   ISO date string, e.g. ``"2025-01-01"`` (optional).
        end_date:     ISO date string, e.g. ``"2025-12-31"`` (optional).

        Returns
        -------
        MRRResponse  with total_mrr_cents, by_product, and by_plan breakdowns.
        """
        self._require_admin_key("get_mrr")
        params: dict[str, Any] = {}
        if product_id:
            params["product_id"] = product_id
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date

        response = await self._http.request(
            "GET",
            "/admin/analytics/mrr",
            headers={"X-Admin-Key": self._admin_key},  # type: ignore[arg-type]
            params=params,
            is_payments=True,
        )
        return MRRResponse.model_validate(response.json())

    # ── Billing portal (stub) ──────────────────────────────────────────────────

    async def get_billing_portal(
        self,
        customer_id: str,
        *,
        return_url: str | None = None,
    ) -> str:
        """
        Generate a hosted billing portal URL for a customer.

        .. note::
            This feature is not yet implemented in the Payments backend.
            A ``NotImplementedError`` is raised until the endpoint exists.

        Parameters
        ----------
        customer_id:  UUID string.
        return_url:   URL to redirect the customer back to after they exit the portal.

        Returns
        -------
        str  The portal URL to redirect the user to.
        """
        raise NotImplementedError(
            "get_billing_portal() is not yet available. "
            "The Payments backend endpoint has not been implemented. "
            "Track progress in payments/readme.md."
        )

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _require_admin_key(self, method: str) -> None:
        if not self._admin_key:
            raise ValueError(
                f"payments.{method}() requires a payments_admin_key. "
                "Pass payments_admin_key='...' to PpusshClient()."
            )
