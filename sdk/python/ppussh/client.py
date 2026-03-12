# ppussh/client.py
"""
PpusshClient — the unified entry point for the PPUSSH Ecosystem SDK.

URL resolution order (highest → lowest priority):
  1. Explicit constructor kwarg (``accounts_url=``, ``payments_url=``)
  2. Environment variable (``PPUSSH_ACCOUNTS_URL``, ``PPUSSH_PAYMENTS_URL``)

Both URLs are **required** — a ``ValueError`` is raised at construction time if
neither a kwarg nor an env var is present for a given service.

Usage
-----
Minimal — just client_id + client_secret:

    import os
    from ppussh import PpusshClient

    os.environ["PPUSSH_ACCOUNTS_URL"] = "https://accounts.example.com"
    os.environ["PPUSSH_ACCOUNTS_FRONTEND_URL"] = "https://accounts.example.com"
    os.environ["PPUSSH_PAYMENTS_URL"] = "https://payments.example.com"

    client = PpusshClient(
        client_id="your-product-client-id",
        client_secret="your-product-client-secret",
        payments_admin_key="your-payments-admin-key",  # optional; needed for admin calls
    )

    # OIDC callback handler (e.g. FastAPI route)
    @app.get("/auth/callback")
    async def callback(code: str, state: str):
        token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)
        return {"user_id": token.user.id}

    # Token verification middleware
    async def verify_request(bearer_token: str):
        result = await client.accounts.verify_token(bearer_token)
        return result.user_id

    # Billing
    customer = await client.payments.create_customer(owner_user_id=token.user.id)
    sub = await client.payments.create_subscription(
        customer_id=customer.id,
        payment_product_id="...",
        plan_key="pro",
        idempotency_key=str(uuid4()),
    )

Async context manager (recommended for scripts / one-off usage):

    async with PpusshClient(...) as client:
        token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)

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
_ENV_ACCOUNTS_URL: Final = "PPUSSH_ACCOUNTS_URL"
_ENV_ACCOUNTS_FRONTEND_URL: Final = "PPUSSH_ACCOUNTS_FRONTEND_URL"
_ENV_PAYMENTS_URL: Final = "PPUSSH_PAYMENTS_URL"


def _resolve_url(kwarg: str | None, env_var: str, label: str) -> str:
    """
    Resolve a service URL using the two-tier priority:
    1. Explicit constructor kwarg
    2. Environment variable

    Raises ``ValueError`` if neither is provided — there is no hardcoded
    default, keeping the SDK self-hostable and infrastructure-agnostic.
    """
    if kwarg:
        return kwarg.rstrip("/")
    env_val = os.environ.get(env_var)
    if env_val:
        return env_val.rstrip("/")
    raise ValueError(
        f"{label} URL is required. "
        f"Pass it as a constructor argument or set the {env_var!r} environment variable."
    )


class PpusshClient:
    """
    Unified PPUSSH SDK client.

    Exposes two namespaces:
      ``client.accounts``  — OIDC token exchange, token verification, user profile
      ``client.payments``  — customers, subscriptions, plans

    Parameters
    ----------
    client_id:
        Your product's ``client_id`` UUID (from the Accounts admin console).
        Required for all OAuth operations.
    client_secret:
        Your product's ``client_secret`` (from the Accounts admin console).
        **Never expose this in browser-side code.** Server-side only.
    payments_admin_key:
        Static admin API key for the Payments service. Required for
        ``payments.list_plans()``, ``payments.get_mrr()``, and
        ``payments.get_product_by_accounts_id()``. Optional if you only use
        customer and subscription endpoints.
    accounts_url:
        Accounts service base URL. Falls back to the ``PPUSSH_ACCOUNTS_URL``
        environment variable. **Required** — one of the two must be set.
    payments_url:
        Payments service base URL. Falls back to the ``PPUSSH_PAYMENTS_URL``
        environment variable. **Required** — one of the two must be set.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        payments_admin_key: str | None = None,
        accounts_url: str | None = None,
        accounts_frontend_url: str | None = None,
        payments_url: str | None = None,
    ) -> None:
        if not client_id:
            raise ValueError("client_id must not be empty.")
        if not client_secret:
            raise ValueError("client_secret must not be empty.")

        self._accounts_url = _resolve_url(accounts_url, _ENV_ACCOUNTS_URL, "Accounts")
        self._accounts_frontend_url = _resolve_url(accounts_frontend_url, _ENV_ACCOUNTS_FRONTEND_URL, "Accounts Frontend")
        self._payments_url = _resolve_url(payments_url, _ENV_PAYMENTS_URL, "Payments")

        # One transport per service — each owns its own httpx.AsyncClient
        self._accounts_transport = HttpTransport(self._accounts_url)
        self._payments_transport = HttpTransport(self._payments_url)

        self.accounts = AccountsNamespace(
            self._accounts_transport,
            client_id=client_id,
            client_secret=client_secret,
            accounts_url=self._accounts_url,
            accounts_frontend_url=self._accounts_frontend_url
        )
        self.payments = PaymentsNamespace(
            self._payments_transport,
            admin_key=payments_admin_key,
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
    def accounts_url(self) -> str:
        """Resolved Accounts service base URL."""
        return self._accounts_url
    @property
    def accounts_frontend_url(self) -> str:
        """Resolved Accounts frontend service base URL."""
        return self._accounts_frontend_url
    @property
    def payments_url(self) -> str:
        """Resolved Payments service base URL."""
        return self._payments_url

    def __repr__(self) -> str:
        return (
            f"PpusshClient("
            f"accounts_url={self._accounts_url!r}, "
            f"accounts_frontend_url={self._accounts_frontend_url!r}, "
            f"payments_url={self._payments_url!r})"
        )
