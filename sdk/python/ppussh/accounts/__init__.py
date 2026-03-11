# ppussh/accounts/__init__.py
"""
Accounts namespace — re-exports models for convenient top-level imports.

    from ppussh.accounts import TokenResponse, UserProfile, VerifyTokenResult
"""
from __future__ import annotations

from ppussh.accounts.models import (
    EntitlementResponse,
    LogoutResult,
    SessionResponse,
    TokenResponse,
    UserInToken,
    UserProfile,
    VerifyTokenResult,
)
from ppussh.accounts.namespace import AccountsNamespace

__all__ = [
    "AccountsNamespace",
    # Models
    "TokenResponse",
    "UserInToken",
    "VerifyTokenResult",
    "UserProfile",
    "LogoutResult",
    "EntitlementResponse",
    "SessionResponse",
]
