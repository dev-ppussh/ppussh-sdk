// ppussh/src/client.ts
/**
 * PpusshClient — the unified entry point for the PPUSSH Ecosystem TypeScript SDK.
 *
 * The gateway is the single API entry point.  Pass `gatewayUrl` and the SDK
 * routes accounts requests to the gateway root and payments requests to
 * `gatewayUrl + "/payments"`.
 *
 * Usage — minimal:
 *
 *   import { PpusshClient } from "ppussh";
 *
 *   const client = new PpusshClient({
 *     clientId: "your-product-client-id",
 *     clientSecret: "your-product-client-secret",
 *     gatewayUrl: "https://api.example.com",
 *     accountsFrontendUrl: "https://accounts.example.com",
 *     paymentsProductKey: "your-payments-product-key", // optional
 *   });
 *
 *   // OIDC callback — the product issues its own session cookies from the token
 *   const token = await client.accounts.exchangeCode(code, redirectUri);
 *   const customer = await client.payments.createCustomer(token.user.id);
 */

import { AccountsNamespace } from "./accounts/namespace";
import { HttpTransport } from "./http";
import { PaymentsNamespace } from "./payments/namespace";

// ── Environment variable names ───────────────────────────────────────────────
const ENV_GATEWAY_URL = "PPUSSH_GATEWAY_URL";
const ENV_ACCOUNTS_FRONTEND_URL = "PPUSSH_ACCOUNTS_FRONTEND_URL";
const ENV_PAYMENTS_ADMIN_KEY = "PPUSSH_PAYMENTS_ADMIN_KEY";
const ENV_ACCOUNTS_ADMIN_KEY = "PPUSSH_ACCOUNTS_ADMIN_KEY";

function resolveEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env[name]) {
    return process.env[name];
  }
  return undefined;
}

export interface PpusshClientOptions {
  /** Your product's client_id UUID (from the Accounts admin console). */
  clientId: string;
  /** Your product's client_secret. Server-side only — never expose in browser code. */
  clientSecret: string;
  /**
   * The API gateway base URL — the single entry for all API calls.
   * Falls back to PPUSSH_GATEWAY_URL. Required.
   */
  gatewayUrl?: string;
  /**
   * Accounts **frontend** base URL (the login page users are redirected to).
   * Falls back to PPUSSH_ACCOUNTS_FRONTEND_URL. Required.
   */
  accountsFrontendUrl?: string;
  /**
   * Product API key for Payments. Optional — only needed when Payments is active.
   */
  paymentsProductKey?: string;
  /**
   * Admin API key for Payments. Optional legacy fallback — the product key
   * already authorizes all Payments calls. Falls back to PPUSSH_PAYMENTS_ADMIN_KEY.
   */
  paymentsAdminKey?: string;
  /**
   * Admin API key for Accounts. Optional — required for server-to-server
   * entitlement grant/revoke calls (the user does not need to be logged in).
   * Falls back to PPUSSH_ACCOUNTS_ADMIN_KEY.
   */
  accountsAdminKey?: string;
}

export class PpusshClient {
  readonly accounts: AccountsNamespace;
  readonly payments: PaymentsNamespace;

  private readonly _gatewayUrl: string;
  private readonly _accountsFrontendUrl: string;
  private readonly _paymentsAdminKey: string | undefined;
  private readonly _accountsAdminKey: string | undefined;
  private readonly _accountsTransport: HttpTransport;
  private readonly _paymentsTransport: HttpTransport;

  constructor(options: PpusshClientOptions) {
    if (!options.clientId) throw new Error("clientId must not be empty.");
    if (!options.clientSecret) throw new Error("clientSecret must not be empty.");

    const gw = (options.gatewayUrl ?? resolveEnv(ENV_GATEWAY_URL))?.replace(/\/$/, "");
    if (!gw) {
      throw new Error(
        "gatewayUrl is required. " +
          "Pass it as a constructor option or set the PPUSSH_GATEWAY_URL environment variable.",
      );
    }

    const frontend = (options.accountsFrontendUrl ?? resolveEnv(ENV_ACCOUNTS_FRONTEND_URL))?.replace(/\/$/, "");
    if (!frontend) {
      throw new Error(
        "accountsFrontendUrl is required. " +
          "Pass it as a constructor option or set the PPUSSH_ACCOUNTS_FRONTEND_URL environment variable.",
      );
    }

    this._gatewayUrl = gw;
    this._accountsFrontendUrl = frontend;
    this._paymentsAdminKey = options.paymentsAdminKey ?? resolveEnv(ENV_PAYMENTS_ADMIN_KEY);
    this._accountsAdminKey = options.accountsAdminKey ?? resolveEnv(ENV_ACCOUNTS_ADMIN_KEY);

    // Accounts transport hits the gateway root (gateway strips nothing for /users, /admin, /auth/*)
    this._accountsTransport = new HttpTransport(this._gatewayUrl);
    // Payments transport hits gateway + /payments (gateway strips the /payments prefix)
    this._paymentsTransport = new HttpTransport(`${this._gatewayUrl}/payments`);

    this.accounts = new AccountsNamespace(this._accountsTransport, {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      accountsFrontendUrl: this._accountsFrontendUrl,
      adminKey: this._accountsAdminKey,
    });

    this.payments = new PaymentsNamespace(this._paymentsTransport, {
      productKey: options.paymentsProductKey,
      adminKey: this._paymentsAdminKey,
    });
  }

  /** Resolved gateway base URL. */
  get gatewayUrl(): string {
    return this._gatewayUrl;
  }

  /** Resolved Accounts frontend service base URL. */
  get accountsFrontendUrl(): string {
    return this._accountsFrontendUrl;
  }

  /** Resolved Payments admin key, if configured (optional legacy fallback). */
  get paymentsAdminKey(): string | undefined {
    return this._paymentsAdminKey;
  }

  /** Resolved Accounts admin key, if configured. */
  get accountsAdminKey(): string | undefined {
    return this._accountsAdminKey;
  }

  toString(): string {
    return `PpusshClient(gatewayUrl=${this._gatewayUrl}, accountsFrontendUrl=${this._accountsFrontendUrl})`;
  }
}
