# ppussh/accounts/models.py
"""
Pydantic models for the response shapes returned by the Accounts service that
the SDK depends on.

The SDK authenticates **as a product** (OAuth client credentials + product/
admin API keys). It does not forward end-user tokens, so the only Accounts
response shapes the SDK needs are the OAuth token response and the embedded
user claims — everything else (profiles, sessions, entitlements) is read by
the product backend directly from its own cookies / the Accounts API as needed.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ── Shared config ──────────────────────────────────────────────────────────────
_cfg = ConfigDict(from_attributes=True, populate_by_name=True)


# ── OAuth token response ───────────────────────────────────────────────────────

class UserInToken(BaseModel):
    """The user object embedded inside an OAuth token response."""
    model_config = _cfg

    id: str                          # UUID string
    email: str
    name: str | None = None
    picture_url: str | None = None
    email_verified: bool = False
    is_superuser: bool = False


class TokenResponse(BaseModel):
    """
    Response from ``POST /oauth/token`` (authorization_code grant).

    Tokens are returned only in development mode.  In production the
    accounts-api sets httpOnly cookies during the social callback; the
    response body carries user info only.  The product backend creates
    its own session cookie from ``user.id`` / ``user.email``.

    ``access_token`` is ``None`` when tokens are already in cookies.
    ``admin_access_token`` is present (non-null) only for superusers.
    """
    model_config = _cfg

    access_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int | None = None
    refresh_token: str | None = None
    admin_access_token: str | None = None
    user: UserInToken
