// ppussh/src/payments/namespace.ts
/**
 * PaymentsNamespace — customer, subscription, and plan operations.
 *
 * Auth model:
 * - All endpoints accept either X-Admin-Key or X-Product-Key header.
 * - Product API key is scoped to a specific product.
 * - Get the product key from the Payments section in the Accounts admin console.
 *
 * Idempotency:
 * - createSubscription() requires a caller-supplied idempotencyKey.
 *   Retry with the *same* key after a 502 — the server guarantees exactly-once creation.
 * - createCustomer() is idempotent on (owner_user_id, workspace_id) — no key needed.
 */

import { PpusshPaymentError } from "../errors";
import { HttpTransport } from "../http";
import {
  AccessResult,
  CheckoutSessionResponse,
  CustomerCreateRequest,
  CustomerResponse,
  MRRResponse,
  PaddleConfigResponse,
  PaymentProductResponse,
  PlanResponse,
  SubscriptionListResponse,
  SubscriptionResponse,
} from "./types";

export class PaymentsNamespace {
  private readonly _http: HttpTransport;
  private readonly _productKey: string | null;
  private readonly _adminKey: string | null;

  constructor(
    transport: HttpTransport,
    options: { productKey?: string | null; adminKey?: string | null } = {},
  ) {
    this._http = transport;
    this._productKey = options.productKey ?? null;
    this._adminKey = options.adminKey ?? null;
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  /**
   * Create (or retrieve) a Payments customer for a PPUSSH user.
   *
   * Idempotent on (owner_user_id, workspace_id) — if a customer already exists
   * for that pair, the existing record is returned without creating a duplicate.
   *
   * @param ownerUserId   UUID string of the Accounts user (from TokenResponse.user.id).
   * @param workspaceId   UUID string of the workspace, or null for a personal account.
   * @param billingEmail  Optional billing email — falls back to the user's account email.
   * @param metadata      Arbitrary key/value pairs stored alongside the customer record.
   * @throws PpusshPaymentError  code="accounts_user_not_found" if ownerUserId doesn't exist.
   */
  async createCustomer(
    ownerUserId: string,
    options: {
      workspaceId?: string | null;
      billingEmail?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<CustomerResponse> {
    const body: CustomerCreateRequest = {
      owner_user_id: ownerUserId,
      workspace_id: options.workspaceId ?? undefined,
      billing_email: options.billingEmail ?? undefined,
      metadata: options.metadata ?? undefined,
    };
    const response = await this._http.request("POST", "/customers", {
      json: body,
      headers: this._getAuthHeaders(),
      isPayments: true,
    });
    return response.data as CustomerResponse;
  }

  /**
   * Retrieve a Payments customer by their Payments UUID.
   *
   * @throws PpusshPaymentError  code="customer_not_found" on 404.
   */
  async getCustomer(customerId: string): Promise<CustomerResponse> {
    const response = await this._http.request("GET", `/customers/${customerId}`, {
      headers: this._getAuthHeaders(),
      isPayments: true,
    });
    return response.data as CustomerResponse;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  /**
   * Create a subscription for a customer on a billing plan.
   *
   * The idempotencyKey guarantees exactly-once creation. On a provider error (502),
   * retry with the **same key** — this is safe.
   *
   * @param customerId          UUID from createCustomer().
   * @param paymentProductId    UUID of the PaymentProduct (from the admin console).
   * @param planKey             Plan identifier, e.g. "pro" or "enterprise".
   * @param idempotencyKey      Unique string per subscription attempt (use UUID v4).
   * @param provider            "paddle" | "dodo" | null (uses plan default).
   * @param returnUrl          URL to redirect after checkout completes (provider redirects here).
   * @param metadata            Arbitrary key/value pairs.
   * @throws PpusshPaymentError  Various codes; see error.code for specifics.
   */
  async createSubscription(options: {
    customerId: string;
    paymentProductId: string;
    planKey: string;
    idempotencyKey: string;
    provider?: string | null;
    returnUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<SubscriptionResponse> {
const response = await this._http.request("POST", "/subscriptions", {
      json: {
        customer_id: options.customerId,
        payment_product_id: options.paymentProductId,
        plan_key: options.planKey,
        idempotency_key: options.idempotencyKey,
        ...(options.provider != null && { provider: options.provider }),
        ...(options.returnUrl != null && { return_url: options.returnUrl }),
        ...(options.metadata != null && { metadata: options.metadata }),
      },
      headers: this._getAuthHeaders(),
      isPayments: true,
    });
    return response.data as SubscriptionResponse;
  }

  /**
   * List subscriptions for a customer, with optional status filter.
   *
   * @param customerId  UUID string.
   * @param status      Filter by status: "active", "cancelled", "trialing", etc.
   * @param page        1-indexed page number (default 1).
   * @param pageSize    Number of results per page, max 100 (default 20).
   */
  async listSubscriptions(
    customerId: string,
    options: {
      status?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<SubscriptionListResponse> {
    const params: Record<string, string | number | boolean | undefined> = {
      customer_id: customerId,
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
    };
    if (options.status) params["status"] = options.status;

    const response = await this._http.request("GET", "/subscriptions", {
      params,
      headers: this._getAuthHeaders(),
      isPayments: true,
    });
    return response.data as SubscriptionListResponse;
  }

  /**
   * Retrieve a single subscription by its Payments UUID.
   *
   * @throws PpusshPaymentError  code="subscription_not_found" on 404.
   */
  async getSubscription(subscriptionId: string): Promise<SubscriptionResponse> {
    const response = await this._http.request(
      "GET",
      `/subscriptions/${subscriptionId}`,
      {
        headers: this._getAuthHeaders(),
        isPayments: true,
      },
    );
    return response.data as SubscriptionResponse;
  }

  /**
   * Cancel a subscription.
   *
   * Idempotent — cancelling an already-cancelled subscription returns the
   * existing record without error.
   *
   * @param subscriptionId      UUID string.
   * @param cancelImmediately   If true, cancel at once.
   *                            If false (default), cancel at end of current billing period.
   */
  async cancelSubscription(
    subscriptionId: string,
    options: { cancelImmediately?: boolean } = {},
  ): Promise<SubscriptionResponse> {
    const response = await this._http.request(
      "DELETE",
      `/subscriptions/${subscriptionId}`,
      {
        json: { cancel_immediately: options.cancelImmediately ?? false },
        headers: this._getAuthHeaders(),
        isPayments: true,
      },
    );
    return response.data as SubscriptionResponse;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Check if a customer has an active subscription.
   *
   * @param customerId  UUID string of the customer.
   * @returns true if customer has an active subscription, false otherwise.
   */
  async hasActiveSubscription(customerId: string): Promise<boolean> {
    try {
      const response = await this._http.request(
        "GET",
        "/subscriptions",
        {
          params: {
            customer_id: customerId,
            status: "active",
            page_size: 1,
          },
          headers: this._getAuthHeaders(),
          isPayments: true,
        },
      );
      const data = response.data as SubscriptionListResponse;
      return data.total > 0;
    } catch {
      return false;
    }
  }

  // ── Plans (product-scoped) ────────────────────────────────────────────────

  /**
   * List all billing plans for a Payments product.
   *
   * Requires the product key to be set on PpusshClient construction.
   * The key must be authorized for the product.
   *
   * @param paymentProductId  UUID string of the PaymentProduct.
   * @throws PpusshPaymentError  code="product_not_found" on 404.
   * @throws Error               If no productKey was provided at construction.
   */
  async listPlans(paymentProductId: string): Promise<PlanResponse[]> {
    this._requireAnyKey("listPlans");
    const response = await this._http.request(
      "GET",
      `/products/${paymentProductId}/plans`,
      {
        headers: this._getAuthHeaders(),
        isPayments: true,
      },
    );
    return response.data as PlanResponse[];
  }

  /**
   * Look up a Payments product by its Accounts product ID.
   *
   * Returns null if the product has not yet been registered in Payments
   * (HTTP 404 is treated as a non-exceptional "not registered yet" state).
   *
   * @throws Error  If no productKey was provided at construction.
   */
  async getProductByAccountsId(
    accountsProductId: string,
  ): Promise<PaymentProductResponse | null> {
    this._requireAdminKey("getProductByAccountsId");
    try {
      const response = await this._http.request(
        "GET",
        `/admin/products/by-accounts-id/${accountsProductId}`,
        {
          headers: { "X-Admin-Key": this._adminKey! },
          isPayments: true,
        },
      );
      return response.data as PaymentProductResponse;
    } catch (err: unknown) {
      if (err instanceof PpusshPaymentError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  // ── Access check ───────────────────────────────────────────────────────────

  /**
   * Check whether a user has access to a specific feature based on their
   * active subscription's plan.
   *
   * Requires the product key to be set on PpusshClient construction.
   *
   * @param userId        UUID string of the Accounts user.
   * @param featureCode   Feature code defined on the plan, e.g. "premium_nodes".
   * @param workspaceId   Optional workspace UUID — required for workspace-scoped billing.
   *
   * @example
   * const access = await ppussh.payments.checkAccess(user.id, "premium_nodes");
   * if (!access.hasAccess) throw new Error("Upgrade required");
   */
  async checkAccess(
    userId: string,
    featureCode: string,
    workspaceId?: string,
  ): Promise<AccessResult> {
    this._requireProductKey("checkAccess");
    const response = await this._http.request(
      "POST",
      "/access/check",
      {
        json: {
          user_id: userId,
          feature_code: featureCode,
          workspace_id: workspaceId ?? null,
        },
        headers: { "X-Product-Key": this._productKey! },
        isPayments: true,
      },
    );
    return response.data as AccessResult;
  }

  // ── Checkout session ──────────────────────────────────────────────────────

  /**
   * Create a checkout session that returns a portal URL for the centralized
   * checkout portal SPA.
   *
   * Requires the product key to be set on PpusshClient construction.
   *
   * @param options.userId           UUID string of the Accounts user.
   * @param options.planId           UUID string of the Payments Plan.
   * @param options.returnUrl        URL where the portal redirects after checkout completes.
   * @param options.idempotencyKey   Unique string per checkout attempt (use UUID v4).
   * @param options.billingEmail     Optional billing email — falls back to Accounts user email.
   * @throws PpusshPaymentError  Various codes — accounts_user_not_found,
   *   plan_not_found, entitlement_required, provider_error, etc.
   * @throws Error               If no productKey was provided at construction.
   */
  async createCheckoutSession(options: {
    userId: string;
    planId: string;
    returnUrl: string;
    idempotencyKey: string;
    billingEmail?: string | null;
  }): Promise<CheckoutSessionResponse> {
    this._requireProductKey("createCheckoutSession");
    const body: Record<string, string | null> = {
      user_id: options.userId,
      plan_id: options.planId,
      return_url: options.returnUrl,
      idempotency_key: options.idempotencyKey,
    };
    if (options.billingEmail != null) {
      body.billing_email = options.billingEmail;
    }
    const response = await this._http.request(
      "POST",
      "/subscriptions/checkout-session",
      {
        json: body,
        headers: { "X-Product-Key": this._productKey! },
        isPayments: true,
      },
    );
    return response.data as CheckoutSessionResponse;
  }

  /**
   * Get the Paddle client token and environment for the checkout portal.
   *
   * This endpoint is public — no product key required.
   */
  async getPaddleConfig(): Promise<PaddleConfigResponse> {
    const response = await this._http.request(
      "GET",
      "/subscriptions/paddle-config",
      { isPayments: true },
    );
    return response.data as PaddleConfigResponse;
  }

  // ── Analytics (admin) ─────────────────────────────────────────────────────

  /**
   * Fetch Monthly Recurring Revenue breakdown.
   *
   * Requires admin key.
   *
   * @param productId   Filter to a specific product UUID (optional).
   * @param startDate   ISO date string e.g. "2025-01-01" (optional).
   * @param endDate     ISO date string e.g. "2025-12-31" (optional).
   */
  async getMrr(options: {
    productId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<MRRResponse> {
    this._requireAdminKey("getMrr");
    const params: Record<string, string | undefined> = {};
    if (options.productId) params["product_id"] = options.productId;
    if (options.startDate) params["start_date"] = options.startDate;
    if (options.endDate) params["end_date"] = options.endDate;

    const response = await this._http.request("GET", "/admin/analytics/mrr", {
      headers: { "X-Admin-Key": this._adminKey! },
      params,
      isPayments: true,
    });
    return response.data as MRRResponse;
  }

  // ── Billing portal (stub) ──────────────────────────────────────────────────

  /**
   * Generate a hosted billing portal URL for a customer.
   *
   * @throws Error  This feature is not yet implemented in the Payments backend.
   */
  async getBillingPortal(
    _customerId: string,
    _options: { returnUrl?: string } = {},
  ): Promise<string> {
    throw new Error(
      "getBillingPortal() is not yet available. " +
        "The Payments backend endpoint has not been implemented.",
    );
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _getAuthHeaders(): Record<string, string> {
    if (this._adminKey) {
      return { "X-Admin-Key": this._adminKey };
    }
    if (this._productKey) {
      return { "X-Product-Key": this._productKey };
    }
    return {};
  }

  private _requireProductKey(method: string): void {
    if (!this._productKey) {
      throw new Error(
        `payments.${method}() requires a paymentsProductKey. ` +
          "Payments may be inactive for your product — pass " +
          "paymentsProductKey: '...' to PpusshClient() to enable plans, checkout, and access checks.",
      );
    }
  }

  private _requireAdminKey(method: string): void {
    if (!this._adminKey) {
      throw new Error(
        `payments.${method}() requires a paymentsAdminKey. ` +
          "Pass paymentsAdminKey: '...' to PpusshClient().",
      );
    }
  }

  private _requireAnyKey(method: string): void {
    if (!this._adminKey && !this._productKey) {
      throw new Error(
        `payments.${method}() requires either a paymentsAdminKey ` +
          "or a paymentsProductKey. Pass one to PpusshClient().",
      );
    }
  }
}
