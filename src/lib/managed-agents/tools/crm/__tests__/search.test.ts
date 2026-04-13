import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { searchCrmTool } from "../search";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

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

describe("searchCrmTool", () => {
  it("exposes the expected name, description, and chatOnly flag", () => {
    expect(searchCrmTool.name).toBe("search_crm");
    expect(searchCrmTool.description).toMatch(/CRM/);
    expect(searchCrmTool.chatOnly).toBeUndefined();
  });

  it("applies the explicit client_id filter on contacts", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [{ contact_id: "c1", first_name: "John" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts", query: "John" },
      makeContext(client),
    );

    expect(result).toEqual({
      success: true,
      records: [{ contact_id: "c1", first_name: "John" }],
      count: 1,
    });
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns { success: false, error } when Supabase errors", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "boom" } },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts" },
      makeContext(client),
    );

    expect(result).toEqual({ success: false, error: "boom" });
  });

  it("skips text search when record_notes has an exact note_id filter", async () => {
    const { client, builders } = createMockSupabase({
      record_notes: {
        data: [{ note_id: "n1", body: "important note" }],
        error: null,
      },
    });

    const result = await searchCrmTool.execute(
      {
        entity: "record_notes",
        query: "this text should be ignored",
        filters: { note_id: "n1" },
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: true,
      records: [{ note_id: "n1", body: "important note" }],
      count: 1,
    });
    expect(builders.record_notes.or).not.toHaveBeenCalled();
    expect(builders.record_notes.ilike).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Include parameter tests
// ---------------------------------------------------------------------------

describe("searchCrmTool — include parameter", () => {
  it("fetches deal with included contacts via deal_contacts junction", async () => {
    const { client } = createMockSupabase({
      // Primary deals query
      deals: { data: [{ deal_id: "d1", address: "8 Nassim Hill", stage: "Proposal Sent", amount: 6200000 }], error: null },
      // Junction query for contacts
      deal_contacts: { data: [{ deal_id: "d1", contact_id: "c1", is_primary: true, role: "buyer", contacts: { first_name: "David", last_name: "Lee", email: "david@example.com", phone: "+65 9452 7890", type: "buyer" } }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", filters: { deal_id: "d1" }, include: ["contacts"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.records).toHaveLength(1);
    const deal = result.records[0] as Record<string, unknown>;
    expect(deal.address).toBe("8 Nassim Hill");
    expect(deal._contacts).toHaveLength(1);
    expect((deal._contacts as Record<string, unknown>[])[0]).toMatchObject({ deal_id: "d1", contact_id: "c1" });
  });

  it("fetches deal with included interactions and notes", async () => {
    const { client } = createMockSupabase({
      deals: { data: [{ deal_id: "d1", address: "8 Nassim Hill" }], error: null },
      interactions: { data: [{ interaction_id: "i1", deal_id: "d1", type: "call", summary: "Discussed yield" }], error: null },
      record_notes: { data: [{ id: "n1", record_id: "d1", body: "Good prospect" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", filters: { deal_id: "d1" }, include: ["interactions", "notes"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const deal = result.records[0] as Record<string, unknown>;
    expect(deal._interactions).toHaveLength(1);
    expect(deal._notes).toHaveLength(1);
  });

  it("fetches contact with included deals via deal_contacts junction", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [{ contact_id: "c1", first_name: "David", last_name: "Lee" }], error: null },
      deal_contacts: { data: [{ contact_id: "c1", deal_id: "d1", is_primary: true, deals: { deal_id: "d1", address: "8 Nassim Hill", stage: "Proposal Sent", amount: 6200000 } }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts", filters: { contact_id: "c1" }, include: ["deals"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const contact = result.records[0] as Record<string, unknown>;
    expect(contact._deals).toHaveLength(1);
    expect((contact._deals as Record<string, unknown>[])[0]).toMatchObject({ contact_id: "c1", deal_id: "d1" });
  });

  it("fetches company with included contacts and deals", async () => {
    const { client } = createMockSupabase({
      companies: { data: [{ company_id: "co1", name: "Acme Corp" }], error: null },
      contacts: [
        // First call is the primary query (no include), but companies doesn't call contacts as primary.
        // The include fetches contacts table with company_id filter.
        { data: [{ contact_id: "c1", company_id: "co1", first_name: "Alice" }], error: null },
      ],
      deals: { data: [{ deal_id: "d1", company_id: "co1", address: "1 Main St" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "companies", filters: { company_id: "co1" }, include: ["contacts", "deals"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const company = result.records[0] as Record<string, unknown>;
    expect(company._contacts).toHaveLength(1);
    expect(company._deals).toHaveLength(1);
  });

  it("returns error for invalid include on unsupported entity", async () => {
    const { client } = createMockSupabase({});

    const result = await searchCrmTool.execute(
      { entity: "interactions", include: ["contacts"] },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/does not support include/);
  });

  it("returns error for invalid include name on supported entity", async () => {
    const { client } = createMockSupabase({
      deals: { data: [], error: null },
    });

    // "deals" is a valid include target for contacts, but not for deals itself
    const result = await searchCrmTool.execute(
      { entity: "deals", include: ["deals" as "contacts"] },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/Invalid include/);
  });

  it("works with empty include array (same as no include)", async () => {
    const { client } = createMockSupabase({
      deals: { data: [{ deal_id: "d1", address: "Test" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", include: [] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.records).toHaveLength(1);
    // No underscore-prefixed keys should be present
    const deal = result.records[0] as Record<string, unknown>;
    expect(deal._contacts).toBeUndefined();
  });

  it("attaches empty arrays when included entity has no matching records", async () => {
    const { client } = createMockSupabase({
      deals: { data: [{ deal_id: "d1", address: "8 Nassim Hill" }], error: null },
      interactions: { data: [], error: null },
      crm_tasks: { data: [], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", filters: { deal_id: "d1" }, include: ["interactions", "tasks"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const deal = result.records[0] as Record<string, unknown>;
    expect(deal._interactions).toEqual([]);
    expect(deal._tasks).toEqual([]);
  });

  it("surfaces include query failures instead of pretending the include is empty", async () => {
    const { client } = createMockSupabase({
      deals: { data: [{ deal_id: "d1", address: "8 Nassim Hill" }], error: null },
      interactions: { data: null, error: { message: "include boom" } },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", filters: { deal_id: "d1" }, include: ["interactions"] },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: 'Failed to load include "interactions": include boom',
    });
  });

  it("groups included records correctly across multiple primary records", async () => {
    const { client } = createMockSupabase({
      deals: { data: [
        { deal_id: "d1", address: "Nassim Hill" },
        { deal_id: "d2", address: "Cavenagh Road" },
      ], error: null },
      interactions: { data: [
        { interaction_id: "i1", deal_id: "d1", type: "call", summary: "Call about d1" },
        { interaction_id: "i2", deal_id: "d2", type: "email", summary: "Email about d2" },
        { interaction_id: "i3", deal_id: "d1", type: "meeting", summary: "Meeting about d1" },
      ], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "deals", include: ["interactions"] },
      makeContext(client),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const [deal1, deal2] = result.records as Record<string, unknown>[];
    expect((deal1._interactions as unknown[]).length).toBe(2);
    expect((deal2._interactions as unknown[]).length).toBe(1);
  });
});
