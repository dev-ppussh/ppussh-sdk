# ppussh/accounts/namespace.py
"""
AccountsNamespace — product-side helpers for the Accounts service.

The product backend owns the full OIDC lifecycle (login redirect, callback,
token handling, refresh, logout, cookie management). This namespace provides
the two server-side calls the product backend needs from the SDK:

  build_login_url()  → build the redirect URL to send the user to Accounts login
  exchange_code()    → exchange an OAuth authorization ``code`` for a token
                       (the SDK POSTs to the Accounts ``/oauth/token`` endpoint
                       with the product's client_id + client_secret)

The SDK never forwards end-user tokens. Profile/session/entitlement lookups
are intentionally out of scope — the product reads those from its own cookies
or calls the Accounts API directly with its own credentials.
"""
from __future__ import annotations

from urllib.parse import urlencode

from ppussh._http import HttpTransport
from ppussh.accounts.models import TokenResponse


class AccountsNamespace:
    """
    Access via ``client.accounts``.

    Both methods are coroutines except ``build_login_url()``, which is
    synchronous.
    """

    def __init__(
        self,
        transport: HttpTransport,
        *,
        client_id: str,
        client_secret: str,
        accounts_frontend_url: str,
    ) -> None:
        self._http = transport
        self._client_id = client_id
        self._client_secret = client_secret
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

    # ── OAuth token exchange ───────────────────────────────────────────────────

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
        *,
        state: str | None = None,
        next_url: str | None = None,
    ) -> TokenResponse:
        """
        Exchange an authorization ``code`` for a token (OAuth ``authorization_code`` grant).

        Call this from your OIDC callback route. The SDK authenticates **as the
        product** using the ``client_id`` / ``client_secret`` supplied to
        ``PpusshClient`` and POSTs to the Accounts ``/oauth/token`` endpoint.

        Parameters
        ----------
        code:
            The ``code`` query parameter Accounts redirected back with.
        redirect_uri:
            Must exactly match the ``redirect_uri`` used in ``build_login_url()``.
        state:
            Optional; echoed back from the callback for CSRF validation.
        next_url:
            Optional; forwarded so Accounts can resume the right post-login target.

        Returns
        -------
        TokenResponse
            ``{ access_token, token_type, expires_in, refresh_token, user }``.
            Set ``user.id`` / ``access_token`` as your own session cookie —
            the SDK does not store or forward the token.

        Raises
        ------
        PpusshAuthError    If the code is invalid/expired or credentials are wrong.
        PpusshNetworkError If the request fails after all retries.
        """
        data = {
            "grant_type": "authorization_code",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }
        if state is not None:
            data["state"] = state
        if next_url is not None:
            data["next_url"] = next_url

        response = await self._http.request(
            "POST",
            "/oauth/token",
            data=data,
        )
        return TokenResponse.model_validate(response.json())
