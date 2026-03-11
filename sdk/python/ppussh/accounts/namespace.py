# ppussh/accounts/namespace.py
"""
AccountsNamespace — server-side OIDC + user operations.

This namespace handles the product-backend half of the OIDC flow:
  build_login_url() → build the redirect URL to send the user to Accounts
  exchange_code()  → trade the auth code (from callback URL) for tokens
  refresh()        → rotate tokens using a refresh token
  verify_token()   → validate an incoming access token (e.g. from a request header)
  logout()         → revoke a session via refresh token (POST /oauth/logout)
  logout_all()     → revoke ALL sessions via access token (POST /auth/logout)
  revoke_session() → revoke a single session by ID (DELETE /auth/sessions/{id})
  get_user()       → fetch the full user profile for the stored access token

Session state
-------------
After a successful exchange_code() or refresh() call, the client stores:
  _access_token    — attached automatically to get_user()
  _refresh_token   — used automatically by refresh() and logout() if no arg given
  _token_expires_at — informational; not used for auto-refresh (caller's responsibility)

The client_id and client_secret set on PpusshClient are injected automatically
into every OAuth call — callers never need to pass them.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from ppussh._http import HttpTransport
from ppussh.accounts.models import (
    EntitlementResponse,
    LogoutResult,
    SessionResponse,
    TokenResponse,
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
    ) -> None:
        self._http = transport
        self._client_id = client_id
        self._client_secret = client_secret
        self._accounts_url = accounts_url

        # ── Stored session state ───────────────────────────────────────────────
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._token_expires_at: datetime | None = None

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
        return f"{self._accounts_url}/login?{urlencode(params)}"

    # ── OIDC token exchange ────────────────────────────────────────────────────

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> TokenResponse:
        """
        Exchange the authorization code received on your callback URL for tokens.

        This is step 6 of the OIDC flow — called by your server after the
        Accounts frontend redirects the user back to your ``redirect_uri`` with
        ``?code=...&state=...`` in the query string.

        Parameters
        ----------
        code:         The raw 64-char hex auth code from the callback URL.
        redirect_uri: Must exactly match the redirect_uri registered for your
                      product. Required by the Accounts server for binding.

        Returns
        -------
        TokenResponse
            Contains access_token (or admin_access_token for superusers),
            refresh_token, expires_in, and an embedded UserInToken.
            Tokens are also stored internally for subsequent calls.

        Raises
        ------
        PpusshAuthError        If the code is invalid, expired, or already used.
        PpusshConsentRequired  If the user has not consented to your product.
        PpusshNetworkError     If the request fails after all retries.
        """
        response = await self._http.request(
            "POST",
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": redirect_uri,
            },
        )
        token = TokenResponse.model_validate(response.json())
        self._store_tokens(token)
        logger.debug(
            "ppussh: tokens exchanged for user %s (expires_in=%ds)",
            token.user.id, token.expires_in,
        )
        return token

    async def refresh(
        self,
        refresh_token: str | None = None,
    ) -> TokenResponse:
        """
        Rotate tokens using a refresh token.

        If ``refresh_token`` is omitted, the internally stored refresh token
        from the last exchange_code() / refresh() call is used.

        Parameters
        ----------
        refresh_token:
            The raw 64-char hex refresh token. Optional if the client already
            holds one from a prior exchange_code() or refresh() call.

        Returns
        -------
        TokenResponse
            New access + refresh token pair. Stored internally.

        Raises
        ------
        PpusshAuthError     If the refresh token is invalid, expired, or replayed.
                            Note: a replayed token causes ALL sessions to be revoked
                            server-side — this is a security feature, not a bug.
        PpusshNetworkError  If the request fails after all retries.
        """
        token_to_use = refresh_token or self._refresh_token
        if not token_to_use:
            raise ValueError(
                "No refresh_token provided and none stored. "
                "Call exchange_code() first or pass refresh_token explicitly."
            )

        response = await self._http.request(
            "POST",
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": token_to_use,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
        )
        token = TokenResponse.model_validate(response.json())
        self._store_tokens(token)
        logger.debug(
            "ppussh: tokens refreshed for user %s (expires_in=%ds)",
            token.user.id, token.expires_in,
        )
        return token

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

    # ── Logout ─────────────────────────────────────────────────────────────────

    async def logout(
        self,
        refresh_token: str | None = None,
    ) -> LogoutResult:
        """
        Revoke a session and trigger front-channel logout to all connected products.

        Uses ``POST /oauth/logout`` with the refresh token — this is the standard
        per-session logout that also notifies downstream products via webhooks.

        If ``refresh_token`` is omitted, the internally stored refresh token is used.
        On success, stored tokens are cleared from the client instance.

        Note: Logout is always safe to call — if the token is already invalid or
        the session doesn't exist, the Accounts server returns ok=True silently
        (prevents token enumeration).

        Parameters
        ----------
        refresh_token:
            The raw 64-char hex refresh token. Optional if stored internally.

        Returns
        -------
        LogoutResult
            ``{ ok: True, sessions_revoked: N, products_notified: N }``

        Raises
        ------
        PpusshAuthError    If client_id or client_secret are invalid.
        PpusshNetworkError If the request fails after all retries.
        """
        token_to_use = refresh_token or self._refresh_token
        if not token_to_use:
            raise ValueError(
                "No refresh_token provided and none stored. "
                "Call exchange_code() first or pass refresh_token explicitly."
            )

        response = await self._http.request(
            "POST",
            "/oauth/logout",
            json={
                "refresh_token": token_to_use,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
        )
        result = LogoutResult.model_validate(response.json())
        self._clear_tokens()
        logger.debug("ppussh: logout complete, %d sessions revoked", result.sessions_revoked)
        return result

    async def logout_all(
        self,
        access_token: str | None = None,
    ) -> None:
        """
        Revoke **all** sessions for the current user immediately.

        Uses ``POST /auth/logout`` with the access token (Bearer header).
        Unlike ``logout()``, this does not require a refresh token and revokes
        every active session across all devices — useful for "sign out everywhere"
        functionality.

        On success, stored tokens are cleared from the client instance.

        Parameters
        ----------
        access_token:
            JWT access token. Optional if stored internally from a prior
            exchange_code() or refresh() call.

        Raises
        ------
        PpusshAuthError    If the token is invalid or expired.
        PpusshNetworkError If the request fails after all retries.
        """
        token_to_use = access_token or self._access_token
        if not token_to_use:
            raise ValueError(
                "No access_token provided and none stored. "
                "Call exchange_code() first or pass access_token explicitly."
            )

        await self._http.request(
            "POST",
            "/auth/logout",
            headers={"Authorization": f"Bearer {token_to_use}"},
        )
        self._clear_tokens()
        logger.debug("ppussh: logout_all complete — all sessions revoked")

    # ── Session management ─────────────────────────────────────────────────────

    async def revoke_session(
        self,
        session_id: str,
        access_token: str | None = None,
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
            JWT access token. Optional if stored internally.

        Raises
        ------
        PpusshAuthError    If the token is invalid or the session does not belong
                           to the authenticated user.
        PpusshNetworkError If the request fails after all retries.
        """
        token_to_use = access_token or self._access_token
        if not token_to_use:
            raise ValueError(
                "No access_token provided and none stored. "
                "Call exchange_code() first or pass access_token explicitly."
            )

        await self._http.request(
            "DELETE",
            f"/auth/sessions/{session_id}",
            headers={"Authorization": f"Bearer {token_to_use}"},
        )
        logger.debug("ppussh: session %s revoked", session_id)

    # ── User profile ───────────────────────────────────────────────────────────

    async def get_user(
        self,
        access_token: str | None = None,
    ) -> UserProfile:
        """
        Fetch the full user profile for an access token.

        If ``access_token`` is omitted, the internally stored token from the
        last exchange_code() or refresh() is used.

        Parameters
        ----------
        access_token:
            JWT access token. Optional if stored internally.

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
        token_to_use = access_token or self._access_token
        if not token_to_use:
            raise ValueError(
                "No access_token provided and none stored. "
                "Call exchange_code() first or pass access_token explicitly."
            )

        response = await self._http.request(
            "GET",
            "/users/me",
            headers={"Authorization": f"Bearer {token_to_use}"},
        )
        return UserProfile.model_validate(response.json())

    # ── Entitlements & sessions ────────────────────────────────────────────────

    async def get_entitlements(
        self,
        access_token: str | None = None,
    ) -> list[EntitlementResponse]:
        """
        List products the user has granted consent to (i.e. their entitlements).

        Parameters
        ----------
        access_token:
            JWT access token. Optional if stored internally.
        """
        token_to_use = access_token or self._access_token
        if not token_to_use:
            raise ValueError("No access_token provided and none stored.")

        response = await self._http.request(
            "GET",
            "/users/me/entitlements",
            headers={"Authorization": f"Bearer {token_to_use}"},
        )
        return [EntitlementResponse.model_validate(e) for e in response.json()]

    async def get_sessions(
        self,
        access_token: str | None = None,
    ) -> list[SessionResponse]:
        """
        List all active sessions for the authenticated user.

        Parameters
        ----------
        access_token:
            JWT access token. Optional if stored internally.
        """
        token_to_use = access_token or self._access_token
        if not token_to_use:
            raise ValueError("No access_token provided and none stored.")

        response = await self._http.request(
            "GET",
            "/users/me/sessions",
            headers={"Authorization": f"Bearer {token_to_use}"},
        )
        return [SessionResponse.model_validate(s) for s in response.json()]

    # ── Internal token management ──────────────────────────────────────────────

    def _store_tokens(self, token: TokenResponse) -> None:
        self._access_token = token.effective_access_token
        self._refresh_token = token.refresh_token
        self._token_expires_at = datetime.now(tz=timezone.utc) + timedelta(
            seconds=token.expires_in
        )

    def _clear_tokens(self) -> None:
        self._access_token = None
        self._refresh_token = None
        self._token_expires_at = None

    @property
    def access_token(self) -> str | None:
        """The currently stored access token, if any."""
        return self._access_token

    @property
    def refresh_token(self) -> str | None:
        """The currently stored refresh token, if any."""
        return self._refresh_token

    @property
    def token_expires_at(self) -> datetime | None:
        """UTC datetime at which the stored access token expires, if known."""
        return self._token_expires_at
