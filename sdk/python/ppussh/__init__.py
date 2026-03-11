# ppussh/__init__.py
"""
PPUSSH Python SDK — public API surface.

Quick start
-----------
    from ppussh import PpusshClient

    client = PpusshClient(
        client_id="your-client-id",
        client_secret="your-client-secret",
        payments_admin_key="your-payments-admin-key",  # optional
    )

    # Build the login redirect URL
    login_url = client.accounts.build_login_url(redirect_uri=REDIRECT_URI, state=state)

    # OIDC callback
    token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)

    # Middleware token check
    result = await client.accounts.verify_token(bearer)

    # Billing
    customer = await client.payments.create_customer(owner_user_id=token.user.id)

All raised exceptions are subclasses of ``PpusshError`` — import them
from this package for catch clauses:

    from ppussh import PpusshError, PpusshAuthError, PpusshConsentRequired

Webhook signature verification:

    from ppussh import verify_webhook, WebhookEvent

    if not verify_webhook(raw_body, sig_header, client_secret):
        raise HTTPException(401)
    event = WebhookEvent.model_validate_json(raw_body)
"""
from __future__ import annotations

from ppussh.client import PpusshClient
from ppussh.errors import (
    PpusshAuthError,
    PpusshConsentRequired,
    PpusshError,
    PpusshNetworkError,
    PpusshPaymentError,
)
from ppussh.webhooks import WebhookEvent, WebhookEventType, verify_webhook

__all__ = [
    "PpusshClient",
    # Errors
    "PpusshError",
    "PpusshAuthError",
    "PpusshConsentRequired",
    "PpusshPaymentError",
    "PpusshNetworkError",
    # Webhooks
    "verify_webhook",
    "WebhookEvent",
    "WebhookEventType",
]

__version__ = "0.1.0"
