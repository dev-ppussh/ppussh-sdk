// ppussh/src/payments/namespace.ts
/**
 * PaymentsNamespace — customer, subscription, and plan operations.
 *
 * Auth model:
 * - Customer + subscription endpoints (POST /customers, POST /subscriptions, etc.)
 *   are unauthenticated at the HTTP level — the Payments service validates the
 *   owner_user_id against Accounts internally.
 * - Admin endpoints (listPlans, getMrr) require the payments ADMIN_API_KEY
 *   sent as the `X-Admin-Key` header. Set once at PpusshClient construction
 *   time via `paymentsAdminKey`.
 *
 * Idempotency:
 * - createSubscription() requires a caller-supplied idempotencyKey.
 *   Retry with the *same* key after a 502 — the server guarantees exactly-once creation.
 * - createCustomer() is idempotent on (owner_user_id, workspace_id) — no key needed.
 */

import { PpusshPaymentError } from "../errors";
import { HttpTransport } from "../http";
import {
  CustomerCreateRequest,
  CustomerResponse,
  MRRResponse,
  PaymentProductResponse,
  PlanResponse,
  SubscriptionListResponse,
  SubscriptionResponse,
} from "./types";

export class PaymentsNamespace {
  private readonly _http: HttpTransport;
  private readonly _adminKey: string | null;

  constructor(transport: HttpTransport, options: { adminKey?: string | null } = {}) {
    this._http = transport;
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
   * @param metadata            Arbitrary key/value pairs.
   * @throws PpusshPaymentError  Various codes; see error.code for specifics.
   */
  async createSubscription(options: {
    customerId: string;
    paymentProductId: string;
    planKey: string;
    idempotencyKey: string;
    provider?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<SubscriptionResponse> {
    const response = await this._http.request("POST", "/subscriptions", {
      json: {
        customer_id: options.customerId,
        payment_product_id: options.paymentProductId,
        plan_key: options.planKey,
        idempotency_key: options.idempotencyKey,
        ...(options.provider != null && { provider: options.provider }),
        ...(options.metadata != null && { metadata: options.metadata }),
      },
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
      { isPayments: true },
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
        isPayments: true,
      },
    );
    return response.data as SubscriptionResponse;
  }

  // ── Plans (admin) ──────────────────────────────────────────────────────────

  /**
   * List all billing plans for a Payments product.
   *
   * Requires the `paymentsAdminKey` set on PpusshClient construction.
   * Plans with status "archived" are included — filter client-side if needed.
   *
   * @param paymentProductId  UUID string of the PaymentProduct.
   * @throws PpusshPaymentError  code="product_not_found" on 404.
   * @throws Error               If no paymentsAdminKey was provided at construction.
   */
  async listPlans(paymentProductId: string): Promise<PlanResponse[]> {
    this._requireAdminKey("listPlans");
    const response = await this._http.request(
      "GET",
      `/admin/products/${paymentProductId}/plans`,
      {
        headers: { "X-Admin-Key": this._adminKey! },
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
   * @throws Error  If no paymentsAdminKey was provided at construction.
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

  // ── Analytics (admin) ──────────────────────────────────────────────────────

  /**
   * Fetch Monthly Recurring Revenue breakdown.
   *
   * Requires `paymentsAdminKey`.
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

  private _requireAdminKey(method: string): void {
    if (!this._adminKey) {
      throw new Error(
        `payments.${method}() requires a paymentsAdminKey. ` +
          "Pass paymentsAdminKey: '...' to PpusshClient().",
      );
    }
  }
}
