/**
 * Verifies Anthropic webhook signatures using the Standard Webhooks spec.
 *
 * Anthropic (like Svix) sends three headers with every webhook delivery:
 *   - `webhook-id`        — unique delivery ID
 *   - `webhook-timestamp`  — unix seconds when the event was sent
 *   - `webhook-signature`  — space-separated `v1,<base64-sig>` signatures
 *
 * The signed content is `${webhookId}.${timestamp}.${rawBody}`.
 * The secret is a `whsec_`-prefixed base64-encoded key.
 *
 * @module lib/managed-agents/webhook-verify
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookHeaders {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}

/** Reject timestamps older than 5 minutes to prevent replay attacks. */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Verifies an Anthropic webhook signature.
 *
 * @returns `true` if the signature is valid and the timestamp is fresh.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
): boolean {
  const webhookId = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];

  if (!webhookId || !timestamp || !signatures) {
    return false;
  }

  // Verify timestamp freshness
  const timestampSec = parseInt(timestamp, 10);
  if (Number.isNaN(timestampSec)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  // Strip `whsec_` prefix and decode base64 secret
  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64",
  );

  // Signed content: "{webhook-id}.{webhook-timestamp}.{body}"
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // The header may contain multiple space-separated signatures (key rotation).
  // Each is prefixed with "v1," per Standard Webhooks spec.
  for (const sig of signatures.split(" ")) {
    const commaIndex = sig.indexOf(",");
    if (commaIndex === -1) continue;

    const version = sig.slice(0, commaIndex);
    const value = sig.slice(commaIndex + 1);
    if (version !== "v1" || !value) continue;

    try {
      const expected = Buffer.from(expectedSignature, "utf8");
      const actual = Buffer.from(value, "utf8");
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
