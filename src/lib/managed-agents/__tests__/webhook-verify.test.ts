/**
 * @module lib/managed-agents/__tests__/webhook-verify.test
 */
import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";

import { verifyWebhookSignature } from "../webhook-verify";

/** Helper: compute a valid v1 signature for the Standard Webhooks spec. */
function sign(
  body: string,
  webhookId: string,
  timestamp: string,
  secretBase64: string,
): string {
  const secretBytes = Buffer.from(secretBase64, "base64");
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  const sig = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");
  return `v1,${sig}`;
}

const SECRET_BASE64 = Buffer.from("test-webhook-secret-key-32bytes!").toString("base64");
const SECRET = `whsec_${SECRET_BASE64}`;

function makeHeaders(body: string, overrides?: Partial<Record<string, string>>) {
  const id = overrides?.["webhook-id"] ?? "msg_test123";
  const ts = overrides?.["webhook-timestamp"] ?? String(Math.floor(Date.now() / 1000));
  const sig = overrides?.["webhook-signature"] ?? sign(body, id, ts, SECRET_BASE64);
  return {
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": sig,
  };
}

describe("verifyWebhookSignature", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for a valid signature", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body);
    expect(verifyWebhookSignature(body, headers, SECRET)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body, {
      "webhook-signature": "v1,aW52YWxpZHNpZ25hdHVyZQ==",
    });
    expect(verifyWebhookSignature(body, headers, SECRET)).toBe(false);
  });

  it("returns false for a tampered body", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body);
    expect(verifyWebhookSignature('{"type":"tampered"}', headers, SECRET)).toBe(false);
  });

  it("returns false when timestamp is too old", () => {
    const body = '{"type":"session.status_idled"}';
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const headers = makeHeaders(body, { "webhook-timestamp": oldTimestamp });
    // Re-sign with the old timestamp
    headers["webhook-signature"] = sign(body, headers["webhook-id"], oldTimestamp, SECRET_BASE64);
    expect(verifyWebhookSignature(body, headers, SECRET)).toBe(false);
  });

  it("returns false when headers are missing", () => {
    const body = '{"type":"session.status_idled"}';
    expect(
      verifyWebhookSignature(body, { "webhook-id": "", "webhook-timestamp": "", "webhook-signature": "" }, SECRET),
    ).toBe(false);
  });

  it("handles multiple signatures (key rotation) — matches second", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body);
    // Prepend an invalid signature
    headers["webhook-signature"] = `v1,aW52YWxpZA== ${headers["webhook-signature"]}`;
    expect(verifyWebhookSignature(body, headers, SECRET)).toBe(true);
  });

  it("handles secret without whsec_ prefix", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body);
    expect(verifyWebhookSignature(body, headers, SECRET_BASE64)).toBe(true);
  });

  it("returns false for non-v1 signature versions", () => {
    const body = '{"type":"session.status_idled"}';
    const headers = makeHeaders(body);
    // Replace v1 with v2
    headers["webhook-signature"] = headers["webhook-signature"].replace("v1,", "v2,");
    expect(verifyWebhookSignature(body, headers, SECRET)).toBe(false);
  });
});
