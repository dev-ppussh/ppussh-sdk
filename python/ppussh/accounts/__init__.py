# ppussh/accounts/__init__.py
"""
Accounts namespace — re-exports models for convenient top-level imports.

    from ppussh.accounts import TokenResponse, UserInToken
"""
from __future__ import annotations

from ppussh.accounts.models import TokenResponse, UserInToken
from ppussh.accounts.namespace import AccountsNamespace

__all__ = [
    "AccountsNamespace",
    # Models
    "TokenResponse",
    "UserInToken",
]
