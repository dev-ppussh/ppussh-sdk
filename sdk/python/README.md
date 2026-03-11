# ppussh

Official Python SDK for the [PPUSSH](https://ppussh.com) platform — Accounts
(OIDC / OAuth 2.0) and Payments in a single, async-first client.

## Requirements

- Python 3.12+
- An Accounts **client_id** and **client_secret** (obtain from the Accounts
  admin console)
- A running instance of the Accounts and Payments services

## Installation

```bash
pip install ppussh
```

## Configuration

The SDK requires the base URLs for both services. Set them via environment
variables (recommended for production) or pass them directly to the constructor.

| Environment variable    | Purpose                        |
| ----------------------- | ------------------------------ |
| `PPUSSH_ACCOUNTS_URL`   | Base URL of the Accounts API   |
| `PPUSSH_PAYMENTS_URL`   | Base URL of the Payments API   |

```bash
export PPUSSH_ACCOUNTS_URL="https://accounts.example.com"
export PPUSSH_PAYMENTS_URL="https://payments.example.com"
```

## Quick start

```python
from ppussh import PpusshClient

# URLs are read from PPUSSH_ACCOUNTS_URL / PPUSSH_PAYMENTS_URL env vars,
# or pass them explicitly:
client = PpusshClient(
    client_id="your-product-client-id",
    client_secret="your-product-client-secret",
    payments_admin_key="your-payments-admin-key",  # optional; needed for admin calls
    # accounts_url="https://accounts.example.com",  # or set PPUSSH_ACCOUNTS_URL
    # payments_url="https://payments.example.com",  # or set PPUSSH_PAYMENTS_URL
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
    # token.user contains the authenticated user's profile
    return {"user_id": token.user.id, "email": token.user.email}
```

### Token verification middleware

```python
from fastapi import Request, HTTPException
from ppussh import PpusshClient, PpusshAuthError

client = PpusshClient(client_id="...", client_secret="...")

async def require_auth(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401)
    bearer = auth_header.removeprefix("Bearer ")
    try:
        result = await client.accounts.verify_token(bearer)
    except PpusshAuthError:
        raise HTTPException(status_code=401)
    return result.user_id
```

### Token refresh

```python
# Uses the refresh token stored internally after exchange_code()
new_token = await client.accounts.refresh()

# Or pass an explicit refresh token:
new_token = await client.accounts.refresh(refresh_token="...")
```

### Logout

```python
await client.accounts.logout()  # uses stored refresh token
```

### Billing — create a customer and subscription

```python
from uuid import uuid4

# Create or retrieve a customer record
customer = await client.payments.create_customer(
    owner_user_id=token.user.id,
    workspace_id="ws-123",  # optional
)

# List available plans for a product
plans = await client.payments.list_plans(payment_product_id="prod-abc")

# Subscribe the customer
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
    # Redirect the user to the consent flow
    redirect_to_consent(exc.client_id, exc.product_name)
except PpusshAuthError:
    # Invalid code or expired credentials
    ...
except PpusshNetworkError:
    # Retry later
    ...
```

### Retry policy

| Condition          | Behaviour                                              |
| ------------------ | ------------------------------------------------------ |
| 5xx / network error| Up to 3 attempts, exponential backoff (0.5 s, 1 s, 2 s) |
| 429 Too Many Requests | Respects `Retry-After` header, max 2 retries        |
| 4xx (not 429)      | Never retried — raises immediately                     |

## API reference

### `client.accounts`

| Method | Description |
| ------ | ----------- |
| `exchange_code(code, *, redirect_uri)` | Exchange an auth code for tokens (OIDC callback) |
| `refresh(refresh_token?)` | Refresh the access token |
| `verify_token(access_token)` | Validate an incoming bearer token (use in middleware) |
| `logout(refresh_token?)` | Revoke the session |
| `get_user(access_token?)` | Fetch the authenticated user's profile |
| `get_entitlements(access_token?)` | List the user's product entitlements |
| `get_sessions(access_token?)` | List the user's active sessions |

### `client.payments`

| Method | Description |
| ------ | ----------- |
| `create_customer(owner_user_id, ...)` | Create or retrieve a customer record |
| `get_customer(customer_id)` | Fetch a customer by ID |
| `create_subscription(...)` | Create a subscription |
| `list_subscriptions(customer_id, ...)` | List subscriptions for a customer |
| `get_subscription(subscription_id)` | Fetch a subscription by ID |
| `cancel_subscription(subscription_id, ...)` | Cancel a subscription |
| `list_plans(payment_product_id)` | List billing plans *(requires `payments_admin_key`)* |
| `get_product_by_accounts_id(accounts_product_id)` | Resolve a payments product by its Accounts ID *(requires `payments_admin_key`)* |
| `get_mrr(...)` | Fetch MRR analytics *(requires `payments_admin_key`)* |

## License

MIT
