import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { updateRecordTool } from "../update-record";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockCaptureServerEvent = vi.fn();
const mockCaptureTimelineActivity = vi.fn();

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: vi.fn(),
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("updateRecordTool", () => {
  beforeEach(() => {
    mockCaptureServerEvent.mockReset();
    mockCaptureTimelineActivity.mockReset();
  });

  it("accepts singular entity aliases and flattened update fields", () => {
    const parsed = updateRecordTool.inputSchema.parse({
      entity: "contact",
      updates: [{ id: "660e8400-e29b-41d4-a716-446655440000", email: "john@test.com" }],
    });

    expect(parsed).toEqual({
      entity: "contacts",
      updates: [{
        id: "660e8400-e29b-41d4-a716-446655440000",
        fields: { email: "john@test.com" },
      }],
    });
  });

  it("accepts single-record shorthand without an updates array", () => {
    const parsed = updateRecordTool.inputSchema.parse({
      entity: "company",
      id: "660e8400-e29b-41d4-a716-446655440001",
      website: "acme.com",
    });

    expect(parsed).toEqual({
      entity: "companies",
      updates: [{
        id: "660e8400-e29b-41d4-a716-446655440001",
        fields: { website: "acme.com" },
      }],
    });
  });

  it("updates a contact and applies the explicit client_id filter on read and write", async () => {
    const existing = {
      contact_id: "c1",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Tan",
      email: null,
    };
    const updated = { ...existing, email: "john@test.com" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { email: "john@test.com" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, record: updated });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("rejects invalid email format on contact update", async () => {
    const existing = { contact_id: "c1", client_id: CLIENT_ID, email: "old@test.com" };
    const { client } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { email: "not-an-email" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like an email",
    });
  });

  it("lowercases email on contact update", async () => {
    const existing = { contact_id: "c1", client_id: CLIENT_ID, email: "old@test.com" };
    const updated = { ...existing, email: "bob@acme.com" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { email: "BOB@ACME.COM" } }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (result.success && "record" in result) {
      const record = result.record as { email: string };
      expect(record.email).toBe("bob@acme.com");
    }
    // Verify the update call received the lowercased email
    expect(builderHistory.contacts[1]?.update).toHaveBeenCalledWith(
      expect.objectContaining({ email: "bob@acme.com" }),
    );
  });

  it("stores plausible non-E.164 phone input as trimmed raw on update", async () => {
    const existing = { contact_id: "c1", client_id: CLIENT_ID, phone: null };
    const updated = { ...existing, phone: "9123 4567" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { phone: "9123 4567" } }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.contacts[1]?.update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "9123 4567" }),
    );
  });

  it("rejects implausible phone input on contact update", async () => {
    const existing = { contact_id: "c1", client_id: CLIENT_ID, phone: null };
    const { client } = createMockSupabase({
      contacts: [{ data: existing, error: null }],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { phone: "123" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like a phone number",
    });
  });

  it("normalises company website on update", async () => {
    const existing = { company_id: "co1", client_id: CLIENT_ID, website: "old.com" };
    const updated = { ...existing, website: "acme.com" };
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "companies",
        updates: [{ id: "co1", fields: { website: "https://www.acme.com/?utm=x" } }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    expect(builderHistory.companies[1]?.update).toHaveBeenCalledWith(
      expect.objectContaining({ website: "acme.com" }),
    );
  });

  it("rejects invalid website format on update", async () => {
    const existing = { company_id: "co1", client_id: CLIENT_ID, website: "old.com" };
    const { client } = createMockSupabase({
      companies: [{ data: existing, error: null }],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "companies",
        updates: [{ id: "co1", fields: { website: "not a url" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Doesn't look like a website",
    });
  });

  it("rejects deal update with negative amount", async () => {
    const existing = { deal_id: "d1", client_id: CLIENT_ID, amount: 100 };
    const { client } = createMockSupabase({
      deals: [{ data: existing, error: null }],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "deals",
        updates: [{ id: "d1", fields: { amount: -50 } }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/amount.*finite.*non-negative/i);
    }
  });

  it("rejects deal update with Infinity amount", async () => {
    const existing = { deal_id: "d1", client_id: CLIENT_ID, amount: 100 };
    const { client } = createMockSupabase({
      deals: [{ data: existing, error: null }],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "deals",
        updates: [{ id: "d1", fields: { amount: Infinity } }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();

    const result = await updateRecordTool.execute(
      { entity: "contacts", updates: [{ id: "c1", fields: {} }] },
      makeContext(client),
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("rejects note-only updates when the record is not owned by this tenant", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: null },
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { notes: "hello" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Record not found.",
    });
  });
});
