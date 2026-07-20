// ppussh/src/errors.ts
/**
 * Typed exception hierarchy for the PPUSSH TypeScript SDK.
 *
 * All errors carry the raw HTTP status and response body so callers
 * can inspect them without parsing generic message strings.
 *
 * Hierarchy:
 *   PpusshError                 ← base; always catch this for a catch-all
 *   ├── PpusshAuthError         ← 401 from any endpoint
 *   ├── PpusshConsentRequired   ← 403 with status="CONSENT_REQUIRED"
 *   ├── PpusshPaymentError      ← non-2xx from the Payments service
 *   └── PpusshNetworkError      ← all retries exhausted / connection error
 */

export class PpusshError extends Error {
  readonly statusCode: number | null;
  readonly responseBody: unknown;

  constructor(
    message: string,
    options: { statusCode?: number | null; responseBody?: unknown } = {},
  ) {
    super(message);
    this.name = "PpusshError";
    this.statusCode = options.statusCode ?? null;
    this.responseBody = options.responseBody ?? null;
    // Maintain proper prototype chain in transpiled ES5 output
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised on 401 responses from any PPUSSH endpoint.
 *
 * Common causes:
 * - Invalid or expired access token passed to verifyToken()
 * - Bad client_secret during exchangeCode() / refresh() / logout()
 * - Authorization code already used or expired
 * - Refresh token replayed (all sessions are revoked server-side)
 */
export class PpusshAuthError extends PpusshError {
  constructor(
    message: string,
    options: { statusCode?: number | null; responseBody?: unknown } = {},
  ) {
    super(message, { statusCode: options.statusCode ?? 401, ...options });
    this.name = "PpusshAuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when the Accounts service returns HTTP 403 with
 * `status = "CONSENT_REQUIRED"`.
 *
 * The user has not granted consent for your product. Redirect the user
 * to the Accounts consent screen.
 */
export class PpusshConsentRequired extends PpusshError {
  readonly clientId: string;
  readonly productName: string;
  readonly productDescription: string;

  constructor(
    message: string,
    options: {
      clientId?: string;
      productName?: string;
      productDescription?: string;
      statusCode?: number | null;
      responseBody?: unknown;
    } = {},
  ) {
    super(message, { statusCode: options.statusCode ?? 403, responseBody: options.responseBody });
    this.name = "PpusshConsentRequired";
    this.clientId = options.clientId ?? "";
    this.productName = options.productName ?? "";
    this.productDescription = options.productDescription ?? "";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised on non-2xx responses from the Payments service.
 *
 * `code` is the machine-readable error code from the Payments API
 * (e.g. "customer_not_found", "provider_unavailable").
 */
export class PpusshPaymentError extends PpusshError {
  readonly code: string | null;

  constructor(
    message: string,
    options: {
      code?: string | null;
      statusCode?: number | null;
      responseBody?: unknown;
    } = {},
  ) {
    super(message, { statusCode: options.statusCode, responseBody: options.responseBody });
    this.name = "PpusshPaymentError";
    this.code = options.code ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when all retry attempts are exhausted or a connection-level
 * error occurs (refused connection, DNS failure, timeout).
 */
export class PpusshNetworkError extends PpusshError {
  constructor(
    message: string,
    options: { statusCode?: number | null; responseBody?: unknown; cause?: unknown } = {},
  ) {
    super(message, { statusCode: options.statusCode, responseBody: options.responseBody });
    this.name = "PpusshNetworkError";
    if (options.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
