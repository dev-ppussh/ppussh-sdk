# ppussh

Official Python SDK for the [PPUSSH](https://ppussh.com) platform — Accounts
(OIDC / OAuth 2.0) and Payments in a single, async-first client.

## Requirements

- Python 3.12+
- An Accounts **client_id** and **client_secret** (obtain from the Accounts
  admin console)
- A running instance of the Accounts and Payments services (typically behind
  the API gateway)

## Installation

```bash
pip install ppussh
```

## Configuration

The SDK authenticates **as your product** — it uses your `client_id` /
`client_secret` for the OAuth token exchange and product/admin API keys for
Payments calls. It never forwards end-user tokens: your product backend issues
its own session cookies from the token returned by `exchange_code()`.

The **gateway** is the single entry point. Pass `gateway_url` and the SDK
routes accounts calls to the gateway root and payments calls to
`gateway_url + "/payments"`.

| Environment variable           | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `PPUSSH_GATEWAY_URL`           | Gateway base URL (single entry for all API calls)              |
| `PPUSSH_ACCOUNTS_FRONTEND_URL` | Accounts **frontend** base URL (the login page users see)      |
| `PPUSSH_PAYMENTS_ADMIN_KEY`    | Optional admin key for Payments admin endpoints                |

```bash
export PPUSSH_GATEWAY_URL="https://api.example.com"
export PPUSSH_ACCOUNTS_FRONTEND_URL="https://accounts.example.com"
```

## Quick start

```python
from ppussh import PpusshClient

client = PpusshClient(
    client_id="your-product-client-id",
    client_secret="your-product-client-secret",
    gateway_url="https://api.example.com",
    accounts_frontend_url="https://accounts.example.com",
    payments_product_key="your-payments-product-key",  # optional; only if Payments is active
    payments_admin_key="your-payments-admin-key",      # optional; only for admin calls
)
```

### OIDC callback (FastAPI example)

```python
from fastapi import FastAPI, Query
from ppussh import PpusshClient

app = FastAPI()
client = PpusshClient(client_id="...", client_secret="...")

REDIRECT_URI = "https://yourapp.example.com/auth/callback"

@app.get("/auth/callback")
async def callback(code: str = Query(...)):
    token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)
    # The SDK authenticated AS the product; token.user is the logged-in user.
    # Set your own session cookie from token.user.id / token.access_token.
    return {"user_id": token.user.id, "email": token.user.email}
```

### Login redirect

```python
import secrets
state = secrets.token_urlsafe(16)
login_url = client.accounts.build_login_url(redirect_uri=REDIRECT_URI, state=state)
# → redirect the browser to login_url
```

### Billing — create a customer and subscription

```python
from uuid import uuid4

customer = await client.payments.create_customer(
    owner_user_id=token.user.id,
    workspace_id="ws-123",  # optional
)

plans = await client.payments.list_plans(payment_product_id="prod-abc")

subscription = await client.payments.create_subscription(
    customer_id=customer.id,
    payment_product_id="prod-abc",
    plan_key="pro",
    idempotency_key=str(uuid4()),
)
```

### Async context manager (scripts / one-off usage)

```python
async with PpusshClient(client_id="...", client_secret="...") as client:
    token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)
```

For long-lived services, call `await client.aclose()` during application
shutdown to drain the connection pool.

## Error handling

All exceptions are subclasses of `PpusshError`:

```python
from ppussh import (
    PpusshError,          # base class
    PpusshAuthError,      # 401 — invalid or expired token / credentials
    PpusshConsentRequired,# 403 — user hasn't consented to this product's scopes
    PpusshPaymentError,   # non-2xx from the Payments service
    PpusshNetworkError,   # all retries exhausted / connection failure
)

try:
    token = await client.accounts.exchange_code(code, redirect_uri=REDIRECT_URI)
except PpusshConsentRequired as exc:
    redirect_to_consent(exc.client_id, exc.product_name)
except PpusshAuthError:
    ...
except PpusshNetworkError:
    ...
```

### Retry policy

| Condition           | Behaviour                                               |
| ------------------- | ------------------------------------------------------- |
| 5xx / network error | Up to 3 attempts, exponential backoff (0.5 s, 1 s, 2 s) |
| 429 Too Many Requests | Respects `Retry-After` header, max 2 retries          |
| 4xx (not 429)       | Never retried — raises immediately                      |

## API reference

### `client.accounts`

| Method | Description |
| ------ | ----------- |
| `build_login_url(redirect_uri, state, *, next_url?)` | Build the Accounts login redirect URL |
| `exchange_code(code, redirect_uri, *, state?, next_url?)` | Exchange an auth code for a token (OIDC callback) |

### `client.payments`

| Method | Auth | Description |
| ------ | ---- | ----------- |
| `create_customer(owner_user_id, ...)` | product key | Create or retrieve a customer record |
| `get_customer(customer_id)` | product key | Fetch a customer by ID |
| `create_subscription(...)` | product key | Create a subscription |
| `list_subscriptions(customer_id, ...)` | product key | List subscriptions for a customer |
| `get_subscription(subscription_id)` | product key | Fetch a subscription by ID |
| `cancel_subscription(subscription_id, ...)` | product key | Cancel a subscription |
| `list_plans(payment_product_id)` | product key | List billing plans |
| `create_checkout_session(...)` | product key | Create a checkout session (returns `checkout_url`) |
| `check_access(user_id, feature_code, ...)` | product key | Feature access check |
| `get_paddle_config()` | public | Paddle client token + environment |
| `get_product_by_accounts_id(accounts_product_id)` | admin key | Resolve a payments product by its Accounts ID |
| `get_mrr(...)` | admin key | Fetch MRR analytics |
| `get_billing_portal(customer_id, ...)` | — | Not yet implemented (raises `NotImplementedError`) |

## License

MIT
