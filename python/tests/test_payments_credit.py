# tests/test_payments_credit.py
"""Tests for the Payments credit / packages / subscription-details / sandbox methods."""
from __future__ import annotations

import asyncio
import json
import uuid

import httpx
import pytest
import respx


def body_json(request: httpx.Request) -> dict:
    """Parse a mocked request's JSON body (httpx.Request has no .json())."""
    return json.loads(request.content or b"null")

from ppussh import PpusshClient

GATEWAY = "https://api.example.com"
FRONTEND = "https://accounts.example.com"
PAYMENTS = f"{GATEWAY}/payments"

PACKAGE = {
    "id": "pack_waitly_500",
    "product_id": str(uuid.uuid4()),
    "credit_amount": 500,
    "price_cents": 4900,
    "currency": "USD",
    "provider_price_ids": {"paddle": "pri_01abc"},
    "is_active": True,
    "created_at": "2026-01-01T00:00:00Z",
}

TRANSACTION = {
    "id": str(uuid.uuid4()),
    "user_id": str(uuid.uuid4()),
    "product_id": str(uuid.uuid4()),
    "package_id": "pack_waitly_500",
    "credit_amount": 500,
    "amount_paid_cents": 4900,
    "status": "PAID",
    "delivered": False,
    "delivered_at": None,
    "provider": "paddle",
    "provider_tx_id": "txn_01abc",
    "created_at": "2026-01-01T00:00:00Z",
}

SUBSCRIPTION = {
    "id": str(uuid.uuid4()),
    "customer_id": str(uuid.uuid4()),
    "plan_id": str(uuid.uuid4()),
    "provider": "paddle",
    "provider_subscription_ids": {"paddle": "sub_01abc"},
    "status": "active",
    "current_period_start": "2026-01-01T00:00:00Z",
    "current_period_end": "2026-02-01T00:00:00Z",
    "cancelled_at": None,
    "trial_ends_at": None,
    "checkout_url": None,
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
}


@pytest.fixture
def client() -> PpusshClient:
    return PpusshClient(
        client_id="client-1",
        client_secret="secret-1",
        gateway_url=GATEWAY,
        accounts_frontend_url=FRONTEND,
        payments_product_key="product-key-1",
        payments_admin_key="admin-key-1",
    )


# ── initiate_checkout / claim / unclaimed ─────────────────────────────────────


async def test_initiate_checkout_posts_user_id(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{PAYMENTS}/checkout").mock(
            return_value=httpx.Response(
                200,
                json={"checkout_url": "https://pay.example.com/c", "transaction_id": "tx-1"},
            )
        )

        result = await client.payments.initiate_checkout(
            "pack_waitly_500",
            user_id=user_id,
            idempotency_key="key-1",
        )

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        sent = body_json(route.calls[0].request)
        assert sent["package_id"] == "pack_waitly_500"
        assert sent["user_id"] == user_id
        assert sent["idempotency_key"] == "key-1"
        assert result.transaction_id == "tx-1"


async def test_claim_transaction_posts_user_id(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    tx_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{PAYMENTS}/transactions/{tx_id}/claim").mock(
            return_value=httpx.Response(200, json={"claimed": True, "credit_amount": 500})
        )

        result = await client.payments.claim_transaction(user_id, tx_id)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        assert body_json(route.calls[0].request) == {"user_id": user_id}
        assert result.claimed is True
        assert result.credit_amount == 500


async def test_get_unclaimed_transactions_sends_user_param(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.get(f"{PAYMENTS}/transactions/unclaimed").mock(
            return_value=httpx.Response(200, json=[TRANSACTION])
        )

        result = await client.payments.get_unclaimed_transactions(user_id)

        router.assert_all_called()
        assert route.calls[0].request.url.params["user_id"] == user_id
        assert result[0].status == "PAID"
        assert result[0].delivered is False


# ── Packages (admin) ───────────────────────────────────────────────────────────


async def test_list_packages_uses_product_key_and_filter(client: PpusshClient) -> None:
    product_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.get(f"{PAYMENTS}/admin/packages").mock(
            return_value=httpx.Response(200, json=[PACKAGE])
        )

        result = await client.payments.list_packages(product_id=product_id)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        assert route.calls[0].request.url.params["product_id"] == product_id
        assert result[0].id == "pack_waitly_500"
        assert result[0].price_cents == 4900


async def test_get_package(client: PpusshClient) -> None:
    async with respx.mock() as router:
        route = router.get(f"{PAYMENTS}/admin/packages/pack_waitly_500").mock(
            return_value=httpx.Response(200, json=PACKAGE)
        )

        result = await client.payments.get_package("pack_waitly_500")

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        assert result.credit_amount == 500


async def test_create_package_posts_snake_case_body(client: PpusshClient) -> None:
    product_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{PAYMENTS}/admin/packages").mock(
            return_value=httpx.Response(201, json=PACKAGE)
        )

        result = await client.payments.create_package(
            package_id="pack_waitly_500",
            product_id=product_id,
            credit_amount=500,
            price_cents=4900,
            provider_price_ids={"paddle": "pri_01abc"},
        )

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        sent = body_json(route.calls[0].request)
        assert sent == {
            "id": "pack_waitly_500",
            "product_id": product_id,
            "credit_amount": 500,
            "price_cents": 4900,
            "currency": "USD",
            "provider_price_ids": {"paddle": "pri_01abc"},
            "is_active": True,
        }
        assert result.is_active is True


