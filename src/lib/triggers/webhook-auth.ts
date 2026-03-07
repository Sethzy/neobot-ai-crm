/**
 * Signature validation and request-body parsing helpers for inbound webhook triggers.
 * @module lib/triggers/webhook-auth
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SHA256_PREFIX = "sha256=";
const SUPPORTED_SIGNATURE_HEADERS = ["x-sunder-signature", "x-hub-signature-256"] as const;

function normalizeSignature(signature: string): string | null {
  const trimmedSignature = signature.trim().toLowerCase();
  const withoutPrefix = trimmedSignature.startsWith(SHA256_PREFIX)
    ? trimmedSignature.slice(SHA256_PREFIX.length)
    : trimmedSignature;

  return /^[a-f0-9]+$/.test(withoutPrefix) ? withoutPrefix : null;
}

/**
 * Computes the canonical SHA-256 HMAC hex digest for one webhook body.
 */
export function signWebhookBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Reads the first supported webhook signature header from a request.
 */
export function getWebhookSignatureHeader(headers: Headers): string | null {
  for (const headerName of SUPPORTED_SIGNATURE_HEADERS) {
    const headerValue = headers.get(headerName);
    if (headerValue?.trim()) {
      return headerValue.trim();
    }
  }

  return null;
}

/**
 * Validates a webhook HMAC header using timing-safe comparison.
 */
export function verifyWebhookSignature(args: {
  secret: string;
  body: string;
  signature: string;
}): boolean {
  const normalizedSignature = normalizeSignature(args.signature);
  if (!normalizedSignature) {
    return false;
  }

  const expectedSignature = signWebhookBody(args.secret, args.body);
  const receivedBuffer = Buffer.from(normalizedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function parseFormEncodedPayload(body: string): Record<string, unknown> {
  const params = new URLSearchParams(body);
  const parsedPayload: Record<string, unknown> = {};

  for (const [key, value] of params.entries()) {
    parsedPayload[key] = value;
  }

  return parsedPayload;
}

/**
 * Parses raw webhook request bodies into object payloads suitable for trigger-event context.
 */
export function parseWebhookRequestPayload(
  body: string,
  contentType: string | null,
): Record<string, unknown> {
  const trimmedBody = body.trim();
  if (trimmedBody.length === 0) {
    return {};
  }

  const normalizedContentType = contentType?.toLowerCase() ?? null;

  if (normalizedContentType?.includes("application/x-www-form-urlencoded")) {
    return parseFormEncodedPayload(trimmedBody);
  }

  if (normalizedContentType?.includes("application/json")) {
    try {
      const parsedJson = JSON.parse(trimmedBody) as unknown;

      if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
        return parsedJson as Record<string, unknown>;
      }

      return {
        body: parsedJson,
        content_type: normalizedContentType,
      };
    } catch {
      return {
        body: trimmedBody,
        content_type: normalizedContentType,
      };
    }
  }

  return {
    body: trimmedBody,
    content_type: normalizedContentType,
  };
}
