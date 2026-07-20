# ppussh/webhooks.py
"""
Webhook signature verification for PPUSSH Accounts events.

The Accounts service dispatches signed HTTP POST requests to a URL you register
on your product.  Each request carries an ``X-Webhook-Signature`` header in the
format ``sha256=<hmac-sha256-hex>``.

Usage
-----
    from ppussh import verify_webhook, WebhookEvent

    @app.post("/webhooks/accounts")
    async def handle_webhook(request: Request):
        raw_body = await request.body()
        sig = request.headers.get("x-webhook-signature", "")

        if not verify_webhook(raw_body, sig, settings.ACCOUNTS_CLIENT_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

        event = WebhookEvent.model_validate_json(raw_body)
        match event.type:
            case "user.created":   ...
            case "session.revoked": ...

Algorithm
---------
HMAC-SHA256 over the raw request body bytes, using the product's ``client_secret``
as the key.  The digest is hex-encoded and prefixed with ``sha256=``.
Comparison uses ``hmac.compare_digest`` to prevent timing attacks.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


# ── Event type literal ─────────────────────────────────────────────────────────

WebhookEventType = Literal[
    "user.created",
    "user.email_verified",
    "user.updated",
    "user.deleted",
    "user.social_linked",
    "user.consent_granted",
    "session.revoked",
]


# ── Webhook event model ────────────────────────────────────────────────────────

class WebhookEvent(BaseModel):
    """
    Parsed payload of a PPUSSH Accounts webhook request.

    Construct from the raw request body after verifying the signature::

        event = WebhookEvent.model_validate_json(raw_body)
    """

    type: WebhookEventType
    user_id: str        # UUID string
    email: str
    product_id: str     # UUID string
    timestamp: datetime


# ── Signature verification ─────────────────────────────────────────────────────

def verify_webhook(
    raw_body: bytes,
    signature_header: str,
    client_secret: str,
) -> bool:
    """
    Verify the HMAC-SHA256 signature on an Accounts webhook request.

    Parameters
    ----------
    raw_body:
        The raw (unparsed) request body bytes exactly as received from the
        network.  Do **not** decode or re-encode before passing in.
    signature_header:
        The value of the ``X-Webhook-Signature`` header, e.g.
        ``"sha256=abcdef1234..."``.
    client_secret:
        Your product's ``client_secret`` string (from the Accounts admin
        console).  This is the HMAC key.

    Returns
    -------
    bool
        ``True`` if the signature is valid, ``False`` otherwise.
        Returns ``False`` (not raises) for malformed or missing signatures so
        callers can safely treat the return value as a boolean gate.
    """
    if not signature_header.startswith("sha256="):
        return False

    expected_digest = hmac.new(
        client_secret.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    expected = f"sha256={expected_digest}"

    try:
        return hmac.compare_digest(expected, signature_header)
    except (TypeError, ValueError):
        return False
