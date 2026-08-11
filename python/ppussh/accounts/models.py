# ppussh/accounts/models.py
"""
Pydantic models for the response shapes returned by the Accounts service that
the SDK depends on.

The SDK authenticates **as a product** (OAuth client credentials + admin API
keys). The OAuth token response carries the embedded user claims; entitlement
management is done server-to-server with the ``accounts_admin_key`` against
the ``/admin/entitlements`` endpoints.
"""
from __future__ import annotations

from datetime import datetime

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


# ── Entitlements (server-to-server, admin key) ─────────────────────────────────

class EntitlementWithProductResponse(BaseModel):
    """Response from ``GET /admin/users/{id}/entitlements``,
    ``POST /admin/entitlements`` and ``PATCH /admin/entitlements/{id}``."""
    model_config = _cfg

    id: str                                # UUID string — entitlement ID
    product_id: str                        # UUID string
    product_name: str
    product_slug: str
    role: str                              # "member" | "admin" | "owner"
    feature_flags: dict[str, bool]         # e.g. {"beta": true, "founding": false}
    created_at: datetime


class EntitlementCreateRequest(BaseModel):
    """Request body for ``POST /admin/entitlements``."""
    model_config = _cfg

    user_id: str                           # UUID string
    product_id: str                        # UUID string
    role: str = "member"                   # "member" | "admin" | "owner"
    feature_flags: dict[str, bool] | None = None


class EntitlementUpdateRequest(BaseModel):
    """Request body for ``PATCH /admin/entitlements/{id}``.

    ``feature_flags`` uses merge semantics — booleans set flags, ``None``
    removes them.
    """
    model_config = _cfg

    feature_flags: dict[str, bool | None] | None = None
