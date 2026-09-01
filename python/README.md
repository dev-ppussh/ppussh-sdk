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
| `PPUSSH_ACCOUNTS_ADMIN_KEY`    | Optional admin key for Accounts server-to-server entitlement calls |

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
    payments_admin_key="your-payments-admin-key",      # optional legacy fallback for payments calls
    accounts_admin_key="your-accounts-admin-key",      # optional; for server-to-server entitlements
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
    provider="paddle",  # optional — "paddle" | "dodo" (uses plan default if omitted)
    return_url="https://yourapp.example.com/billing/success",  # optional
)
```

### Checkout session (hosted portal)

```python
session = await client.payments.create_checkout_session(
    user_id=token.user.id,
    plan_id="plan-uuid",
    return_url="https://yourapp.example.com/billing/success",
    idempotency_key=str(uuid4()),
    provider="paddle",  # optional
)
# → redirect to session.checkout_url
```

### Server-to-server entitlements

Grant, update, or revoke a user's per-product entitlements without a login —
the SDK authenticates with the `accounts_admin_key` and passes the user id
explicitly. This is how your product backend provisions access to a user who
is not currently logged in.

```python
# Grant a user access to your product (member role + beta flag)
entitlement = await client.accounts.grant_entitlement(
    user_id="uuid-of-user",
    product_id="uuid-of-your-product",
    role="member",
    feature_flags={"beta": True},
)

# Toggle flags later (None removes a flag, others are merged)
await client.accounts.update_entitlement_flags(
    entitlement.id,
    {"beta": False, "founding": None},
)

# List what a user has access to
ents = await client.accounts.list_user_entitlements("uuid-of-user")

# Revoke access entirely
await client.accounts.revoke_entitlement(entitlement.id)
```

### One-time credit purchases (server-to-server)

Credit purchases are server-to-server too: pass the product/admin key and the
explicit `user_id`, then redirect the user to the returned checkout URL.

```python
# Start checkout — the user's browser is redirected to checkout_url
checkout = await client.payments.initiate_checkout(
    package_id="pack_waitly_500",
    user_id="uuid-of-user",
    return_url="https://yourapp.example.com/checkout/success",
    idempotency_key=str(uuid4()),
    provider="bachs",  # optional — "paddle" | "dodo" | "bachs" (uses package default if omitted)
)

# After payment, claim the credits atomically
claimed = await client.payments.claim_transaction(
    user_id="uuid-of-user",
    transaction_id=checkout.transaction_id,
)
if claimed.claimed:
    grant_credits(claimed.credit_amount)

# Reconcile any PAID-but-undelivered purchases
pending = await client.payments.get_unclaimed_transactions("uuid-of-user")
```

### Credit packages (admin)

```python
pkgs = await client.payments.list_packages(product_id="prod-abc")
pkg = await client.payments.get_package("pack_waitly_500")

created = await client.payments.create_package(
    package_id="pack_waitly_500",
    product_id="prod-abc",
    credit_amount=500,
    price_cents=4900,          # integer cents — never float
    provider_price_ids={"paddle": "pri_01abc...", "bachs": "price_bachs_xxx"},
)

updated = await client.payments.update_package("pack_waitly_500", price_cents=3900)
```

### Subscription details & sandbox

```python
details = await client.payments.get_subscription_details("uuid-of-subscription")
print(details.subscription.status, details.billing_history)

# Sandbox — generate test checkouts / transactions without real payment
sb = await client.payments.sandbox_checkout(
    product_accounts_id="uuid-of-product",
    item_type="CREDIT_PACKAGE",
    price_id="pack_waitly_500",
    user_id="uuid-of-user",
)
sb_tx = await client.payments.list_sandbox_transactions("uuid-of-user")
sb_claim = await client.payments.claim_sandbox_transaction(
    user_id="uuid-of-user",
    transaction_id=sb.transaction_id,
)
```

### Analytics & product lookup

```python
# Look up a payments product by its Accounts product ID
payments_product = await client.payments.get_product_by_accounts_id("uuid-of-accounts-product")

# Fetch MRR breakdown (optionally scoped to a product)
mrr = await client.payments.get_mrr(product_id="uuid-of-product")
print(mrr.total_mrr_cents, mrr.by_plan)
```

### Subscription access check

```python
access = await client.payments.check_access(user_id=user.id, feature_code="premium_nodes")
if not access.has_access:
    raise HTTPException(403, f"Upgrade required for {access.feature_name}")
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
| `list_user_entitlements(user_id)` | admin key — list a user's per-product entitlements |
| `grant_entitlement(user_id, product_id, *, role?, feature_flags?)` | admin key — grant a user access to a product |
| `update_entitlement_flags(entitlement_id, feature_flags)` | admin key — merge flag updates (`None` removes a flag) |
| `revoke_entitlement(entitlement_id)` | admin key — revoke a user's entitlement |

### `client.payments`

| Method | Auth | Description |
| ------ | ---- | ----------- |
| `create_customer(owner_user_id, ...)` | product key | Create or retrieve a customer record |
| `get_customer(customer_id)` | product key | Fetch a customer by ID |
| `create_subscription(...)` | product key | Create a subscription (supports `provider`, `return_url`) |
| `list_subscriptions(customer_id, ...)` | product key | List subscriptions for a customer |
| `get_subscription(subscription_id)` | product key | Fetch a subscription by ID |
| `cancel_subscription(subscription_id, ...)` | product key | Cancel a subscription |
| `list_plans(payment_product_id)` | product key | List billing plans |
| `create_checkout_session(...)` | product key | Create a checkout session (supports `provider`) |
| `check_access(user_id, feature_code, ...)` | product key | Feature access check |
| `get_paddle_config()` | public | Paddle client token + environment |
| `get_product_by_accounts_id(accounts_product_id)` | product key | Resolve a payments product by its Accounts ID |
| `get_mrr(...)` | product key | Fetch MRR analytics |
| `initiate_checkout(package_id, *, user_id, ...)` | either key | Start a credit checkout (supports `provider`: `"paddle"`, `"dodo"`, `"bachs"`) |
| `claim_transaction(user_id, transaction_id)` | either key | Atomically claim a PAID credit transaction |
| `get_unclaimed_transactions(user_id)` | either key | List PAID + undelivered transactions for a user |
| `list_packages(*, product_id?)` | product key | List credit packages |
| `get_package(package_id)` | product key | Fetch a credit package by ID |
| `create_package(...)` | product key | Create a credit package |
| `update_package(package_id, ...)` | product key | Update a credit package |
| `get_subscription_details(subscription_id)` | either key | Fetch a subscription + billing history (invoices) |
| `sandbox_checkout(...)` | either key | Generate a sandbox test checkout URL |
| `list_sandbox_transactions(user_id, ...)` | either key | List a user's sandbox transactions |
| `claim_sandbox_transaction(user_id, transaction_id)` | either key | Claim a PAID sandbox transaction |
| `get_billing_portal(customer_id, ...)` | — | Not yet implemented (raises `NotImplementedError`) |

## License

MIT
