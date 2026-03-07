/**
 * Tests for webhook signature validation and payload parsing helpers.
 * @module lib/triggers/__tests__/webhook-inbound
 */
import { describe, expect, it } from "vitest";

import {
  parseWebhookRequestPayload,
  signWebhookBody,
  verifyWebhookSignature,
} from "../webhook-auth";

describe("verifyWebhookSignature", () => {
  it("accepts raw hex and sha256-prefixed signatures", () => {
    const body = JSON.stringify({ lead: "Alice" });
    const signature = signWebhookBody("secret-key", body);

    expect(
      verifyWebhookSignature({
        body,
        secret: "secret-key",
        signature,
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        body,
        secret: "secret-key",
        signature: `sha256=${signature}`,
      }),
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyWebhookSignature({
        body: '{"lead":"Alice"}',
        secret: "secret-key",
        signature: "sha256=deadbeef",
      }),
    ).toBe(false);
  });
});

describe("parseWebhookRequestPayload", () => {
  it("returns JSON objects directly", () => {
    expect(
      parseWebhookRequestPayload('{"lead":"Alice","source":"PropertyGuru"}', "application/json"),
    ).toEqual({
      lead: "Alice",
      source: "PropertyGuru",
    });
  });

  it("wraps non-object JSON payloads", () => {
    expect(parseWebhookRequestPayload('["listing-1","listing-2"]', "application/json")).toEqual({
      body: ["listing-1", "listing-2"],
      content_type: "application/json",
    });
  });

  it("parses form-encoded payloads into key-value objects", () => {
    expect(
      parseWebhookRequestPayload("lead=Alice&status=new", "application/x-www-form-urlencoded"),
    ).toEqual({
      lead: "Alice",
      status: "new",
    });
  });
});
