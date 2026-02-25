/**
 * Tests for HMAC-SHA256 signature verification for WhatsApp webhooks.
 */

import { describe, it, expect } from "vitest";
import { verifyWebhookSignature, generateWebhookSignature } from "./hmac";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-123";

  it("should return valid for correct signature", () => {
    const body = '{"phone":"+15551234567"}';
    const { signature, timestamp } = generateWebhookSignature(body, secret);

    const result = verifyWebhookSignature(body, signature, timestamp, secret);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should return invalid for wrong signature", () => {
    const body = '{"phone":"+15551234567"}';
    const timestamp = Date.now().toString();
    const wrongSignature = "0".repeat(64);

    const result = verifyWebhookSignature(body, wrongSignature, timestamp, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("should return invalid for missing signature", () => {
    const body = '{"phone":"+15551234567"}';
    const timestamp = Date.now().toString();

    const result = verifyWebhookSignature(body, undefined, timestamp, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Missing signature or timestamp");
  });

  it("should return invalid for stale timestamp", () => {
    const body = '{"phone":"+15551234567"}';
    const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
    const { signature } = generateWebhookSignature(body, secret);

    const result = verifyWebhookSignature(body, signature, staleTimestamp, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Timestamp too old or too new");
  });

  it("should work with query strings for GET requests", () => {
    // GET requests sign the query string, not the body
    const queryString = "phone=%2B15551234567";
    const { signature, timestamp } = generateWebhookSignature(queryString, secret);

    const result = verifyWebhookSignature(queryString, signature, timestamp, secret);

    expect(result.valid).toBe(true);
  });
});

describe("generateWebhookSignature", () => {
  it("should generate signature and timestamp", () => {
    const body = '{"test":"data"}';
    const secret = "my-secret";

    const result = generateWebhookSignature(body, secret);

    expect(result.signature).toHaveLength(64); // SHA256 hex = 64 chars
    expect(result.timestamp).toMatch(/^\d+$/);
  });
});
