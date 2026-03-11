# ppussh

Official TypeScript/JavaScript SDK for the [PPUSSH](https://ppussh.com) platform —
Accounts (OIDC / OAuth 2.0) and Payments in a single client.

## Requirements

- Node.js 18+
- An Accounts **clientId** and **clientSecret** (obtain from the Accounts admin console)
- A running instance of the Accounts and Payments services

## Installation

```bash
npm install ppussh
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

```ts
import { PpusshClient } from "ppussh";

// URLs are read from PPUSSH_ACCOUNTS_URL / PPUSSH_PAYMENTS_URL env vars,
// or pass them explicitly:
const client = new PpusshClient({
  clientId: "your-product-client-id",
  clientSecret: "your-product-client-secret",
  paymentsAdminKey: "your-payments-admin-key", // optional; needed for admin calls
  // accountsUrl: "https://accounts.example.com", // or set PPUSSH_ACCOUNTS_URL
  // paymentsUrl: "https://payments.example.com", // or set PPUSSH_PAYMENTS_URL
});
```

### OIDC callback (Express example)

```ts
import express from "express";
import { PpusshClient } from "ppussh";

const app = express();
const client = new PpusshClient({ clientId: "...", clientSecret: "..." });

const REDIRECT_URI = "https://yourapp.example.com/auth/callback";

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query as { code: string };
  const token = await client.accounts.exchangeCode(code, REDIRECT_URI);
  // token.user contains the authenticated user's profile
  res.json({ userId: token.user.id, email: token.user.email });
});
```

### Token verification middleware

```ts
import { PpusshClient, PpusshAuthError } from "ppussh";

const client = new PpusshClient({ clientId: "...", clientSecret: "..." });

async function requireAuth(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Response(null, { status: 401 });
  const bearer = auth.slice(7);
  try {
    const result = await client.accounts.verifyToken(bearer);
    return result.userId;
  } catch (err) {
    if (err instanceof PpusshAuthError) throw new Response(null, { status: 401 });
    throw err;
  }
}
```

### Token refresh

```ts
// Uses the refresh token stored internally after exchangeCode()
const newToken = await client.accounts.refresh();

// Or pass an explicit refresh token:
const newToken = await client.accounts.refresh("rt_...");
```

### Logout

```ts
await client.accounts.logout(); // uses stored refresh token
```

### Billing — create a customer and subscription

```ts
import { randomUUID } from "crypto";

// Create or retrieve a customer record
const customer = await client.payments.createCustomer(token.user.id, {
  workspaceId: "ws-123", // optional
});

// List available plans for a product
const plans = await client.payments.listPlans("prod-abc");

// Subscribe the customer
const subscription = await client.payments.createSubscription({
  customerId: customer.id,
  paymentProductId: "prod-abc",
  planKey: "pro",
  idempotencyKey: randomUUID(),
});
```

## Error handling

All exceptions are subclasses of `PpusshError`:

```ts
import {
  PpusshError,           // base class
  PpusshAuthError,       // 401 — invalid or expired token / credentials
  PpusshConsentRequired, // 403 — user hasn't consented to this product's scopes
  PpusshPaymentError,    // non-2xx from the Payments service
  PpusshNetworkError,    // all retries exhausted / connection failure
} from "ppussh";

try {
  const token = await client.accounts.exchangeCode(code, REDIRECT_URI);
} catch (err) {
  if (err instanceof PpusshConsentRequired) {
    // Redirect the user to the consent flow
    redirectToConsent(err.clientId, err.productName);
  } else if (err instanceof PpusshAuthError) {
    // Invalid code or expired credentials
  } else if (err instanceof PpusshNetworkError) {
    // Retry later
  }
}
```

### Retry policy

| Condition               | Behaviour                                                |
| ----------------------- | -------------------------------------------------------- |
| 5xx / network error     | Up to 3 attempts, exponential backoff (0.5 s, 1 s, 2 s) |
| 429 Too Many Requests   | Respects `Retry-After` header, max 2 retries             |
| 4xx (not 429)           | Never retried — raises immediately                       |

## API reference

### `client.accounts`

| Method | Description |
| ------ | ----------- |
| `exchangeCode(code, redirectUri)` | Exchange an auth code for tokens (OIDC callback) |
| `refresh(refreshToken?)` | Refresh the access token |
| `verifyToken(accessToken)` | Validate an incoming bearer token (use in middleware) |
| `logout(refreshToken?)` | Revoke the session |
| `getUser(accessToken?)` | Fetch the authenticated user's profile |
| `getEntitlements(accessToken?)` | List the user's product entitlements |
| `getSessions(accessToken?)` | List the user's active sessions |

### `client.payments`

| Method | Description |
| ------ | ----------- |
| `createCustomer(ownerUserId, opts?)` | Create or retrieve a customer record |
| `getCustomer(customerId)` | Fetch a customer by ID |
| `createSubscription(opts)` | Create a subscription |
| `listSubscriptions(customerId, opts?)` | List subscriptions for a customer |
| `getSubscription(subscriptionId)` | Fetch a subscription by ID |
| `cancelSubscription(subscriptionId, opts?)` | Cancel a subscription |
| `listPlans(paymentProductId)` | List billing plans *(requires `paymentsAdminKey`)* |
| `getProductByAccountsId(accountsProductId)` | Resolve a payments product by its Accounts ID *(requires `paymentsAdminKey`)* |
| `getMrr(opts?)` | Fetch MRR analytics *(requires `paymentsAdminKey`)* |

## License

MIT