async def test_update_package_patches_only_provided_fields(client: PpusshClient) -> None:
    async with respx.mock() as router:
        route = router.patch(f"{PAYMENTS}/admin/packages/pack_waitly_500").mock(
            return_value=httpx.Response(200, json={**PACKAGE, "price_cents": 3900})
        )

        result = await client.payments.update_package("pack_waitly_500", price_cents=3900)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        assert body_json(route.calls[0].request) == {"price_cents": 3900}
        assert result.price_cents == 3900


# ── Subscription details ───────────────────────────────────────────────────────


async def test_get_subscription_details(client: PpusshClient) -> None:
    sub_id = str(uuid.uuid4())
    body = {
        "subscription": SUBSCRIPTION,
        "billing_history": [
            {
                "invoice_id": str(uuid.uuid4()),
                "amount_cents": 4900,
                "currency": "USD",
                "paid_at": "2026-01-15T00:00:00Z",
                "status": "paid",
            }
        ],
    }
    async with respx.mock() as router:
        route = router.get(f"{PAYMENTS}/subscriptions/{sub_id}/details").mock(
            return_value=httpx.Response(200, json=body)
        )

        result = await client.payments.get_subscription_details(sub_id)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Product-Key"] == "product-key-1"
        assert result.subscription.status == "active"
        assert result.billing_history[0].amount_cents == 4900


# ── Sandbox ────────────────────────────────────────────────────────────────────


async def test_sandbox_checkout_posts_user_id(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{PAYMENTS}/sandbox/checkout").mock(
            return_value=httpx.Response(
                200,
                json={"checkout_url": "https://sandbox.example.com/c", "transaction_id": "stx-1"},
            )
        )

        result = await client.payments.sandbox_checkout(
            product_accounts_id=str(uuid.uuid4()),
            item_type="CREDIT_PACKAGE",
            price_id="pack_waitly_500",
            user_id=user_id,
        )

        router.assert_all_called()
        sent = body_json(route.calls[0].request)
        assert sent["product_accounts_id"]
        assert sent["item_type"] == "CREDIT_PACKAGE"
        assert sent["price_id"] == "pack_waitly_500"
        assert sent["user_id"] == user_id
        assert result.transaction_id == "stx-1"


async def test_list_sandbox_transactions(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.get(f"{PAYMENTS}/sandbox/transactions").mock(
            return_value=httpx.Response(
                200,
                json={
                    "transactions": [
                        {
                            "id": str(uuid.uuid4()),
                            "type": "CREDIT_PACKAGE",
                            "product_id": str(uuid.uuid4()),
                            "amount": 4900,
                            "currency": "USD",
                            "status": "PAID",
                            "delivered": False,
                            "created_at": "2026-01-01T00:00:00Z",
                        }
                    ]
                },
            )
        )

        result = await client.payments.list_sandbox_transactions(user_id, limit=50)

        router.assert_all_called()
        assert route.calls[0].request.url.params["user_id"] == user_id
        assert route.calls[0].request.url.params["limit"] == "50"
        assert result.transactions[0].status == "PAID"


async def test_claim_sandbox_transaction(client: PpusshClient) -> None:
    user_id = str(uuid.uuid4())
    tx_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{PAYMENTS}/sandbox/claim").mock(
            return_value=httpx.Response(200, json={"claimed": True, "credit_amount": 500})
        )

        result = await client.payments.claim_sandbox_transaction(user_id, tx_id)

        router.assert_all_called()
        assert body_json(route.calls[0].request) == {
            "transaction_id": tx_id,
            "user_id": user_id,
        }
        assert result.claimed is True


# ── Missing key guards ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "call",
    [
        lambda c: c.payments.initiate_checkout("pack", user_id="u-1"),
        lambda c: c.payments.claim_transaction("u-1", "tx-1"),
        lambda c: c.payments.get_unclaimed_transactions("u-1"),
        lambda c: c.payments.list_packages(),
        lambda c: c.payments.get_package("pack"),
        lambda c: c.payments.create_package(
            package_id="pack", product_id="prod", credit_amount=1, price_cents=100
        ),
        lambda c: c.payments.update_package("pack", price_cents=200),
    ],
)
def test_credit_methods_raise_without_any_key(call) -> None:
    client = PpusshClient(
        client_id="client-1",
        client_secret="secret-1",
        gateway_url=GATEWAY,
        accounts_frontend_url=FRONTEND,
    )

    with pytest.raises(ValueError, match="admin_key or a payments_product_key"):
        asyncio.run(call(client))
