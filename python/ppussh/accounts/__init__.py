# ppussh/accounts/__init__.py
"""
Accounts namespace — re-exports models for convenient top-level imports.

    from ppussh.accounts import UserProfile, VerifyTokenResult
"""
from __future__ import annotations

from ppussh.accounts.models import (
    EntitlementResponse,
    SessionResponse,
    UserProfile,
    VerifyTokenResult,
)
from ppussh.accounts.namespace import AccountsNamespace

__all__ = [
    "AccountsNamespace",
    # Models
    "VerifyTokenResult",
    "UserProfile",
    "EntitlementResponse",
    "SessionResponse",
]
