# ppussh/errors.py
"""
Typed exception hierarchy for the PPUSSH Python SDK.

All exceptions carry the raw HTTP status code and response body so callers
can inspect them without parsing generic strings.

Hierarchy
---------
PpusshError                    # base — always catch this if you want a catch-all
├── PpusshAuthError            # 401 from any endpoint
├── PpusshConsentRequired      # 403 with status="CONSENT_REQUIRED"
├── PpusshPaymentError         # non-2xx from the Payments service
└── PpusshNetworkError         # all retries exhausted / connection error / timeout
"""
from __future__ import annotations

from typing import Any


class PpusshError(Exception):
    """Base class for all PPUSSH SDK errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"message={str(self)!r}, "
            f"status_code={self.status_code!r})"
        )


class PpusshAuthError(PpusshError):
    """
    Raised on 401 responses from any PPUSSH endpoint.

    Common causes:
    - Invalid or expired access token passed to verify_token()
    - Bad client_secret during exchange_code() / refresh() / logout()
    - Authorization code already used or expired
    - Refresh token replayed (all sessions are revoked server-side in this case)
    """


class PpusshConsentRequired(PpusshError):
    """
    Raised when the Accounts service returns HTTP 403 with
    ``status = "CONSENT_REQUIRED"``.

    This means the user has not yet granted consent for your product.
    Your application should redirect the user to the Accounts consent screen.

    Attributes
    ----------
    client_id : str
        Your product's client_id — pass back to the consent redirect.
    product_name : str
        Human-readable name of your product.
    product_description : str
        Short description shown on the consent screen.
    """

    def __init__(
        self,
        message: str,
        *,
        client_id: str = "",
        product_name: str = "",
        product_description: str = "",
        status_code: int | None = 403,
        response_body: Any = None,
    ) -> None:
        super().__init__(message, status_code=status_code, response_body=response_body)
        self.client_id = client_id
        self.product_name = product_name
        self.product_description = product_description


class PpusshPaymentError(PpusshError):
    """
    Raised on non-2xx responses from the Payments service.

    Attributes
    ----------
    code : str | None
        Machine-readable error code from the Payments API
        (e.g. ``"customer_not_found"``, ``"provider_unavailable"``).
    """

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message, status_code=status_code, response_body=response_body)
        self.code = code


class PpusshNetworkError(PpusshError):
    """
    Raised when all retry attempts are exhausted or a connection-level error
    occurs (refused connection, DNS failure, read timeout).

    Wraps the underlying ``httpx`` exception as ``__cause__``.
    """
