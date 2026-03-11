# ppussh/accounts/models.py
"""
Pydantic models for every response shape returned by the Accounts service.

All models use ``model_config = {"from_attributes": True}`` so they can be
constructed from both raw dicts (``Model(**response.json())``) and ORM objects.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, ConfigDict


# ── Shared config ──────────────────────────────────────────────────────────────
_cfg = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Token exchange ─────────────────────────────────────────────────────────────

class UserInToken(BaseModel):
    """
    Minimal user profile embedded inside a ``TokenResponse``.
    Returned by ``POST /oauth/token`` — no extra round-trip needed.
    """
    model_config = _cfg

    id: str                          # UUID string
    email: str
    name: str | None = None
    email_verified: bool
    picture_url: str | None = None
    is_superuser: bool = False


class TokenResponse(BaseModel):
    """
    Response from ``POST /oauth/token`` (both grant types).

    Exactly one of ``access_token`` / ``admin_access_token`` is populated:
    - Regular users → ``access_token`` is set, ``admin_access_token`` is None.
    - Superusers    → ``admin_access_token`` is set, ``access_token`` is None.
    """
    model_config = _cfg

    access_token: str | None = None
    admin_access_token: str | None = None
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int                  # seconds until access token expires
    user: UserInToken

    @property
    def effective_access_token(self) -> str | None:
        """Return whichever access token is present (regular or admin)."""
        return self.access_token or self.admin_access_token


# ── Token verification ─────────────────────────────────────────────────────────

class VerifyTokenResult(BaseModel):
    """Response from ``GET /auth/verify-token``."""
    model_config = _cfg

    valid: bool
    type: str                        # "access" | "admin_access"
    user_id: str                     # UUID string
    email: str


# ── User profile ───────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    """
    Full user profile returned by ``GET /users/me``.
    Richer than ``UserInToken`` — includes account status fields.
    """
    model_config = _cfg

    id: str                          # UUID string
    email: str
    name: str | None = None
    picture_url: str | None = None
    is_superuser: bool = False
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime | None = None


# ── Logout ─────────────────────────────────────────────────────────────────────

class LogoutResult(BaseModel):
    """Response from ``POST /oauth/logout``."""
    model_config = _cfg

    ok: bool
    sessions_revoked: int
    products_notified: int


# ── Entitlements ───────────────────────────────────────────────────────────────

class EntitlementResponse(BaseModel):
    """Single entitlement entry from ``GET /users/me/entitlements``."""
    model_config = _cfg

    product_id: str                  # UUID string
    client_id: str
    name: str
    slug: str
    granted_at: datetime


# ── Sessions ───────────────────────────────────────────────────────────────────

class SessionResponse(BaseModel):
    """Single session entry from ``GET /users/me/sessions``."""
    model_config = _cfg

    session_id: str                  # UUID string
    ip_address: str | None = None
    user_agent: str | None = None
    country: str | None = None
    city: str | None = None
    region: str | None = None
    browser: str | None = None
    os: str | None = None
    device_type: str | None = None
    device_name: str | None = None
    created_at: datetime
    last_used_at: datetime
    is_current: bool = False
