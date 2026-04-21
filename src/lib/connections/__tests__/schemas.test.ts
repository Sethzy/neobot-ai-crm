/**
 * Tests for connection Zod schemas.
 * @module lib/connections/__tests__/schemas
 */
import { describe, expect, it } from "vitest";

import {
  connectionInsertSchema,
  connectionRowSchema,
  connectionStatusValues,
  connectionUpdateSchema,
} from "../schemas";

describe("connectionStatusValues", () => {
  it("includes active, inactive, error, and pending", () => {
    expect(connectionStatusValues).toEqual(["active", "inactive", "error", "pending"]);
  });
});

describe("connectionRowSchema", () => {
  const validRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_123abc",
    toolkit_slug: "gmail",
    display_name: "Gmail",
    status: "active",
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  };
  const validRowWithNewColumns = {
    ...validRow,
    account_identifier: "user@gmail.com",
    auth_redirect_url: "https://auth.composio.dev/gmail",
    auth_redirect_expires_at: "2026-03-07T00:15:00.000Z",
    activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    tool_count: 45,
  };

  it("parses a valid connection row", () => {
    expect(connectionRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("accepts pending status", () => {
    expect(
      connectionRowSchema.safeParse({
        ...validRow,
        status: "pending",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(
      connectionRowSchema.safeParse({
        ...validRow,
        status: "broken",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing connected account id", () => {
    const missingConnectedAccountId = { ...validRow };
    delete missingConnectedAccountId.composio_connected_account_id;

    expect(connectionRowSchema.safeParse(missingConnectedAccountId).success).toBe(false);
  });

  it("parses a row with new columns", () => {
    expect(connectionRowSchema.safeParse(validRowWithNewColumns).success).toBe(true);
  });

  it("defaults activated_tools to an empty array when omitted", () => {
    const result = connectionRowSchema.safeParse(validRow);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.activated_tools).toEqual([]);
    }
  });

  it("defaults tool_count to 0 when omitted", () => {
    const result = connectionRowSchema.safeParse(validRow);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.tool_count).toBe(0);
    }
  });

  it("accepts null account_identifier", () => {
    expect(
      connectionRowSchema.safeParse({
        ...validRow,
        account_identifier: null,
      }).success,
    ).toBe(true);
  });

  it("defaults auth redirect fields to null when omitted", () => {
    const result = connectionRowSchema.safeParse(validRow);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.auth_redirect_url).toBeNull();
      expect(result.data.auth_redirect_expires_at).toBeNull();
    }
  });

  it("does not include tool_schemas in the schema shape", () => {
    expect("tool_schemas" in connectionRowSchema.shape).toBe(false);
  });
});

describe("connectionInsertSchema", () => {
  it("parses the callback upsert payload", () => {
    expect(
      connectionInsertSchema.safeParse({
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        composio_connected_account_id: "conn_123abc",
        toolkit_slug: "googlecalendar",
        display_name: "Google Calendar",
        status: "active",
      }).success,
    ).toBe(true);
  });

  it("allows an omitted display_name", () => {
    expect(
      connectionInsertSchema.safeParse({
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        composio_connected_account_id: "conn_123abc",
        toolkit_slug: "googlecalendar",
        status: "active",
      }).success,
    ).toBe(true);
  });

  it("accepts insert payloads with new columns", () => {
    expect(
      connectionInsertSchema.safeParse({
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        composio_connected_account_id: "conn_123abc",
        toolkit_slug: "gmail",
        status: "pending",
        account_identifier: null,
        auth_redirect_url: "https://auth.composio.dev/gmail",
        auth_redirect_expires_at: "2026-03-07T00:15:00.000Z",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_count: 0,
      }).success,
    ).toBe(true);
  });

  it("defaults activated_tools and tool_count in insert payloads", () => {
    const result = connectionInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "conn_123abc",
      toolkit_slug: "gmail",
      status: "active",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.activated_tools).toEqual([]);
      expect(result.data.tool_count).toBe(0);
      expect(result.data.auth_redirect_url).toBeUndefined();
      expect(result.data.auth_redirect_expires_at).toBeUndefined();
    }
  });

  it("does not include tool_schemas in parsed data", () => {
    const result = connectionInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "conn_123abc",
      toolkit_slug: "gmail",
      status: "active",
      tool_schemas: {
        GMAIL_SEND_EMAIL: {
          description: "Send email",
          inputParameters: {},
        },
      },
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect("tool_schemas" in result.data).toBe(false);
    }
  });
});

describe("connectionUpdateSchema", () => {
  it("allows partial updates keyed by id", () => {
    expect(
      connectionUpdateSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "error",
      }).success,
    ).toBe(true);
  });

  it("allows callback reconciliation fields to be updated", () => {
    expect(
      connectionUpdateSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        composio_connected_account_id: "conn_456def",
        toolkit_slug: "gmail",
        account_identifier: "agent@example.com",
        auth_redirect_url: "https://auth.composio.dev/gmail",
        auth_redirect_expires_at: "2026-03-07T00:15:00.000Z",
        status: "active",
      }).success,
    ).toBe(true);
  });

  it("does not include tool_schemas in the schema shape", () => {
    expect("tool_schemas" in connectionUpdateSchema.shape).toBe(false);
  });
});
