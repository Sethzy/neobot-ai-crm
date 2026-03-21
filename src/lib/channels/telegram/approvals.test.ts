/**
 * Tests for Telegram approval helpers.
 * @module lib/channels/telegram/approvals.test
 */
import { describe, expect, it } from "vitest";

import {
  buildApprovalCallbackData,
  buildApprovalText,
  parseApprovalCallback,
} from "./approvals";

describe("buildApprovalText", () => {
  it("includes the tool name in bold", () => {
    expect(buildApprovalText("delete_contact", { contactId: "123" })).toContain(
      "<b>delete_contact</b>",
    );
  });

  it("includes the approval header", () => {
    expect(buildApprovalText("send_email", { to: "a@b.com" })).toContain("Approval Required");
  });

  it("truncates long tool input", () => {
    expect(buildApprovalText("tool", { data: "x".repeat(1000) }).length).toBeLessThan(700);
  });

  it("escapes html entities in tool input", () => {
    const text = buildApprovalText("test", { query: "<script>alert(1)</script>" });
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
  });
});

describe("buildApprovalCallbackData", () => {
  it("creates approve callback data", () => {
    expect(buildApprovalCallbackData("abc-123", true)).toBe("approve:abc-123");
  });

  it("creates deny callback data", () => {
    expect(buildApprovalCallbackData("abc-123", false)).toBe("deny:abc-123");
  });
});

describe("parseApprovalCallback", () => {
  it("parses approve callback payloads", () => {
    expect(parseApprovalCallback("approve:abc-123")).toEqual({
      action: "approve",
      approvalId: "abc-123",
    });
  });

  it("parses deny callback payloads", () => {
    expect(parseApprovalCallback("deny:abc-123")).toEqual({
      action: "deny",
      approvalId: "abc-123",
    });
  });

  it("returns null for malformed payloads", () => {
    expect(parseApprovalCallback("unknown:abc")).toBeNull();
    expect(parseApprovalCallback("nocolon")).toBeNull();
    expect(parseApprovalCallback("")).toBeNull();
  });

  it("keeps approval ids containing colons intact", () => {
    expect(parseApprovalCallback("approve:uuid:with:colons")).toEqual({
      action: "approve",
      approvalId: "uuid:with:colons",
    });
  });
});
