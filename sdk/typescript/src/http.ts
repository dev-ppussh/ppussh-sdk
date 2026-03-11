// ppussh/src/http.ts
/**
 * Shared HTTP transport layer for the PPUSSH TypeScript SDK.
 *
 * Responsibilities:
 * - Owns an Axios instance per base URL.
 * - Implements the retry policy:
 *     5xx errors  → up to MAX_RETRIES attempts, exponential back-off (500ms, 1s, 2s).
 *     429         → respects Retry-After header; falls back to 1s default.
 *     4xx (≠ 429) → never retried; raised immediately.
 *     Network errors → treated like 5xx for retry purposes.
 * - Raises typed PpusshError subclasses; callers never see raw Axios errors.
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  isAxiosError,
} from "axios";
import {
  PpusshAuthError,
  PpusshConsentRequired,
  PpusshError,
  PpusshNetworkError,
  PpusshPaymentError,
} from "./errors";

// ── Retry constants ──────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const BACKOFF_SCHEDULE = [500, 1000, 2000]; // ms
const RETRY_AFTER_DEFAULT = 1000; // ms fallback for missing Retry-After
const MAX_RATE_LIMIT_RETRIES = 2;

const SDK_USER_AGENT = "ppussh-ts/1.0.0";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headers: Record<string, string | undefined>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (raw !== undefined) {
    const secs = parseFloat(raw);
    if (!isNaN(secs)) return secs * 1000;
  }
  return RETRY_AFTER_DEFAULT;
}

function extractDetail(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return String(b["detail"] ?? b["error"] ?? b["message"] ?? "");
  }
  return "";
}

function raiseClientError(
  status: number,
  body: unknown,
  isPayments: boolean,
): never {
  // ── CONSENT_REQUIRED ───────────────────────────────────────────────────────
  if (
    status === 403 &&
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>)["status"] === "CONSENT_REQUIRED"
  ) {
    const b = body as Record<string, unknown>;
    throw new PpusshConsentRequired(
      `User has not consented to product '${b["product_name"] ?? ""}'.`,
      {
        clientId: String(b["client_id"] ?? ""),
        productName: String(b["product_name"] ?? ""),
        productDescription: String(b["product_description"] ?? ""),
        statusCode: 403,
        responseBody: body,
      },
    );
  }

  // ── 401 ───────────────────────────────────────────────────────────────────
  if (status === 401) {
    throw new PpusshAuthError(extractDetail(body) || "Authentication failed (HTTP 401).", {
      statusCode: 401,
      responseBody: body,
    });
  }

  // ── Payments errors ───────────────────────────────────────────────────────
  if (isPayments) {
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    throw new PpusshPaymentError(
      String(b["message"] ?? `Payments error (HTTP ${status}).`),
      {
        code: b["code"] ? String(b["code"]) : null,
        statusCode: status,
        responseBody: body,
      },
    );
  }

  // ── Generic ───────────────────────────────────────────────────────────────
  throw new PpusshError(extractDetail(body) || `Request failed (HTTP ${status}).`, {
    statusCode: status,
    responseBody: body,
  });
}

// ── RequestOptions ────────────────────────────────────────────────────────────

export interface RequestOptions {
  headers?: Record<string, string>;
  /** JSON body */
  json?: unknown;
  /** Form-encoded body (application/x-www-form-urlencoded) */
  form?: Record<string, string>;
  /** Query string parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Set to true when calling the Payments service for correct error parsing */
  isPayments?: boolean;
}

// ── HttpTransport ─────────────────────────────────────────────────────────────

export class HttpTransport {
  private readonly _client: AxiosInstance;

  constructor(baseUrl: string) {
    this._client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: 30_000,
      headers: {
        "User-Agent": SDK_USER_AGENT,
        Accept: "application/json",
      },
      // Never throw on non-2xx — we handle status codes ourselves
      validateStatus: () => true,
    });
  }

  async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<AxiosResponse> {
    const { headers, json, form, params, isPayments = false } = options;

    const config: AxiosRequestConfig = {
      method,
      url: path,
      params,
      headers: { ...headers },
    };

    if (json !== undefined) {
      config.data = json;
      (config.headers as Record<string, string>)["Content-Type"] = "application/json";
    } else if (form !== undefined) {
      config.data = new URLSearchParams(form).toString();
      (config.headers as Record<string, string>)["Content-Type"] =
        "application/x-www-form-urlencoded";
    }

    let attempt = 0;
    let rateLimitAttempt = 0;
    let lastError: unknown = null;

    while (attempt < MAX_RETRIES) {
      let response: AxiosResponse;

      try {
        response = await this._client.request(config);
      } catch (err: unknown) {
        // Network / connection error
        lastError = err;
        attempt++;
        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_SCHEDULE[Math.min(attempt - 1, BACKOFF_SCHEDULE.length - 1)] ?? 2000;
          await sleep(delay);
        }
        continue;
      }

      const status = response.status;

      // ── 429 Rate limited ─────────────────────────────────────────────────
      if (status === 429) {
        if (rateLimitAttempt >= MAX_RATE_LIMIT_RETRIES) {
          throw new PpusshNetworkError(
            `Rate limited on ${method} ${path} after ${rateLimitAttempt + 1} attempts.`,
            { statusCode: 429, responseBody: response.data },
          );
        }
        const delay = parseRetryAfter(
          response.headers as Record<string, string | undefined>,
        );
        await sleep(delay);
        rateLimitAttempt++;
        continue; // does NOT consume from MAX_RETRIES
      }

      // ── 5xx Server error ─────────────────────────────────────────────────
      if (status >= 500) {
        attempt++;
        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_SCHEDULE[Math.min(attempt - 1, BACKOFF_SCHEDULE.length - 1)] ?? 2000;
          await sleep(delay);
          continue;
        }
        throw new PpusshNetworkError(
          `Server error ${status} on ${method} ${path} after ${MAX_RETRIES} attempts.`,
          { statusCode: status, responseBody: response.data },
        );
      }

      // ── 4xx Client errors (not retried) ──────────────────────────────────
      if (status >= 400) {
        raiseClientError(status, response.data, isPayments);
      }

      // ── 2xx success ───────────────────────────────────────────────────────
      return response;
    }

    // Fell through via network errors
    throw new PpusshNetworkError(
      `All ${MAX_RETRIES} attempts failed for ${method} ${path}.`,
      { cause: lastError },
    );
  }
}
