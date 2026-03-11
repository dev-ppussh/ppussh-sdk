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
 *     paymentsAdminKey: "your-payments-admin-key", // optional
 *   });
 *
 *   // Build the login redirect URL
 *   const loginUrl = client.accounts.buildLoginUrl(redirectUri, state);
 *
 *   // OIDC callback
 *   const token = await client.accounts.exchangeCode(code, redirectUri);
 *
 *   // Middleware token check
 *   const result = await client.accounts.verifyToken(bearer);
 *
 *   // Billing
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
  EntitlementResponse,
  LogoutResult,
  SessionResponse,
  TokenResponse,
  UserInToken,
  UserProfile,
  VerifyTokenResult,
} from "./accounts/types";
export { effectiveAccessToken } from "./accounts/types";

// ── Payments types ────────────────────────────────────────────────────────────
export type {
  CustomerCreateRequest,
  CustomerResponse,
  MRRByPlan,
  MRRByProduct,
  MRRResponse,
  PaymentProductResponse,
  PlanResponse,
  SubscriptionCancelRequest,
  SubscriptionCreateRequest,
  SubscriptionListResponse,
  SubscriptionResponse,
  SubscriptionStatus,
} from "./payments/types";

// ── Webhooks ──────────────────────────────────────────────────────────────────
export { verifyWebhook } from "./webhooks";
export type { WebhookEvent, WebhookEventType } from "./webhooks";
