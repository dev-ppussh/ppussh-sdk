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
    Richer than the embedded user in the token response — includes account
    status fields.
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
