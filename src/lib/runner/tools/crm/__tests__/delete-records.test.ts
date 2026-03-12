/**
 * Tests for the unified delete_records tool.
 * @module lib/runner/tools/crm/__tests__/delete-records.test
 */
import { describe, expect, it } from "vitest";

import { createDeleteRecordsTool } from "../delete-records";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("delete_records", () => {
  it("deletes a single contact", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: null, error: null },
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    const result = await tools.delete_records.execute(
      { entity: "contacts", ids: ["c1"], reason: "User requested removal" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: true, deleted_count: 1, ids: ["c1"] });
    expect(builders.contacts.delete).toHaveBeenCalled();
    expect(builders.contacts.eq).toHaveBeenCalledWith("contact_id", "c1");
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("deletes multiple deals in batch", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: null },
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    const result = await tools.delete_records.execute(
      { entity: "deals", ids: ["d1", "d2", "d3"], reason: "Bulk cleanup" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      deleted_count: 3,
      ids: ["d1", "d2", "d3"],
    });
  });

  it("deletes interactions from correct table", async () => {
    const { client, builders } = createMockSupabase({
      interactions: { data: null, error: null },
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    await tools.delete_records.execute(
      { entity: "interactions", ids: ["i1"], reason: "Wrong entry" },
      EXEC_OPTIONS,
    );

    expect(builders.interactions.eq).toHaveBeenCalledWith("interaction_id", "i1");
  });

  it("deletes tasks from crm_tasks table", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: null, error: null },
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    await tools.delete_records.execute(
      { entity: "tasks", ids: ["t1"], reason: "Completed and obsolete" },
      EXEC_OPTIONS,
    );

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("task_id", "t1");
  });

  it("returns partial failure when some deletes fail", async () => {
    const { client } = createMockSupabase({
      contacts: [
        { data: null, error: null },
        { data: null, error: { message: "not found" } },
        { data: null, error: null },
      ],
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    const result = await tools.delete_records.execute(
      { entity: "contacts", ids: ["c1", "c2", "c3"], reason: "Cleanup" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to delete 1 record(s)",
      deleted_count: 2,
      failed_ids: ["c2"],
    });
  });

  it("has needsApproval set to true", () => {
    const { client } = createMockSupabase();
    const tools = createDeleteRecordsTool(client, CLIENT_ID);
    // Access the raw tool definition
    expect((tools.delete_records as unknown as { needsApproval: boolean }).needsApproval).toBe(true);
  });

  describe("schema validation", () => {
    it("rejects invalid entity type", () => {
      const { client } = createMockSupabase();
      const tools = createDeleteRecordsTool(client, CLIENT_ID);
      const parsed = tools.delete_records.inputSchema.safeParse({
        entity: "deal_contacts",
        ids: ["x"],
        reason: "test",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects empty ids array", () => {
      const { client } = createMockSupabase();
      const tools = createDeleteRecordsTool(client, CLIENT_ID);
      const parsed = tools.delete_records.inputSchema.safeParse({
        entity: "contacts",
        ids: [],
        reason: "test",
      });
      expect(parsed.success).toBe(false);
    });

    it("requires reason field", () => {
      const { client } = createMockSupabase();
      const tools = createDeleteRecordsTool(client, CLIENT_ID);
      const parsed = tools.delete_records.inputSchema.safeParse({
        entity: "contacts",
        ids: ["660e8400-e29b-41d4-a716-446655440000"],
      });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid delete request", () => {
      const { client } = createMockSupabase();
      const tools = createDeleteRecordsTool(client, CLIENT_ID);
      const parsed = tools.delete_records.inputSchema.safeParse({
        entity: "contacts",
        ids: ["660e8400-e29b-41d4-a716-446655440000"],
        reason: "Duplicate record",
      });
      expect(parsed.success).toBe(true);
    });
  });
});
