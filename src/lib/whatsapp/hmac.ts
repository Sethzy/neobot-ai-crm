/**
 * HMAC-SHA256 signature verification for WhatsApp webhook requests.
 * Ensures requests originate from trusted OpenClaw relay.
 */

import crypto from "crypto";

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verifies HMAC-SHA256 signature from webhook request.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param payload - For POST: JSON body string. For GET: query string (e.g., "phone=%2B15551234567")
 * @param signature - The signature from x-webhook-signature header
 * @param timestamp - The timestamp from x-webhook-timestamp header
 * @param secret - The shared HMAC secret
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string
): VerifyResult {
  if (!signature || !timestamp) {
    return { valid: false, error: "Missing signature or timestamp" };
  }

  // Check timestamp freshness (prevent replay attacks)
  const timestampMs = parseInt(timestamp, 10);
  if (isNaN(timestampMs)) {
    return { valid: false, error: "Invalid timestamp" };
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, error: "Timestamp too old or too new" };
  }

  // Compute expected signature: HMAC-SHA256(timestamp.payload)
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: "Invalid signature" };
    }

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { valid: false, error: "Invalid signature" };
    }
  } catch {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}

/**
 * Generates HMAC-SHA256 signature for outbound webhook calls.
 * Used when Sunder calls back to OpenClaw with results.
 *
 * @param body - The request body to sign
 * @param secret - The shared HMAC secret
 */
export function generateWebhookSignature(
  body: string,
  secret: string
): { signature: string; timestamp: string } {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return { signature, timestamp };
}
