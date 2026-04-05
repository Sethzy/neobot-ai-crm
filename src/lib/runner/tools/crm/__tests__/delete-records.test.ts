/**
 * Tests for the unified delete_records tool.
 * @module lib/runner/tools/crm/__tests__/delete-records.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDeleteRecordsTool } from "../delete-records";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

describe("delete_records", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  it("deletes a single contact and its record_notes", async () => {
    const existingContact = {
      contact_id: "c1",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Tan",
    };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existingContact, error: null },
        { data: null, error: null },
      ],
      record_notes: { data: null, error: null },
    });
    const tools = createDeleteRecordsTool(client, CLIENT_ID);

    const result = await tools.delete_records.execute(
      { entity: "contacts", ids: ["c1"], reason: "User requested removal" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: true, deleted_count: 1, ids: ["c1"] });
    const deleteBuilder = builderHistory.contacts[1];
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("contact_id", "c1");
    expect(deleteBuilder.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    // Should also clean up record_notes
    expect(builderHistory.record_notes).toHaveLength(1);
    expect(builderHistory.record_notes[0].delete).toHaveBeenCalled();
    expect(builderHistory.record_notes[0].eq).toHaveBeenCalledWith("record_type", "contact");
    expect(builderHistory.record_notes[0].eq).toHaveBeenCalledWith("record_id", "c1");
    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        recordType: "contact",
        recordId: "c1",
        action: "deleted",
        actorType: "agent",
        before: existingContact,
      }),
    );
  });

  it("deletes multiple deals in batch", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: null },
      record_notes: { data: null, error: null },
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
        { data: { contact_id: "c1" }, error: null },
        { data: null, error: null },
        { data: { contact_id: "c2" }, error: null },
        { data: null, error: { message: "not found" } },
        { data: { contact_id: "c3" }, error: null },
        { data: null, error: null },
      ],
      record_notes: { data: null, error: null },
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
