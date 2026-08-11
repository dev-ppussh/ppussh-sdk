# tests/test_accounts_entitlements.py
"""Tests for the Accounts entitlement methods (server-to-server, admin key)."""
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

ENTITLEMENT_BODY = {
    "id": str(uuid.uuid4()),
    "product_id": str(uuid.uuid4()),
    "product_name": "Waitly",
    "product_slug": "waitly",
    "role": "member",
    "feature_flags": {"beta": True},
    "created_at": "2026-01-01T00:00:00Z",
}


@pytest.fixture
def client() -> PpusshClient:
    return PpusshClient(
        client_id="client-1",
        client_secret="secret-1",
        gateway_url=GATEWAY,
        accounts_frontend_url=FRONTEND,
        accounts_admin_key="admin-key-1",
    )


async def test_list_user_entitlements_sends_admin_key_and_user_path(
    client: PpusshClient,
) -> None:
    user_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.get(f"{GATEWAY}/admin/users/{user_id}/entitlements").mock(
            return_value=httpx.Response(200, json=[ENTITLEMENT_BODY])
        )

        result = await client.accounts.list_user_entitlements(user_id)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Admin-Key"] == "admin-key-1"
        assert result[0].product_name == "Waitly"
        assert result[0].feature_flags == {"beta": True}


async def test_grant_entitlement_posts_body_and_admin_key(
    client: PpusshClient,
) -> None:
    user_id = str(uuid.uuid4())
    product_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{GATEWAY}/admin/entitlements").mock(
            return_value=httpx.Response(201, json=ENTITLEMENT_BODY)
        )

        result = await client.accounts.grant_entitlement(
            user_id,
            product_id,
            role="admin",
            feature_flags={"founding": True},
        )

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Admin-Key"] == "admin-key-1"
        sent = body_json(route.calls[0].request)
        assert sent["user_id"] == user_id
        assert sent["product_id"] == product_id
        assert sent["role"] == "admin"
        assert sent["feature_flags"] == {"founding": True}
        assert result.role == "member"


async def test_grant_entitlement_omits_flags_when_none(
    client: PpusshClient,
) -> None:
    user_id = str(uuid.uuid4())
    product_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.post(f"{GATEWAY}/admin/entitlements").mock(
            return_value=httpx.Response(201, json=ENTITLEMENT_BODY)
        )

        await client.accounts.grant_entitlement(user_id, product_id)

        router.assert_all_called()
        sent = body_json(route.calls[0].request)
        assert sent == {"user_id": user_id, "product_id": product_id, "role": "member"}


async def test_update_entitlement_flags_patches_merge_map(
    client: PpusshClient,
) -> None:
    entitlement_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.patch(f"{GATEWAY}/admin/entitlements/{entitlement_id}").mock(
            return_value=httpx.Response(200, json=ENTITLEMENT_BODY)
        )

        result = await client.accounts.update_entitlement_flags(
            entitlement_id,
            {"beta": False, "founding": None},
        )

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Admin-Key"] == "admin-key-1"
        assert body_json(route.calls[0].request) == {
            "feature_flags": {"beta": False, "founding": None}
        }
        assert result.feature_flags == {"beta": True}


async def test_revoke_entitlement_deletes(client: PpusshClient) -> None:
    entitlement_id = str(uuid.uuid4())
    async with respx.mock() as router:
        route = router.delete(f"{GATEWAY}/admin/entitlements/{entitlement_id}").mock(
            return_value=httpx.Response(204)
        )

        result = await client.accounts.revoke_entitlement(entitlement_id)

        router.assert_all_called()
        assert route.calls[0].request.headers["X-Admin-Key"] == "admin-key-1"
        assert result is None


@pytest.mark.parametrize(
    "call",
    [
        lambda c: c.accounts.list_user_entitlements("user-1"),
        lambda c: c.accounts.grant_entitlement("user-1", "product-1"),
        lambda c: c.accounts.update_entitlement_flags("e-1", {"beta": True}),
        lambda c: c.accounts.revoke_entitlement("e-1"),
    ],
)
def test_entitlement_methods_raise_without_admin_key(call) -> None:
    client = PpusshClient(
        client_id="client-1",
        client_secret="secret-1",
        gateway_url=GATEWAY,
        accounts_frontend_url=FRONTEND,
    )

    with pytest.raises(ValueError, match="accounts_admin_key"):
        asyncio.run(call(client))
