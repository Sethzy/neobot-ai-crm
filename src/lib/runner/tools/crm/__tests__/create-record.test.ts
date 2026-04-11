/**
 * Tests for the unified create_record tool.
 * @module lib/runner/tools/crm/__tests__/create-record.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCreateRecordTool } from "../create-record";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  captureServerEvents: vi.fn(),
}));

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

describe("create_record", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------
  describe("contacts", () => {
    it("creates a single contact with dedup pass", async () => {
      const inserted = { contact_id: "c1", first_name: "John", last_name: "Tan" };
      const { client } = createMockSupabase({
        // First from("contacts") → dedup query returns empty
        // Second from("contacts") → insert returns the created record
        contacts: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "contacts", records: [{ first_name: "John", last_name: "Tan" }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          recordType: "contact",
          recordId: "c1",
          action: "created",
          actorType: "agent",
          after: inserted,
        }),
      );
    });

    it("returns possible_duplicates when dedup finds match", async () => {
      const existing = [{ contact_id: "c1", first_name: "John", last_name: "Tan" }];
      const { client } = createMockSupabase({
        contacts: { data: existing, error: null },
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "contacts", records: [{ first_name: "John", last_name: "Tan" }] },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { reason: string }).reason).toBe("possible_duplicates");
    });

    it("skips dedup when force_create is true", async () => {
      const inserted = { contact_id: "c1", first_name: "John", last_name: "Tan" };
      const { client, builderHistory } = createMockSupabase({
        contacts: { data: inserted, error: null },
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [{ first_name: "John", last_name: "Tan" }],
          force_create: true,
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
      // Only one from("contacts") call — no dedup query
      expect(builderHistory.contacts).toHaveLength(1);
    });

    it("detects intra-batch duplicates for contacts", async () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [
            { first_name: "John", last_name: "Tan" },
            { first_name: "john", last_name: "tan" },
          ],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { reason: string }).reason).toBe("possible_duplicates");
      expect((result as { message: string }).message).toContain("Intra-batch");
    });

    it("batch creates multiple contacts", async () => {
      const created = [
        { contact_id: "c1", first_name: "John", last_name: "Tan" },
        { contact_id: "c2", first_name: "Jane", last_name: "Lim" },
      ];
      const { client } = createMockSupabase({
        contacts: [
          // dedup for John
          { data: [], error: null },
          // dedup for Jane
          { data: [], error: null },
          // batch insert
          { data: created, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [
            { first_name: "John", last_name: "Tan" },
            { first_name: "Jane", last_name: "Lim" },
          ],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: created, count: 2 });
    });

    it("creates a record_note when notes field is provided", async () => {
      const inserted = { contact_id: "c1", first_name: "John", last_name: "Tan" };
      const { client, builderHistory } = createMockSupabase({
        contacts: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
        record_notes: { data: null, error: null },
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [{ first_name: "John", last_name: "Tan", notes: "Prefers email" }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
      // Notes should not be in the insert payload
      const insertBuilder = builderHistory.contacts[1];
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({ notes: expect.anything() }),
      );
      // Should have inserted into record_notes
      expect(builderHistory.record_notes).toHaveLength(1);
      expect(builderHistory.record_notes[0].insert).toHaveBeenCalledWith([
        expect.objectContaining({
          client_id: CLIENT_ID,
          record_type: "contact",
          record_id: "c1",
          body: "Prefers email",
        }),
      ]);
    });

    it("applies default contact type", async () => {
      const inserted = { contact_id: "c1" };
      const { client, builderHistory } = createMockSupabase({
        contacts: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      await tools.create_record.execute(
        { entity: "contacts", records: [{ first_name: "John", last_name: "Tan" }] },
        EXEC_OPTIONS,
      );

      // The insert builder is the second call
      const insertBuilder = builderHistory.contacts[1];
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ type: "other" }),
      );
    });

    it("rejects invalid email format on contact create", async () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [{ first_name: "Jane", last_name: "Doe", email: "not-an-email" }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/invalid email/i);
      }
    });

    it("lowercases email on contact create", async () => {
      const inserted = {
        contact_id: "c1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@acme.com",
      };
      const { client, builderHistory } = createMockSupabase({
        contacts: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [{ first_name: "Jane", last_name: "Doe", email: "Jane@Acme.COM" }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
      expect(builderHistory.contacts[1]?.insert).toHaveBeenCalledWith(
        expect.objectContaining({ email: "jane@acme.com" }),
      );
    });

    it("catches duplicate contact by phone digit fallback when input lacks country code", async () => {
      const existing = [{ contact_id: "c1", first_name: "Jane", last_name: "Doe", phone: "+12125551234" }];
      const inserted = { contact_id: "c2", first_name: "Jane", last_name: "Smith", phone: "555-1234" };
      const { client } = createMockSupabase({
        contacts: [
          { data: [], error: null },
          { data: existing, error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "contacts",
          records: [{ first_name: "Jane", last_name: "Smith", phone: "555-1234" }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      if (!result.success && "possible_duplicates" in result) {
        expect(result.possible_duplicates.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Companies
  // ---------------------------------------------------------------------------
  describe("companies", () => {
    it("creates a single company with dedup pass", async () => {
      const inserted = { company_id: "co1", name: "ERA" };
      const { client } = createMockSupabase({
        companies: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "companies", records: [{ name: "ERA" }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
    });

    it("detects intra-batch duplicates for companies", async () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "companies",
          records: [{ name: "ERA" }, { name: "era" }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { reason: string }).reason).toBe("possible_duplicates");
      expect((result as { message: string }).message).toContain("Intra-batch");
    });

    it("returns possible_duplicates when company name matches", async () => {
      const existing = [{ company_id: "co1", name: "ERA" }];
      const { client } = createMockSupabase({
        companies: { data: existing, error: null },
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "companies", records: [{ name: "ERA" }] },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { reason: string }).reason).toBe("possible_duplicates");
    });

    it("normalizes company website on create", async () => {
      const inserted = { company_id: "co1", name: "Acme", website: "acme.com" };
      const { client, builderHistory } = createMockSupabase({
        companies: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "companies",
          records: [{ name: "Acme", website: "https://www.acme.com/?utm=test" }],
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
      expect(builderHistory.companies[1]?.insert).toHaveBeenCalledWith(
        expect.objectContaining({ website: "acme.com" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Deals
  // ---------------------------------------------------------------------------
  describe("deals", () => {
    it("creates a single deal with dedup pass", async () => {
      const inserted = { deal_id: "d1", address: "123 Bishan" };
      const { client } = createMockSupabase({
        deals: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "deals", records: [{ address: "123 Bishan" }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
    });

    it("applies default deal stage", async () => {
      const inserted = { deal_id: "d1" };
      const { client, builderHistory } = createMockSupabase({
        deals: [
          { data: [], error: null },
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      await tools.create_record.execute(
        { entity: "deals", records: [{ address: "123 Bishan" }] },
        EXEC_OPTIONS,
      );

      const insertBuilder = builderHistory.deals[1];
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "leads" }),
      );
    });

    it("detects intra-batch duplicates for deals", async () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        {
          entity: "deals",
          records: [{ address: "123 Bishan" }, { address: "123 bishan" }],
        },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { reason: string }).reason).toBe("possible_duplicates");
    });

    it("rejects deal amount of Infinity on create", async () => {
      const { client } = createMockSupabase({
        deals: [
          { data: [], error: null },
          { data: { deal_id: "d1", address: "123 Finite St", amount: Infinity }, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "deals", records: [{ address: "123 Finite St", amount: Infinity }] },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe("error handling", () => {
    it("returns error when insert fails", async () => {
      const { client } = createMockSupabase({
        contacts: [
          { data: [], error: null },
          { data: null, error: { message: "insert failed" } },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "contacts", records: [{ first_name: "John", last_name: "Tan" }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "insert failed" });
    });

    it("falls through dedup on query error", async () => {
      const inserted = { contact_id: "c1" };
      const { client } = createMockSupabase({
        contacts: [
          // Dedup query errors out → null → falls through
          { data: null, error: { message: "timeout" } },
          // Insert succeeds
          { data: inserted, error: null },
        ],
      });
      const tools = createCreateRecordTool(client, CLIENT_ID);

      const result = await tools.create_record.execute(
        { entity: "contacts", records: [{ first_name: "John", last_name: "Tan" }] },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, record: inserted });
    });
  });

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------
  describe("schema validation", () => {
    it("rejects invalid entity type", () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);
      const parsed = tools.create_record.inputSchema.safeParse({
        entity: "interactions",
        records: [{}],
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects empty records array", () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);
      const parsed = tools.create_record.inputSchema.safeParse({
        entity: "contacts",
        records: [],
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects more than 50 records", () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);
      const parsed = tools.create_record.inputSchema.safeParse({
        entity: "contacts",
        records: Array.from({ length: 51 }, () => ({ first_name: "a", last_name: "b" })),
      });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid single record", () => {
      const { client } = createMockSupabase();
      const tools = createCreateRecordTool(client, CLIENT_ID);
      const parsed = tools.create_record.inputSchema.safeParse({
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Tan" }],
      });
      expect(parsed.success).toBe(true);
    });
  });
});
