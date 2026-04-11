/**
 * Tests for the unified update_record tool.
 * @module lib/runner/tools/crm/__tests__/update-record.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUpdateRecordTool } from "../update-record";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockCaptureServerEvent = vi.fn();
const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: vi.fn(),
}));
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

describe("update_record", () => {
  beforeEach(() => {
    mockCaptureServerEvent.mockReset();
    mockCaptureTimelineActivity.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------
  describe("contacts", () => {
    it("updates a single contact", async () => {
      const existing = {
        contact_id: "c1",
        client_id: CLIENT_ID,
        first_name: "John",
        last_name: "Tan",
        email: null,
      };
      const updated = { ...existing, email: "john@test.com" };
      const { client } = createMockSupabase({
        contacts: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [{ id: "c1", fields: { email: "john@test.com" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updated });
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          recordType: "contact",
          recordId: "c1",
          action: "updated",
          actorType: "agent",
          before: existing,
          after: updated,
        }),
      );
    });

    it("returns error when no fields provided", async () => {
      const { client } = createMockSupabase();
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        { entity: "contacts", updates: [{ id: "c1", fields: {} }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "No fields to update" });
    });
  });

  // ---------------------------------------------------------------------------
  // Companies
  // ---------------------------------------------------------------------------
  describe("companies", () => {
    it("updates a single company", async () => {
      const updated = { company_id: "co1", name: "ERA SG" };
      const { client } = createMockSupabase({
        companies: { data: updated, error: null },
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "companies",
          updates: [{ id: "co1", fields: { name: "ERA SG" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updated });
    });

    it("normalizes company website on update", async () => {
      const existing = {
        company_id: "co1",
        client_id: CLIENT_ID,
        name: "Acme",
        website: "http://old.example",
      };
      const updated = { ...existing, website: "acme.com" };
      const { client, builderHistory } = createMockSupabase({
        companies: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "companies",
          updates: [{ id: "co1", fields: { website: "https://www.acme.com/?utm=test" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updated });
      expect(builderHistory.companies[1]?.update).toHaveBeenCalledWith(
        expect.objectContaining({ website: "acme.com" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Deals — stage analytics
  // ---------------------------------------------------------------------------
  describe("deals", () => {
    it("updates a deal without stage change", async () => {
      const updated = { deal_id: "d1", address: "456 Bishan", stage: "leads" };
      const { client } = createMockSupabase({
        deals: { data: updated, error: null },
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { address: "456 Bishan" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updated });
      expect(mockCaptureServerEvent).not.toHaveBeenCalled();
    });

    it("fires deal_stage_changed event when stage changes", async () => {
      const existingDeal = { stage: "leads", amount: 500000 };
      const updatedDeal = { deal_id: "d1", stage: "offer", amount: 500000 };
      const { client } = createMockSupabase({
        deals: [
          // First from("deals") → fetch previous stage
          { data: existingDeal, error: null },
          // Second from("deals") → update
          { data: updatedDeal, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { stage: "offer" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updatedDeal });
      expect(mockCaptureServerEvent).toHaveBeenCalledWith({
        distinctId: CLIENT_ID,
        event: "deal_stage_changed",
        properties: {
          from_stage: "leads",
          to_stage: "offer",
          deal_value: 500000,
        },
      });
    });

    it("does not fire analytics when stage is same", async () => {
      const existingDeal = { stage: "leads", amount: 500000 };
      const updatedDeal = { deal_id: "d1", stage: "leads", amount: 600000 };
      const { client } = createMockSupabase({
        deals: [
          { data: existingDeal, error: null },
          { data: updatedDeal, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { stage: "leads", amount: 600000 } }],
        },
        EXEC_OPTIONS,
      );

      expect(mockCaptureServerEvent).not.toHaveBeenCalled();
    });

    it("rejects deal updates with negative amount", async () => {
      const existingDeal = { deal_id: "d1", client_id: CLIENT_ID, stage: "leads", amount: 500000 };
      const updatedDeal = { ...existingDeal, amount: -100 };
      const { client } = createMockSupabase({
        deals: [
          { data: existingDeal, error: null },
          { data: updatedDeal, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { amount: -100 } }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/amount.*non-negative/i);
      }
    });

    it("rejects deal updates with probability above 100", async () => {
      const existingDeal = {
        deal_id: "d1",
        client_id: CLIENT_ID,
        stage: "leads",
        amount: 500000,
        probability: 25,
      };
      const updatedDeal = { ...existingDeal, probability: 150 };
      const { client } = createMockSupabase({
        deals: [
          { data: existingDeal, error: null },
          { data: updatedDeal, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { probability: 150 } }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/probability.*0.*100/i);
      }
    });

    it("rejects deal amount of NaN on update", async () => {
      const existingDeal = { deal_id: "d1", client_id: CLIENT_ID, stage: "leads", amount: 500000 };
      const updatedDeal = { ...existingDeal, amount: Number.NaN };
      const { client } = createMockSupabase({
        deals: [
          { data: existingDeal, error: null },
          { data: updatedDeal, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { amount: Number.NaN } }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/amount.*finite/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Notes → record_notes redirect
  // ---------------------------------------------------------------------------
  describe("notes redirect", () => {
    it("creates a record_note when notes field is provided alongside other fields", async () => {
      const updated = { contact_id: "c1", first_name: "John", email: "john@test.com" };
      const { client, builderHistory } = createMockSupabase({
        contacts: { data: updated, error: null },
        record_notes: { data: null, error: null },
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [{ id: "c1", fields: { email: "john@test.com", notes: "Prefers email" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updated });
      // Notes should not be in the update payload
      const updateBuilder = builderHistory.contacts[1];
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.not.objectContaining({ notes: expect.anything() }),
      );
      // Should have inserted into record_notes
      expect(builderHistory.record_notes).toHaveLength(1);
      expect(builderHistory.record_notes[0].insert).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: CLIENT_ID,
          record_type: "contact",
          record_id: "c1",
          body: "Prefers email",
        }),
      );
    });

    it("creates a record_note when notes is the only field", async () => {
      const { client, builderHistory } = createMockSupabase({
        record_notes: { data: null, error: null },
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "deals",
          updates: [{ id: "d1", fields: { notes: "Client wants to close by June" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(true);
      // Should have inserted into record_notes without touching the deals table
      expect(builderHistory.record_notes).toHaveLength(1);
      expect(builderHistory.record_notes[0].insert).toHaveBeenCalledWith(
        expect.objectContaining({
          record_type: "deal",
          record_id: "d1",
          body: "Client wants to close by June",
        }),
      );
      // Should not have queried or updated the deals table
      expect(builderHistory.deals).toBeUndefined();
    });

    it("ignores empty notes string", async () => {
      const { client } = createMockSupabase();
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [{ id: "c1", fields: { notes: "" } }],
        },
        EXEC_OPTIONS,
      );

      // Empty notes + no other fields = no fields to update
      expect(result).toEqual({ success: false, error: "No fields to update" });
    });
  });

  // ---------------------------------------------------------------------------
  // Custom fields merge
  // ---------------------------------------------------------------------------
  describe("custom fields", () => {
    it("deep-merges custom fields via mergeCustomFields", async () => {
      const existingRecord = { custom_fields: { key_a: "old_a", key_b: "old_b" } };
      const updatedRecord = { contact_id: "c1", custom_fields: { key_a: "new_a", key_b: "old_b" } };
      const { client, builderHistory } = createMockSupabase({
        contacts: [
          // First from("contacts") → fetch existing full record
          { data: existingRecord, error: null },
          // Second from("contacts") → fetch existing custom_fields
          { data: existingRecord, error: null },
          // Third from("contacts") → update
          { data: updatedRecord, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [{ id: "c1", fields: { custom_fields: { key_a: "new_a" } } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: updatedRecord });
      // The update call should have the merged fields
      const updateBuilder = builderHistory.contacts[2];
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          custom_fields: { key_a: "new_a", key_b: "old_b" },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Batch updates
  // ---------------------------------------------------------------------------
  describe("batch", () => {
    it("updates multiple records and returns batch result", async () => {
      const existing1 = { contact_id: "c1", first_name: "Old John" };
      const updated1 = { contact_id: "c1", first_name: "John" };
      const existing2 = { contact_id: "c2", first_name: "Old Jane" };
      const updated2 = { contact_id: "c2", first_name: "Jane" };
      const { client } = createMockSupabase({
        contacts: [
          { data: existing1, error: null },
          { data: updated1, error: null },
          { data: existing2, error: null },
          { data: updated2, error: null },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [
            { id: "c1", fields: { first_name: "John" } },
            { id: "c2", fields: { first_name: "Jane" } },
          ],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        records: [updated1, updated2],
        count: 2,
      });
    });

    it("returns partial failure when one update fails", async () => {
      const existing1 = { contact_id: "c1", first_name: "Old John" };
      const updated1 = { contact_id: "c1", first_name: "John" };
      const { client } = createMockSupabase({
        contacts: [
          { data: existing1, error: null },
          { data: updated1, error: null },
          { data: { contact_id: "c2", first_name: "Old Jane" }, error: null },
          { data: null, error: { message: "not found" } },
        ],
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [
            { id: "c1", fields: { first_name: "John" } },
            { id: "c2", fields: { first_name: "Jane" } },
          ],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { results: unknown[] }).results).toEqual([
        { id: "c1", success: true, record: updated1 },
        { id: "c2", success: false, error: "not found" },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe("error handling", () => {
    it("returns error on database failure", async () => {
      const { client } = createMockSupabase({
        contacts: { data: null, error: { message: "connection refused" } },
      });
      const tools = createUpdateRecordTool(client, CLIENT_ID);

      const result = await tools.update_record.execute(
        {
          entity: "contacts",
          updates: [{ id: "c1", fields: { email: "test@test.com" } }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "connection refused" });
    });
  });

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------
  describe("schema validation", () => {
    it("rejects invalid entity type", () => {
      const { client } = createMockSupabase();
      const tools = createUpdateRecordTool(client, CLIENT_ID);
      const parsed = tools.update_record.inputSchema.safeParse({
        entity: "tasks",
        updates: [{ id: "t1", fields: { title: "x" } }],
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects empty updates array", () => {
      const { client } = createMockSupabase();
      const tools = createUpdateRecordTool(client, CLIENT_ID);
      const parsed = tools.update_record.inputSchema.safeParse({
        entity: "contacts",
        updates: [],
      });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid update", () => {
      const { client } = createMockSupabase();
      const tools = createUpdateRecordTool(client, CLIENT_ID);
      const parsed = tools.update_record.inputSchema.safeParse({
        entity: "contacts",
        updates: [{ id: "660e8400-e29b-41d4-a716-446655440000", fields: { email: "x@y.com" } }],
      });
      expect(parsed.success).toBe(true);
    });
  });
});
