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
| `PPUSSH_PAYMENTS_ADMIN_KEY`    | Optional legacy admin key for Payments (product key already authorizes all calls) |
| `PPUSSH_ACCOUNTS_ADMIN_KEY`    | Optional admin key for Accounts server-to-server entitlement calls |

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
  paymentsAdminKey: "your-payments-admin-key",     // optional legacy fallback
  accountsAdminKey: "your-accounts-admin-key",     // optional; for server-to-server entitlements
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

### Server-to-server entitlements

Grant, update, or revoke a user's per-product entitlements without a login —
the SDK authenticates with the `accountsAdminKey` and passes the user id
explicitly. This is how your product backend provisions access to a user who
is not currently logged in.

```ts
// Grant a user access to your product (member role + beta flag)
const ent = await client.accounts.grantEntitlement({
  userId: "uuid-of-user",
  productId: "uuid-of-your-product",
  role: "member",
  featureFlags: { beta: true },
});

// Toggle flags later (null removes a flag, others are merged)
await client.accounts.updateEntitlementFlags(ent.id, {
  beta: false,
  founding: null,
});

// List what a user has access to
const ents = await client.accounts.listUserEntitlements("uuid-of-user");

// Revoke access entirely
await client.accounts.revokeEntitlement(ent.id);
```

### One-time credit purchases (server-to-server)

Credit purchases are server-to-server too: pass the product/admin key and the
explicit `userId`, then redirect the user to the returned checkout URL.

```ts
// Start checkout — the user's browser is redirected to checkoutUrl
const checkout = await client.payments.initiateCheckout("pack_waitly_500", "uuid-of-user", {
  returnUrl: "https://yourapp.example.com/checkout/success",
  idempotencyKey: randomUUID(),
});

// After payment, claim the credits atomically
const claimed = await client.payments.claimTransaction("uuid-of-user", checkout.transactionId);
if (claimed.claimed) grantCredits(claimed.credit_amount);

// Reconcile any PAID-but-undelivered purchases
const pending = await client.payments.getUnclaimedTransactions("uuid-of-user");
```

### Credit packages (product/admin key)

```ts
const pkgs = await client.payments.listPackages({ productId: "prod-abc" });
const pkg = await client.payments.getPackage("pack_waitly_500");

const created = await client.payments.createPackage({
  packageId: "pack_waitly_500",
  productId: "prod-abc",
  creditAmount: 500,
  priceCents: 4900, // integer cents — never float
  providerPriceIds: { paddle: "pri_01abc..." },
});

const updated = await client.payments.updatePackage("pack_waitly_500", { priceCents: 3900 });
```

### Subscription details & sandbox

```ts
const details = await client.payments.getSubscriptionDetails("uuid-of-subscription");
console.log(details.subscription.status, details.billing_history);

// Sandbox — generate test checkouts / transactions without real payment
const sb = await client.payments.sandboxCheckout({
  productAccountsId: "uuid-of-product",
  itemType: "CREDIT_PACKAGE",
  priceId: "pack_waitly_500",
  userId: "uuid-of-user",
});
const sbTx = await client.payments.listSandboxTransactions("uuid-of-user");
const sbClaim = await client.payments.claimSandboxTransaction("uuid-of-user", sb.transactionId);
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
| `listUserEntitlements(userId)` | admin key — list a user's per-product entitlements |
| `grantEntitlement(opts)` | admin key — grant a user access to a product |
| `updateEntitlementFlags(entitlementId, featureFlags)` | admin key — merge flag updates (`null` removes a flag) |
| `revokeEntitlement(entitlementId)` | admin key — revoke a user's entitlement |

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
| `getProductByAccountsId(accountsProductId)` | product key | Resolve a payments product by its Accounts ID |
| `getMrr(opts?)` | product key | Fetch MRR analytics |
| `initiateCheckout(packageId, userId, opts?)` | either key | Start a credit checkout for a user (server-to-server) |
| `claimTransaction(userId, transactionId)` | either key | Atomically claim a PAID credit transaction |
| `getUnclaimedTransactions(userId)` | either key | List PAID + undelivered transactions for a user |
| `listPackages(opts?)` | product key | List credit packages |
| `getPackage(packageId)` | product key | Fetch a credit package by ID |
| `createPackage(opts)` | product key | Create a credit package |
| `updatePackage(packageId, opts?)` | product key | Update a credit package |
| `getSubscriptionDetails(subscriptionId)` | either key | Fetch a subscription + billing history (invoices) |
| `sandboxCheckout(opts)` | either key | Generate a sandbox test checkout URL |
| `listSandboxTransactions(userId, opts?)` | either key | List a user's sandbox transactions |
| `claimSandboxTransaction(userId, transactionId)` | either key | Claim a PAID sandbox transaction |
| `getBillingPortal(customerId, opts?)` | — | Not yet implemented (throws Error) |

## License

MIT
