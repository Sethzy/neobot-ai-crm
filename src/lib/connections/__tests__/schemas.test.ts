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
  it("includes active, inactive, and error", () => {
    expect(connectionStatusValues).toEqual(["active", "inactive", "error"]);
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

  it("parses a valid connection row", () => {
    expect(connectionRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(
      connectionRowSchema.safeParse({
        ...validRow,
        status: "pending",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing connected account id", () => {
    const missingConnectedAccountId = { ...validRow };
    delete missingConnectedAccountId.composio_connected_account_id;

    expect(connectionRowSchema.safeParse(missingConnectedAccountId).success).toBe(false);
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
});
