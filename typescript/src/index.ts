// ppussh/src/index.ts
/**
 * PPUSSH TypeScript SDK — public API surface.
 *
 * Quick start:
 *
 *   import { PpusshClient } from "ppussh";
 *
 *   const client = new PpusshClient({
 *     clientId: "your-client-id",
 *     clientSecret: "your-client-secret",
 *     paymentsProductKey: "your-payments-product-key", // optional
 *   });
 *
 *   // Build the login redirect URL
 *   const loginUrl = client.accounts.buildLoginUrl(redirectUri, state);
 *
 *   // OIDC callback — the product issues its own session cookies from the token
 *   const token = await client.accounts.exchangeCode(code, redirectUri);
 *   const customer = await client.payments.createCustomer(token.user.id);
 *
 * All errors are subclasses of PpusshError:
 *
 *   import { PpusshError, PpusshAuthError, PpusshConsentRequired } from "ppussh";
 *
 * Webhook signature verification:
 *
 *   import { verifyWebhook, WebhookEvent } from "ppussh";
 *
 *   if (!verifyWebhook(rawBody, signatureHeader, clientSecret)) {
 *     return res.status(401).send("Invalid signature");
 *   }
 *   const event: WebhookEvent = JSON.parse(rawBody);
 */

// ── Client ───────────────────────────────────────────────────────────────────
export { PpusshClient } from "./client";
export type { PpusshClientOptions } from "./client";

// ── Errors ───────────────────────────────────────────────────────────────────
export {
  PpusshAuthError,
  PpusshConsentRequired,
  PpusshError,
  PpusshNetworkError,
  PpusshPaymentError,
} from "./errors";

// ── Accounts types ────────────────────────────────────────────────────────────
export type {
  EntitlementCreateRequest,
  EntitlementUpdateRequest,
  EntitlementWithProductResponse,
  FeatureFlags,
  TokenResponse,
  UserInToken,
} from "./accounts/types";

// ── Payments types ────────────────────────────────────────────────────────────
export type {
  AccessResult,
  CheckoutRequest,
  CheckoutResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  ClaimRequest,
  ClaimResponse,
  CustomerCreateRequest,
  CustomerResponse,
  InvoiceHistoryItem,
  MRRByPlan,
  MRRByProduct,
  MRRResponse,
  PackageCreateRequest,
  PackageResponse,
  PackageUpdateRequest,
  PaddleConfigResponse,
  PaymentProductResponse,
  PlanResponse,
  SandboxCheckoutRequest,
  SandboxCheckoutResponse,
  SandboxClaimRequest,
  SandboxClaimResponse,
  SandboxTransactionItem,
  SandboxTransactionsResponse,
  SubscriptionBillingDetails,
  SubscriptionCancelRequest,
  SubscriptionCreateRequest,
  SubscriptionListResponse,
  SubscriptionResponse,
  SubscriptionStatus,
  TransactionResponse,
} from "./payments/types";

// ── Webhooks ──────────────────────────────────────────────────────────────────
export { verifyWebhook } from "./webhooks";
export type { WebhookEvent, WebhookEventType } from "./webhooks";
