# ppussh/_http.py
"""
Shared async HTTP transport layer for the PPUSSH SDK.

Responsibilities
----------------
- Owns the single ``httpx.AsyncClient`` instance for each base URL.
- Implements the retry policy:
    * 5xx errors  → up to MAX_RETRIES attempts, exponential back-off (0.5s, 1s, 2s).
    * 429         → respects ``Retry-After`` header; falls back to RETRY_AFTER_DEFAULT.
    * 4xx (≠ 429) → never retried; raised immediately.
    * Network / timeout → treated like 5xx for retry purposes.
- Raises typed ``PpusshError`` subclasses — callers never see raw ``httpx`` exceptions.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ppussh.errors import PpusshAuthError, PpusshNetworkError, PpusshPaymentError, PpusshError

logger = logging.getLogger(__name__)

# ── Retry constants ────────────────────────────────────────────────────────────
MAX_RETRIES = 3
BACKOFF_SCHEDULE = [0.5, 1.0, 2.0]  # seconds between attempts 1→2, 2→3, 3→fail
RETRY_AFTER_DEFAULT = 1.0            # fallback when Retry-After header is absent
MAX_RATE_LIMIT_RETRIES = 2

# ── Timeout ────────────────────────────────────────────────────────────────────
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

# ── SDK user-agent ─────────────────────────────────────────────────────────────
SDK_USER_AGENT = "ppussh-python/1.0.0"


class HttpTransport:
    """
    Thin wrapper around ``httpx.AsyncClient`` with retry logic baked in.

    One instance is created per base URL (accounts + payments) and shared
    across all method calls for the lifetime of the ``PpusshClient``.
    """

    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=DEFAULT_TIMEOUT,
            headers={
                "User-Agent": SDK_USER_AGENT,
                "Accept": "application/json",
            },
            follow_redirects=False,
        )

    # ── Public interface ───────────────────────────────────────────────────────

    async def request(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str] | None = None,
        json: Any = None,
        data: dict[str, str] | None = None,   # form-encoded bodies
        params: dict[str, Any] | None = None,
        is_payments: bool = False,
    ) -> httpx.Response:
        """
        Execute an HTTP request with automatic retries.

        Parameters
        ----------
        method:       HTTP verb ("GET", "POST", etc.)
        path:         URL path relative to the base URL (e.g. ``"/oauth/token"``)
        headers:      Additional headers merged on top of the instance defaults.
        json:         JSON-serialisable body (sets Content-Type: application/json).
        data:         Form-encoded body dict (sets Content-Type: application/x-www-form-urlencoded).
        params:       Query string parameters.
        is_payments:  When True, payment-specific error parsing is used for 4xx responses.
        """
        kwargs: dict[str, Any] = {"params": params}
        if headers:
            kwargs["headers"] = headers
        if json is not None:
            kwargs["json"] = json
        if data is not None:
            kwargs["data"] = data

        attempt = 0
        rate_limit_attempt = 0
        last_exc: Exception | None = None

        while attempt < MAX_RETRIES:
            try:
                response = await self._client.request(method, path, **kwargs)
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                    httpx.PoolTimeout, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                attempt += 1
                if attempt < MAX_RETRIES:
                    delay = BACKOFF_SCHEDULE[min(attempt - 1, len(BACKOFF_SCHEDULE) - 1)]
                    logger.warning(
                        "ppussh: network error on %s %s (attempt %d/%d), "
                        "retrying in %.1fs: %s",
                        method, path, attempt, MAX_RETRIES, delay, exc,
                    )
                    await asyncio.sleep(delay)
                continue

            # ── 429 Rate limited ───────────────────────────────────────────────
            if response.status_code == 429:
                if rate_limit_attempt >= MAX_RATE_LIMIT_RETRIES:
                    raise PpusshNetworkError(
                        f"Rate limited on {method} {path} after "
                        f"{rate_limit_attempt + 1} attempts.",
                        status_code=429,
                        response_body=_safe_json(response),
                    )
                retry_after = _parse_retry_after(response)
                logger.warning(
                    "ppussh: rate limited on %s %s, retrying in %.1fs",
                    method, path, retry_after,
                )
                await asyncio.sleep(retry_after)
                rate_limit_attempt += 1
                continue  # does NOT consume an attempt from MAX_RETRIES

            # ── 5xx Server error ───────────────────────────────────────────────
            if response.status_code >= 500:
                attempt += 1
                if attempt < MAX_RETRIES:
                    delay = BACKOFF_SCHEDULE[min(attempt - 1, len(BACKOFF_SCHEDULE) - 1)]
                    logger.warning(
                        "ppussh: server error %d on %s %s (attempt %d/%d), "
                        "retrying in %.1fs",
                        response.status_code, method, path,
                        attempt, MAX_RETRIES, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                # All retries exhausted
                raise PpusshNetworkError(
                    f"Server error {response.status_code} on {method} {path} "
                    f"after {MAX_RETRIES} attempts.",
                    status_code=response.status_code,
                    response_body=_safe_json(response),
                )

            # ── 4xx Client errors (not retried) ───────────────────────────────
            if response.status_code >= 400:
                _raise_client_error(response, is_payments=is_payments)

            # ── 2xx / 3xx success ─────────────────────────────────────────────
            return response

        # Fell through MAX_RETRIES via network errors
        raise PpusshNetworkError(
            f"All {MAX_RETRIES} attempts failed for {method} {path}.",
            status_code=None,
        ) from last_exc

    async def aclose(self) -> None:
        """Close the underlying httpx client. Call when done with the SDK."""
        await self._client.aclose()

    # ── Context-manager support ────────────────────────────────────────────────

    async def __aenter__(self) -> HttpTransport:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return response.text


def _parse_retry_after(response: httpx.Response) -> float:
    header = response.headers.get("Retry-After")
    if header:
        try:
            return float(header)
        except ValueError:
            pass
    return RETRY_AFTER_DEFAULT


def _raise_client_error(response: httpx.Response, *, is_payments: bool) -> None:
    """Parse a 4xx response and raise the appropriate typed error."""
    body = _safe_json(response)

    # ── CONSENT_REQUIRED (403 structured body) ─────────────────────────────────
    if response.status_code == 403 and isinstance(body, dict):
        if body.get("status") == "CONSENT_REQUIRED":
            from ppussh.errors import PpusshConsentRequired
            raise PpusshConsentRequired(
                f"User has not consented to product '{body.get('product_name', '')}'.",
                client_id=body.get("client_id", ""),
                product_name=body.get("product_name", ""),
                product_description=body.get("product_description", ""),
                status_code=403,
                response_body=body,
            )

    # ── 401 Auth error ─────────────────────────────────────────────────────────
    if response.status_code == 401:
        detail = _extract_detail(body)
        raise PpusshAuthError(
            detail or f"Authentication failed (HTTP 401).",
            status_code=401,
            response_body=body,
        )

    # ── Payments service errors ────────────────────────────────────────────────
    if is_payments:
        code = body.get("code") if isinstance(body, dict) else None
        message = body.get("message") if isinstance(body, dict) else None
        raise PpusshPaymentError(
            message or f"Payments error (HTTP {response.status_code}).",
            code=code,
            status_code=response.status_code,
            response_body=body,
        )

    # ── Generic error ──────────────────────────────────────────────────────────
    detail = _extract_detail(body)
    raise PpusshError(
        detail or f"Request failed (HTTP {response.status_code}).",
        status_code=response.status_code,
        response_body=body,
    )


def _extract_detail(body: Any) -> str:
    """Pull the human-readable message out of an Accounts error envelope."""
    if isinstance(body, dict):
        return str(body.get("detail") or body.get("error") or body.get("message") or "")
    if isinstance(body, str):
        return body
    return ""
