# ppussh

Official TypeScript/JavaScript SDK for the [PPUSSH](https://ppussh.com) platform —
Accounts (OIDC / OAuth 2.0) and Payments in a single client.

## Requirements

- Node.js 18+
- An Accounts **clientId** and **clientSecret** (obtain from the Accounts admin console)
- A running instance of the Accounts and Payments services (typically behind the API gateway)

## Installation

```bash
npm install ppussh
```

## Configuration

The SDK authenticates **as your product** — it uses your `clientId` /
`clientSecret` for the OAuth token exchange and product/admin API keys for
Payments calls. It never forwards end-user tokens: your product backend issues
its own session cookies from the token returned by `exchangeCode()`.

The **gateway** is the single entry point. Pass `gatewayUrl` and the SDK
routes accounts calls to the gateway root and payments calls to
`gatewayUrl + "/payments"`.

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

```ts
import { PpusshClient } from "ppussh";

const client = new PpusshClient({
  clientId: "your-product-client-id",
  clientSecret: "your-product-client-secret",
  gatewayUrl: "https://api.example.com",
  accountsFrontendUrl: "https://accounts.example.com",
  paymentsProductKey: "your-payments-product-key", // optional; only if Payments is active
  paymentsAdminKey: "your-payments-admin-key",     // optional; only for admin calls
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
  // The SDK authenticated AS the product; token.user is the logged-in user.
  // Set your own session cookie from token.user.id / token.access_token.
  res.json({ userId: token.user.id, email: token.user.email });
});
```

### Login redirect

```ts
import crypto from "crypto";
const state = crypto.randomBytes(32).toString("base64url");
const loginUrl = client.accounts.buildLoginUrl(REDIRECT_URI, state);
// → redirect the browser to loginUrl
```

### Billing — create a customer and subscription

```ts
import { randomUUID } from "crypto";

const customer = await client.payments.createCustomer(token.user.id, {
  workspaceId: "ws-123", // optional
});

const plans = await client.payments.listPlans("prod-abc");

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
    redirectToConsent(err.clientId, err.productName);
  } else if (err instanceof PpusshAuthError) {
    // Invalid code or expired credentials
  } else if (err instanceof PpusshNetworkError) {
    // Retry later
  }
}
```

### Retry policy

| Condition               | Behaviour                                                 |
| ----------------------- | --------------------------------------------------------- |
| 5xx / network error     | Up to 3 attempts, exponential backoff (0.5 s, 1 s, 2 s)  |
| 429 Too Many Requests   | Respects `Retry-After` header, max 2 retries              |
| 4xx (not 429)           | Never retried — raises immediately                        |

## API reference

### `client.accounts`

| Method | Description |
| ------ | ----------- |
| `buildLoginUrl(redirectUri, state, opts?)` | Build the Accounts login redirect URL |
| `exchangeCode(code, redirectUri, opts?)` | Exchange an auth code for a token (OIDC callback) |

### `client.payments`

| Method | Auth | Description |
| ------ | ---- | ----------- |
| `createCustomer(ownerUserId, opts?)` | product key | Create or retrieve a customer record |
| `getCustomer(customerId)` | product key | Fetch a customer by ID |
| `createSubscription(opts)` | product key | Create a subscription |
| `listSubscriptions(customerId, opts?)` | product key | List subscriptions for a customer |
| `getSubscription(subscriptionId)` | product key | Fetch a subscription by ID |
| `cancelSubscription(subscriptionId, opts?)` | product key | Cancel a subscription |
| `listPlans(paymentProductId)` | product key | List billing plans |
| `createCheckoutSession(opts)` | product key | Create a checkout session (returns `checkoutUrl`) |
| `checkAccess(userId, featureCode, workspaceId?)` | product key | Feature access check |
| `getPaddleConfig()` | public | Paddle client token + environment |
| `getProductByAccountsId(accountsProductId)` | admin key | Resolve a payments product by its Accounts ID |
| `getMrr(opts?)` | admin key | Fetch MRR analytics |
| `getBillingPortal(customerId, opts?)` | — | Not yet implemented (throws Error) |

## License

MIT
