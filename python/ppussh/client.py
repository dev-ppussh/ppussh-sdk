# ppussh/client.py
"""
PpusshClient — the unified entry point for the PPUSSH Ecosystem SDK.

The gateway is the single API entry point.  Pass ``gateway_url`` and the SDK
routes accounts requests to the gateway root and payments requests to
``gateway_url + "/payments"``.

Usage
-----
Minimal — just client_id + client_secret:

    from ppussh import PpusshClient

    client = PpusshClient(
        client_id="your-product-client-id",
        client_secret="your-product-client-secret",
        gateway_url="https://api.example.com",
        accounts_frontend_url="https://accounts.example.com",
        payments_product_key="your-payments-product-key",  # optional
    )

    # OIDC callback — the product issues its own session cookies from the token.
    async def handle_callback(code: str, redirect_uri: str):
        token = await client.accounts.exchange_code(code, redirect_uri=redirect_uri)
        return token.user.id

    # Billing
    customer = await client.payments.create_customer(owner_user_id="...")

For long-lived services (FastAPI app lifespan, etc.), call ``await client.aclose()``
on shutdown instead.
"""
from __future__ import annotations

import os
from typing import Final

from ppussh._http import HttpTransport
from ppussh.accounts.namespace import AccountsNamespace
from ppussh.payments.namespace import PaymentsNamespace

# ── Environment variable names ─────────────────────────────────────────────────
_ENV_GATEWAY_URL: Final = "PPUSSH_GATEWAY_URL"
_ENV_ACCOUNTS_FRONTEND_URL: Final = "PPUSSH_ACCOUNTS_FRONTEND_URL"
_ENV_PAYMENTS_ADMIN_KEY: Final = "PPUSSH_PAYMENTS_ADMIN_KEY"


def _resolve_env(name: str) -> str | None:
    val = os.environ.get(name)
    return val.rstrip("/") if val else None


class PpusshClient:
    """
    Unified PPUSSH SDK client.

    Exposes two namespaces:
      ``client.accounts``  — login URL builder, OAuth code exchange
      ``client.payments``  — customers, subscriptions, plans, access checks

    Parameters
    ----------
    client_id:
        Your product's ``client_id`` UUID (from the Accounts admin console).
    client_secret:
        Your product's ``client_secret`` (from the Accounts admin console).
        **Never expose this in browser-side code.** Server-side only.
    gateway_url:
        The API gateway base URL — the single entry for all API calls.
        Falls back to ``PPUSSH_GATEWAY_URL``. **Required.**
        The SDK routes accounts calls to this URL and payments calls to
        ``gateway_url + "/payments"``.
    accounts_frontend_url:
        Accounts **frontend** base URL (the login page users are redirected to).
        Falls back to ``PPUSSH_ACCOUNTS_FRONTEND_URL``. **Required.**
    payments_product_key:
        Product API key for Payments. Used for customer, plan, and access
        operations. Optional — only needed when Payments is active.
        A ``ValueError`` is raised by the methods that need it if missing.
    payments_admin_key:
        Admin API key for Payments. Used for admin operations (product lookup,
        MRR analytics). Falls back to ``PPUSSH_PAYMENTS_ADMIN_KEY``. Optional.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        gateway_url: str | None = None,
        accounts_frontend_url: str | None = None,
        payments_product_key: str | None = None,
        payments_admin_key: str | None = None,
    ) -> None:
        if not client_id:
            raise ValueError("client_id must not be empty.")
        if not client_secret:
            raise ValueError("client_secret must not be empty.")

        self._gateway_url = (
            (gateway_url.rstrip("/") if gateway_url else None)
            or _resolve_env(_ENV_GATEWAY_URL)
        )
        if not self._gateway_url:
            raise ValueError(
                "gateway_url is required. "
                "Pass it as a constructor argument or set the "
                "PPUSSH_GATEWAY_URL environment variable."
            )

        self._accounts_frontend_url = (
            (accounts_frontend_url.rstrip("/") if accounts_frontend_url else None)
            or _resolve_env(_ENV_ACCOUNTS_FRONTEND_URL)
        )
        if not self._accounts_frontend_url:
            raise ValueError(
                "accounts_frontend_url is required. "
                "Pass it as a constructor argument or set the "
                "PPUSSH_ACCOUNTS_FRONTEND_URL environment variable."
            )

        self._payments_admin_key = payments_admin_key or _resolve_env(_ENV_PAYMENTS_ADMIN_KEY)

        # Accounts transport hits the gateway root (gateway strips nothing for /users, /admin, /auth/*)
        self._accounts_transport = HttpTransport(self._gateway_url)
        # Payments transport hits gateway + /payments (gateway strips the /payments prefix)
        self._payments_transport = HttpTransport(f"{self._gateway_url}/payments")

        self.accounts = AccountsNamespace(
            self._accounts_transport,
            client_id=client_id,
            client_secret=client_secret,
            accounts_frontend_url=self._accounts_frontend_url,
        )
        self.payments = PaymentsNamespace(
            self._payments_transport,
            product_key=payments_product_key,
            admin_key=self._payments_admin_key,
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def aclose(self) -> None:
        """
        Close all underlying HTTP connections.

        Call this on application shutdown (e.g. FastAPI lifespan ``shutdown``
        event) to cleanly drain the connection pool.
        """
        await self._accounts_transport.aclose()
        await self._payments_transport.aclose()

    async def __aenter__(self) -> PpusshClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    # ── Introspection ──────────────────────────────────────────────────────────

    @property
    def gateway_url(self) -> str:
        """Resolved gateway base URL."""
        return self._gateway_url

    @property
    def accounts_frontend_url(self) -> str:
        """Resolved Accounts frontend service base URL."""
        return self._accounts_frontend_url

    @property
    def payments_admin_key(self) -> str | None:
        """Resolved Payments admin key, if configured."""
        return self._payments_admin_key

    def __repr__(self) -> str:
        return (
            f"PpusshClient("
            f"gateway_url={self._gateway_url!r}, "
            f"accounts_frontend_url={self._accounts_frontend_url!r})"
        )
