# ppussh/accounts/namespace.py
"""
AccountsNamespace — stateless helpers for Accounts service API calls.

The product backend handles the OIDC flow (login, callback, token exchange)
and cookie management itself. This namespace provides lightweight wrappers
for the few server-side calls the product backend needs:

  build_login_url()  → build the redirect URL to send the user to Accounts
  verify_token()     → validate an incoming access token (from request cookies)
  get_user()         → fetch the full user profile
  get_entitlements() → list products the user has granted consent to
  get_sessions()     → list active sessions for the authenticated user
  revoke_session()   → revoke a single session by ID

No tokens are stored internally — every method requiring authentication expects
an explicit ``access_token`` parameter.
"""
from __future__ import annotations

import logging
from urllib.parse import urlencode

from ppussh._http import HttpTransport
from ppussh.accounts.models import (
    EntitlementResponse,
    SessionResponse,
    UserProfile,
    VerifyTokenResult,
)

logger = logging.getLogger(__name__)


class AccountsNamespace:
    """
    Access via ``client.accounts``.

    All async methods are coroutines — use ``await``.
    ``build_login_url()`` is synchronous.
    """

    def __init__(
        self,
        transport: HttpTransport,
        *,
        client_id: str,
        client_secret: str,
        accounts_url: str,
        accounts_frontend_url
    ) -> None:
        self._http = transport
        self._client_id = client_id
        self._client_secret = client_secret
        self._accounts_url = accounts_url
        self._accounts_frontend_url = accounts_frontend_url

    # ── Login URL builder ──────────────────────────────────────────────────────

    def build_login_url(
        self,
        redirect_uri: str,
        state: str,
        *,
        next_url: str | None = None,
    ) -> str:
        """
        Build the URL to redirect the user's browser to the Accounts login page.

        This is step 2 of the OIDC flow — call this in your route handler and
        issue a 302 redirect to the returned URL.  The Accounts frontend handles
        email/password login as well as Google and GitHub social login; the
        product backend never needs to call social-auth endpoints directly.

        Parameters
        ----------
        redirect_uri:
            The URL on your server that Accounts will redirect back to after
            login (with ``?code=...&state=...``).  Must exactly match the
            redirect_uri registered for your product in the admin console.
        state:
            A cryptographically random string you generate and store in the
            user's session.  Validated on callback to prevent CSRF attacks.
        next_url:
            Optional URL the Accounts frontend will redirect to after a
            successful login within its own domain (rarely needed).

        Returns
        -------
        str
            The full login URL, e.g.
            ``https://accounts.example.com/login?client_id=...&redirect_uri=...&state=...``
        """
        params: dict[str, str] = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        if next_url:
            params["next"] = next_url
        return f"{self._accounts_frontend_url}/login?{urlencode(params)}"

    # ── Token verification ─────────────────────────────────────────────────────

    async def verify_token(self, access_token: str) -> VerifyTokenResult:
        """
        Validate an access token your server received from an end-user request.

        Use this in your middleware / request handler to verify that the Bearer
        token a user sent to your product's API is valid and not expired.

        This performs a full server-side validation including:
        - JWT signature check
        - Expiry check
        - token_version check (catches tokens invalidated by password reset)
        - Account status check (deleted / unverified accounts are rejected)

        Parameters
        ----------
        access_token:
            The raw JWT string from the user's ``Authorization: Bearer ...`` header.

        Returns
        -------
        VerifyTokenResult
            ``{ valid: True, type: "access"|"admin_access", user_id: "...", email: "..." }``

        Raises
        ------
        PpusshAuthError    If the token is invalid, expired, or the account is deleted.
        PpusshNetworkError If the request fails after all retries.
        """
        response = await self._http.request(
            "GET",
            "/auth/verify-token",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return VerifyTokenResult.model_validate(response.json())

    # ── User profile ───────────────────────────────────────────────────────────

    async def get_user(self, access_token: str) -> UserProfile:
        """
        Fetch the full user profile for an access token.

        Parameters
        ----------
        access_token:
            JWT access token from the user's request cookie.

        Returns
        -------
        UserProfile
            Full profile including is_superuser, is_active, is_verified,
            created_at, and updated_at.

        Raises
        ------
        PpusshAuthError    If the token is invalid or expired.
        PpusshNetworkError If the request fails after all retries.
        """
        response = await self._http.request(
            "GET",
            "/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return UserProfile.model_validate(response.json())

    # ── Entitlements & sessions ────────────────────────────────────────────────

    async def get_entitlements(
        self,
        access_token: str,
    ) -> list[EntitlementResponse]:
        """
        List products the user has granted consent to (i.e. their entitlements).

        Parameters
        ----------
        access_token:
            JWT access token from the user's request cookie.
        """
        response = await self._http.request(
            "GET",
            "/users/me/entitlements",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return [EntitlementResponse.model_validate(e) for e in response.json()]

    async def get_sessions(
        self,
        access_token: str,
    ) -> list[SessionResponse]:
        """
        List all active sessions for the authenticated user.

        Parameters
        ----------
        access_token:
            JWT access token from the user's request cookie.
        """
        response = await self._http.request(
            "GET",
            "/users/me/sessions",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return [SessionResponse.model_validate(s) for s in response.json()]

    async def revoke_session(
        self,
        session_id: str,
        access_token: str,
    ) -> None:
        """
        Revoke a specific session by its ID.

        Uses ``DELETE /auth/sessions/{session_id}`` — the user can only revoke
        their own sessions.  Useful for "sign out of this device" UX in a
        session management screen.

        Parameters
        ----------
        session_id:
            The UUID of the session to revoke (from ``get_sessions()``).
        access_token:
            JWT access token from the user's request cookie.

        Raises
        ------
        PpusshAuthError    If the token is invalid or the session does not belong
                           to the authenticated user.
        PpusshNetworkError If the request fails after all retries.
        """
        await self._http.request(
            "DELETE",
            f"/auth/sessions/{session_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        logger.debug("ppussh: session %s revoked", session_id)
