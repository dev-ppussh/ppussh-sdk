// ppussh/src/webhooks.ts
/**
 * Webhook signature verification for PPUSSH Accounts events.
 *
 * The Accounts service dispatches signed HTTP POST requests to a URL you register
 * on your product.  Each request carries an `X-Webhook-Signature` header in the
 * format `sha256=<hmac-sha256-hex>`.
 *
 * Usage:
 *
 *   import { verifyWebhook, WebhookEvent } from "ppussh";
 *
 *   app.post("/webhooks/accounts", express.raw({ type: "*\/*" }), (req, res) => {
 *     const sig = req.headers["x-webhook-signature"] as string;
 *     if (!verifyWebhook(req.body, sig, process.env.ACCOUNTS_CLIENT_SECRET!)) {
 *       return res.status(401).send("Invalid signature");
 *     }
 *     const event: WebhookEvent = JSON.parse(req.body);
 *     // handle event.type ...
 *     res.status(200).send("ok");
 *   });
 *
 * Algorithm:
 * HMAC-SHA256 over the raw request body, using the product's client_secret as
 * the key.  The digest is hex-encoded and prefixed with `sha256=`.
 * Comparison uses crypto.timingSafeEqual to prevent timing attacks.
 */

import { createHmac, timingSafeEqual } from "crypto";

// ── Event types ───────────────────────────────────────────────────────────────

export type WebhookEventType =
  | "user.created"
  | "user.email_verified"
  | "user.updated"
  | "user.deleted"
  | "user.social_linked"
  | "user.consent_granted"
  | "session.revoked";

// ── Webhook event interface ───────────────────────────────────────────────────

/**
 * Parsed payload of a PPUSSH Accounts webhook request.
 *
 * Parse after verifying the signature:
 *
 *   const event: WebhookEvent = JSON.parse(rawBody);
 */
export interface WebhookEvent {
  type: WebhookEventType;
  user_id: string;   // UUID string
  email: string;
  product_id: string; // UUID string
  timestamp: string;  // ISO 8601
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA256 signature on an Accounts webhook request.
 *
 * @param rawBody         The raw (unparsed) request body as a Buffer or string.
 *                        Do **not** JSON.parse before passing in.
 * @param signatureHeader The value of the `X-Webhook-Signature` header,
 *                        e.g. `"sha256=abcdef1234..."`.
 * @param clientSecret    Your product's `client_secret` string (from the Accounts
 *                        admin console).  This is the HMAC key.
 * @returns `true` if the signature is valid, `false` otherwise.
 *          Returns `false` (not throws) for malformed or missing signatures so
 *          callers can safely use the return value as a boolean gate.
 */
export function verifyWebhook(
  rawBody: Buffer | string,
  signatureHeader: string,
  clientSecret: string,
): boolean {
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  try {
    const expectedDigest = createHmac("sha256", clientSecret)
      .update(rawBody)
      .digest("hex");
    const expected = `sha256=${expectedDigest}`;

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);

    // Buffers must be the same length for timingSafeEqual
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
