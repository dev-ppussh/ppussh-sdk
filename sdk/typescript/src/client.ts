// ppussh/src/client.ts
/**
 * PpusshClient — the unified entry point for the PPUSSH Ecosystem TypeScript SDK.
 *
 * URL resolution order (highest → lowest priority):
 *   1. Explicit constructor option (accountsUrl, paymentsUrl)
 *   2. Environment variable (PPUSSH_ACCOUNTS_URL, PPUSSH_PAYMENTS_URL)
 *
 * Both URLs are **required** — an Error is thrown at construction time if
 * neither a constructor option nor an env var is present for a given service.
 *
 * Usage — minimal:
 *
 *   import { PpusshClient } from "ppussh";
 *
 *   const client = new PpusshClient({
 *     clientId: "your-product-client-id",
 *     clientSecret: "your-product-client-secret",
 *     paymentsAdminKey: "your-payments-admin-key", // optional
 *   });
 *
 *   // OIDC callback handler (e.g. Express / Fastify route)
 *   const token = await client.accounts.exchangeCode(code, redirectUri);
 *
 *   // Token verification middleware
 *   const result = await client.accounts.verifyToken(bearerToken);
 *
 *   // Billing
 *   const customer = await client.payments.createCustomer(token.user.id);
 */

import { AccountsNamespace } from "./accounts/namespace";
import { HttpTransport } from "./http";
import { PaymentsNamespace } from "./payments/namespace";

// ── Environment variable names ───────────────────────────────────────────────
const ENV_ACCOUNTS_URL = "PPUSSH_ACCOUNTS_URL";
const ENV_PAYMENTS_URL = "PPUSSH_PAYMENTS_URL";

function resolveUrl(kwarg: string | undefined, envVar: string, label: string): string {
  if (kwarg) return kwarg.replace(/\/$/, "");
  const envVal =
    typeof process !== "undefined" ? process.env[envVar] : undefined;
  if (envVal) return envVal.replace(/\/$/, "");
  throw new Error(
    `${label} URL is required. ` +
      `Pass it as a constructor option or set the ${envVar} environment variable.`,
  );
}

export interface PpusshClientOptions {
  /** Your product's client_id UUID (from the Accounts admin console). */
  clientId: string;
  /** Your product's client_secret. Server-side only — never expose in browser code. */
  clientSecret: string;
  /**
   * Static admin API key for the Payments service.
   * Required for payments.listPlans(), getMrr(), getProductByAccountsId().
   */
  paymentsAdminKey?: string;
  /**
   * Accounts service base URL. Falls back to the PPUSSH_ACCOUNTS_URL env var.
   * Required — one of the two must be set.
   */
  accountsUrl?: string;
  /**
   * Payments service base URL. Falls back to the PPUSSH_PAYMENTS_URL env var.
   * Required — one of the two must be set.
   */
  paymentsUrl?: string;
}

export class PpusshClient {
  readonly accounts: AccountsNamespace;
  readonly payments: PaymentsNamespace;

  private readonly _accountsUrl: string;
  private readonly _paymentsUrl: string;
  private readonly _accountsTransport: HttpTransport;
  private readonly _paymentsTransport: HttpTransport;

  constructor(options: PpusshClientOptions) {
    if (!options.clientId) throw new Error("clientId must not be empty.");
    if (!options.clientSecret) throw new Error("clientSecret must not be empty.");

    this._accountsUrl = resolveUrl(options.accountsUrl, ENV_ACCOUNTS_URL, "Accounts");
    this._paymentsUrl = resolveUrl(options.paymentsUrl, ENV_PAYMENTS_URL, "Payments");

    this._accountsTransport = new HttpTransport(this._accountsUrl);
    this._paymentsTransport = new HttpTransport(this._paymentsUrl);

    this.accounts = new AccountsNamespace(this._accountsTransport, {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      accountsUrl: this._accountsUrl,
    });

    this.payments = new PaymentsNamespace(this._paymentsTransport, {
      adminKey: options.paymentsAdminKey,
    });
  }

  /** Resolved Accounts service base URL. */
  get accountsUrl(): string {
    return this._accountsUrl;
  }

  /** Resolved Payments service base URL. */
  get paymentsUrl(): string {
    return this._paymentsUrl;
  }

  toString(): string {
    return `PpusshClient(accountsUrl=${this._accountsUrl}, paymentsUrl=${this._paymentsUrl})`;
  }
}
