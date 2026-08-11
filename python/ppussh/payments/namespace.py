# ppussh/payments/namespace.py
"""
PaymentsNamespace — customer, subscription, and plan operations.

Auth model
----------
- All endpoints accept either X-Admin-Key or X-Product-Key header.
- Product API key is scoped to a specific product.
- Get the product key from the Payments section in the Accounts admin console.

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
    AccessResult,
    CheckoutResponse,
    CheckoutSessionResponse,
    ClaimResponse,
    CustomerCreateRequest,
    CustomerResponse,
    MRRResponse,
    PackageCreateRequest,
    PackageResponse,
    PackageUpdateRequest,
    PaddleConfigResponse,
    PaymentProductResponse,
    PlanResponse,
    SandboxCheckoutResponse,
    SandboxClaimResponse,
    SandboxTransactionsResponse,
    SubscriptionBillingDetails,
    SubscriptionCancelRequest,
    SubscriptionCreateRequest,
    SubscriptionListResponse,
    SubscriptionResponse,
    TransactionResponse,
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
        product_key: str | None = None,
        admin_key: str | None = None,
    ) -> None:
        self._http = transport
        self._product_key = product_key
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
            headers=self._get_auth_headers(),
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
            headers=self._get_auth_headers(),
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
        return_url: str | None = None,
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
            return_url=return_url,
        )
        response = await self._http.request(
            "POST",
            "/subscriptions",
            json=body.model_dump(exclude_none=True),
            headers=self._get_auth_headers(),
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
            headers=self._get_auth_headers(),
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
            headers=self._get_auth_headers(),
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
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return SubscriptionResponse.model_validate(response.json())

    # ── Plans (admin) ──────────────────────────────────────────────────────────

    async def list_plans(self, payment_product_id: str) -> list[PlanResponse]:
        """
        List all billing plans for a Payments product.

        Uses ``payments_admin_key`` if configured (lists plans for any product);
        otherwise falls back to ``payments_product_key`` (must match the product).

        Parameters
        ----------
        payment_product_id:  UUID string of the PaymentProduct.

        Returns
        -------
        list[PlanResponse]  ordered by created_at descending.

        Raises
        ------
        PpusshPaymentError   code="product_not_found" on 404.
        ValueError           If neither ``payments_admin_key`` nor
                             ``payments_product_key`` was provided.
        """
        self._require_any_key("list_plans")
        response = await self._http.request(
            "GET",
            f"/products/{payment_product_id}/plans",
            headers=self._get_auth_headers(),
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

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback).

        Parameters
        ----------
        accounts_product_id:  UUID string from the Accounts admin console.

        Raises
        ------
        ValueError  If no product (or admin) key was provided at construction.
        """
        self._require_any_key("get_product_by_accounts_id")
        from ppussh.errors import PpusshPaymentError
        try:
            response = await self._http.request(
                "GET",
                f"/admin/products/by-accounts-id/{accounts_product_id}",
                headers=self._get_auth_headers(),
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

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback). Product keys are scoped to their own
        product.

        Parameters
        ----------
        product_id:   Filter to a specific product UUID (optional).
        start_date:   ISO date string, e.g. ``"2025-01-01"`` (optional).
        end_date:     ISO date string, e.g. ``"2025-12-31"`` (optional).

        Returns
        -------
        MRRResponse  with total_mrr_cents, by_product, and by_plan breakdowns.
        """
        self._require_any_key("get_mrr")
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
            headers=self._get_auth_headers(),
            params=params,
            is_payments=True,
        )
        return MRRResponse.model_validate(response.json())

    # ── Credit purchases (one-time) ──────────────────────────────────────────────

    async def initiate_checkout(
        self,
        package_id: str,
        *,
        user_id: str,
        return_url: str = "http://localhost:3000/checkout/success",
        idempotency_key: str | None = None,
    ) -> CheckoutResponse:
        """
        Start a one-time credit purchase checkout for a user.

        Returns a checkout URL and transaction ID.  The caller redirects the
        user to the checkout URL to complete payment.  After payment, the
        product backend calls ``claim_transaction()`` to atomically claim
        the credits.

        Server-to-server: the SDK authenticates with X-Admin-Key /
        X-Product-Key and passes ``user_id`` explicitly (the user does not
        need to be logged in).

        Parameters
        ----------
        package_id:       Package identifier (e.g. ``"pack_waitly_500"``).
        user_id:          UUID string of the Accounts user purchasing credits.
        return_url:       URL to redirect after checkout completes.
        idempotency_key:  Optional idempotency key (UUID v4).

        Returns
        -------
        CheckoutResponse with ``checkout_url`` and ``transaction_id``.
        """
        self._require_any_key("initiate_checkout")
        body: dict[str, str] = {
            "package_id": package_id,
            "return_url": return_url,
            "user_id": user_id,
        }
        if idempotency_key:
            body["idempotency_key"] = idempotency_key

        response = await self._http.request(
            "POST",
            "/checkout",
            json=body,
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return CheckoutResponse.model_validate(response.json())

    async def claim_transaction(
        self,
        user_id: str,
        transaction_id: str,
    ) -> ClaimResponse:
        """
        Atomically claim a paid transaction (server-to-server only).

        Call this from the product backend after the user confirms purchase.
        If the transaction is PAID and not yet delivered, it is marked
        ``delivered=True`` and the credit amount is returned for the product
        backend to grant to the user's local balance.

        Parameters
        ----------
        user_id:          UUID string of the Accounts user.
        transaction_id:   UUID string of the transaction to claim.

        Returns
        -------
        ClaimResponse with ``claimed: bool`` and optional ``credit_amount``.

        Raises
        ------
        PpusshPaymentError  On 403 (server-to-server auth required) or 404.
        """
        self._require_any_key("claim_transaction")
        body = {"user_id": user_id}
        response = await self._http.request(
            "POST",
            f"/transactions/{transaction_id}/claim",
            json=body,
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return ClaimResponse.model_validate(response.json())

    async def get_unclaimed_transactions(self, user_id: str) -> list[TransactionResponse]:
        """
        List all PAID + undelivered transactions for a user.

        Server-to-server: the SDK authenticates with X-Admin-Key /
        X-Product-Key and passes ``user_id`` explicitly (the user does not
        need to be logged in).

        Parameters
        ----------
        user_id:  UUID string of the Accounts user.

        Returns
        -------
        list[TransactionResponse]
        """
        self._require_any_key("get_unclaimed_transactions")
        response = await self._http.request(
            "GET",
            "/transactions/unclaimed",
            params={"user_id": user_id},
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return [TransactionResponse.model_validate(t) for t in response.json()]

    # ── Credit packages ────────────────────────────────────────────────────────

    async def list_packages(self, *, product_id: str | None = None) -> list[PackageResponse]:
        """
        List credit packages.

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback). Product keys are scoped to their own
        product.

        Parameters
        ----------
        product_id:  Optional payments product UUID string to filter by.

        Returns
        -------
        list[PackageResponse]
        """
        self._require_any_key("list_packages")
        params: dict[str, str] = {}
        if product_id:
            params["product_id"] = product_id
        response = await self._http.request(
            "GET",
            "/admin/packages",
            headers=self._get_auth_headers(),
            params=params,
            is_payments=True,
        )
        return [PackageResponse.model_validate(p) for p in response.json()]

    async def get_package(self, package_id: str) -> PackageResponse:
        """
        Get a single credit package by its ID.

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback).

        Parameters
        ----------
        package_id:  Package identifier (e.g. ``"pack_waitly_500"``).

        Returns
        -------
        PackageResponse
        """
        self._require_any_key("get_package")
        response = await self._http.request(
            "GET",
            f"/admin/packages/{package_id}",
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return PackageResponse.model_validate(response.json())

    async def create_package(
        self,
        *,
        package_id: str,
        product_id: str,
        credit_amount: int,
        price_cents: int,
        currency: str = "USD",
        provider_price_ids: dict[str, str] | None = None,
        is_active: bool = True,
    ) -> PackageResponse:
        """
        Create a credit package.

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback). Product keys can only create
        packages for their own product.

        Parameters
        ----------
        package_id:        Unique string identifier, e.g. ``"pack_waitly_500"``.
        product_id:        Payments product UUID string.
        credit_amount:     Number of credits the package grants.
        price_cents:       Price in integer cents (never float/Decimal).
        currency:          ISO 4217 currency code (default "USD").
        provider_price_ids: Optional provider price map, e.g.
                           ``{"paddle": "pri_...", "dodo": "price_..."}``.
        is_active:         Whether the package is purchasable (default True).

        Returns
        -------
        PackageResponse
        """
        self._require_any_key("create_package")
        body = PackageCreateRequest(
            id=package_id,
            product_id=product_id,
            credit_amount=credit_amount,
            price_cents=price_cents,
            currency=currency,
            provider_price_ids=provider_price_ids or {},
            is_active=is_active,
        )
        response = await self._http.request(
            "POST",
            "/admin/packages",
            json=body.model_dump(),
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return PackageResponse.model_validate(response.json())

    async def update_package(
        self,
        package_id: str,
        *,
        credit_amount: int | None = None,
        price_cents: int | None = None,
        currency: str | None = None,
        provider_price_ids: dict[str, str] | None = None,
        is_active: bool | None = None,
    ) -> PackageResponse:
        """
        Update a credit package (only provided fields are changed).

        Authenticates with the ``payments_product_key`` (or an optional
        ``payments_admin_key`` fallback). Product keys can only update
        packages for their own product.

        Parameters
        ----------
        package_id:  Package identifier (e.g. ``"pack_waitly_500"``).
        credit_amount, price_cents, currency, provider_price_ids, is_active:
            Optional fields to update.

        Returns
        -------
        PackageResponse
        """
        self._require_any_key("update_package")
        body = PackageUpdateRequest(
            credit_amount=credit_amount,
            price_cents=price_cents,
            currency=currency,
            provider_price_ids=provider_price_ids,
            is_active=is_active,
        )
        response = await self._http.request(
            "PATCH",
            f"/admin/packages/{package_id}",
            json=body.model_dump(exclude_none=True),
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return PackageResponse.model_validate(response.json())

    # ── Subscription details / invoices ────────────────────────────────────────

    async def get_subscription_details(
        self,
        subscription_id: str,
    ) -> SubscriptionBillingDetails:
        """
        Get a subscription together with its billing history (invoices).

        Parameters
        ----------
        subscription_id:  UUID string of the subscription.

        Returns
        -------
        SubscriptionBillingDetails with ``subscription`` and ``billing_history``.
        """
        self._require_any_key("get_subscription_details")
        response = await self._http.request(
            "GET",
            f"/subscriptions/{subscription_id}/details",
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return SubscriptionBillingDetails.model_validate(response.json())

    # ── Sandbox ────────────────────────────────────────────────────────────────

    async def sandbox_checkout(
        self,
        *,
        product_accounts_id: str,
        item_type: str,
        price_id: str,
        user_id: str,
        return_url: str | None = None,
        idempotency_key: str | None = None,
    ) -> SandboxCheckoutResponse:
        """
        Generate a sandbox test checkout URL for a user.

        Server-to-server: the SDK authenticates with X-Admin-Key /
        X-Product-Key and passes ``user_id`` explicitly.

        Parameters
        ----------
        product_accounts_id:  Accounts product UUID string.
        item_type:            ``"CREDIT_PACKAGE"`` or ``"SUBSCRIPTION"``.
        price_id:             Package ID (credit) or Plan UUID (subscription).
        user_id:              UUID string of the Accounts user.
        return_url:           Optional redirect after checkout.
        idempotency_key:      Optional idempotency key.

        Returns
        -------
        SandboxCheckoutResponse with ``checkout_url`` and ``transaction_id``.
        """
        self._require_any_key("sandbox_checkout")
        body: dict[str, str] = {
            "product_accounts_id": product_accounts_id,
            "item_type": item_type,
            "price_id": price_id,
            "user_id": user_id,
        }
        if return_url:
            body["return_url"] = return_url
        if idempotency_key:
            body["idempotency_key"] = idempotency_key
        response = await self._http.request(
            "POST",
            "/sandbox/checkout",
            json=body,
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return SandboxCheckoutResponse.model_validate(response.json())

    async def list_sandbox_transactions(
        self,
        user_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> SandboxTransactionsResponse:
        """
        List a user's sandbox test transactions.

        Parameters
        ----------
        user_id:  UUID string of the Accounts user.
        limit:    Page size (1–100, default 20).
        offset:   Pagination offset (default 0).

        Returns
        -------
        SandboxTransactionsResponse
        """
        self._require_any_key("list_sandbox_transactions")
        params: dict[str, str | int] = {
            "user_id": user_id,
            "limit": limit,
            "offset": offset,
        }
        response = await self._http.request(
            "GET",
            "/sandbox/transactions",
            headers=self._get_auth_headers(),
            params=params,
            is_payments=True,
        )
        return SandboxTransactionsResponse.model_validate(response.json())

    async def claim_sandbox_transaction(
        self,
        user_id: str,
        transaction_id: str,
    ) -> SandboxClaimResponse:
        """
        Claim a PAID sandbox transaction (simulate delivery).

        Parameters
        ----------
        user_id:         UUID string of the Accounts user.
        transaction_id:  UUID string of the sandbox transaction.

        Returns
        -------
        SandboxClaimResponse with ``claimed`` and optional ``credit_amount``.
        """
        self._require_any_key("claim_sandbox_transaction")
        body = {
            "transaction_id": transaction_id,
            "user_id": user_id,
        }
        response = await self._http.request(
            "POST",
            "/sandbox/claim",
            json=body,
            headers=self._get_auth_headers(),
            is_payments=True,
        )
        return SandboxClaimResponse.model_validate(response.json())

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

    # ── Checkout session ──────────────────────────────────────────────────────────

    async def create_checkout_session(
        self,
        user_id: str,
        plan_id: str,
        return_url: str,
        idempotency_key: str,
        *,
        billing_email: str | None = None,
    ) -> CheckoutSessionResponse:
        """
        Create a checkout session that returns a portal URL for the centralized
        checkout portal SPA.

        The Payments service:
        1. Resolves or creates a Customer for the given ``user_id``.
        2. Verifies the user's Accounts entitlement for the plan's product.
        3. Creates a draft transaction at the provider (Paddle / Dodo).
        4. Returns a portal URL pointing to the checkout portal SPA.

        Parameters
        ----------
        user_id:           UUID string of the Accounts user.
        plan_id:           UUID string of the Payments Plan.
        return_url:        URL where the portal redirects after checkout completes.
        idempotency_key:   Unique string per checkout attempt (use UUID v4).
        billing_email:     Optional billing email — if not set, fetched from Accounts.

        Returns
        -------
        CheckoutSessionResponse with ``checkout_url`` (portal SPA URL).

        Raises
        ------
        PpusshPaymentError  Various codes — ``accounts_user_not_found``,
                            ``plan_not_found``, ``entitlement_required``, etc.
        PpusshNetworkError  If all retries are exhausted.
        """
        self._require_product_key("create_checkout_session")
        body: dict[str, str | None] = {
            "user_id": user_id,
            "plan_id": plan_id,
            "return_url": return_url,
            "idempotency_key": idempotency_key,
        }
        if billing_email is not None:
            body["billing_email"] = billing_email
        response = await self._http.request(
            "POST",
            "/subscriptions/checkout-session",
            json=body,
            headers={"X-Product-Key": self._product_key},  # type: ignore[arg-type]
            is_payments=True,
        )
        return CheckoutSessionResponse.model_validate(response.json())

    async def get_paddle_config(self) -> PaddleConfigResponse:
        """
        Get the Paddle client token and environment for the checkout portal.

        This endpoint is public — no product key required.

        Returns
        -------
        PaddleConfigResponse with ``client_token`` and ``environment``.
        """
        response = await self._http.request(
            "GET",
            "/subscriptions/paddle-config",
            is_payments=True,
        )
        return PaddleConfigResponse.model_validate(response.json())

    # ── Access check ────────────────────────────────────────────────────────────

    async def check_access(
        self,
        user_id: str,
        feature_code: str,
        *,
        workspace_id: str | None = None,
    ) -> AccessResult:
        """
        Check whether a user has access to a specific feature based on their
        active subscription's plan.

        The caller must be authenticated with a valid ``payments_product_key``
        that matches the product whose access is being checked.

        Parameters
        ----------
        user_id:       UUID string of the Accounts user.
        feature_code:  Feature code defined on the plan, e.g. ``"premium_nodes"``.
        workspace_id:  Optional workspace UUID — required for workspace-scoped billing.

        Returns
        -------
        AccessResult with ``has_access``, ``feature_name``, and ``limit``.

        Example
        -------
        .. code-block:: python

            access = await ppussh.payments.check_access(
                user_id=user.id,
                feature_code="premium_nodes",
            )
            if not access.has_access:
                raise HTTPException(403, f"Upgrade required for {access.feature_name}")
        """
        self._require_product_key("check_access")
        body = {
            "user_id": user_id,
            "feature_code": feature_code,
            "workspace_id": workspace_id,
        }
        response = await self._http.request(
            "POST",
            "/access/check",
            json=body,
            headers={"X-Product-Key": self._product_key},  # type: ignore[arg-type]
            is_payments=True,
        )
        return AccessResult.model_validate(response.json())

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _get_auth_headers(self) -> dict[str, str]:
        if self._product_key:
            return {"X-Product-Key": self._product_key}
        if self._admin_key:
            return {"X-Admin-Key": self._admin_key}
        return {}

    def _require_product_key(self, method: str) -> None:
        if not self._product_key:
            raise ValueError(
                f"payments.{method}() requires a payments_product_key. "
                "Payments may be inactive for your product — pass "
                "payments_product_key='...' to PpusshClient() to enable "
                "plans, checkout, and access checks."
            )

    def _require_any_key(self, method: str) -> None:
        if not self._admin_key and not self._product_key:
            raise ValueError(
                f"payments.{method}() requires either a payments_admin_key "
                "or a payments_product_key. Pass one to PpusshClient()."
            )
