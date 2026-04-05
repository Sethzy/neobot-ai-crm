/**
 * Tests for the unified link_records tool.
 * @module lib/runner/tools/crm/__tests__/link-records.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLinkRecordsTool } from "../link-records";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

describe("link_records", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  // ---------------------------------------------------------------------------
  // contact_deal (junction table)
  // ---------------------------------------------------------------------------
  describe("contact_deal", () => {
    it("links a contact to a deal via junction insert", async () => {
      const inserted = { contact_id: "c1", deal_id: "d1", role: "buyer", is_primary: false };
      const { client, builders } = createMockSupabase({
        deal_contacts: { data: inserted, error: null },
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        {
          action: "link",
          relationship: "contact_deal",
          source_id: "c1",
          target_id: "d1",
          role: "buyer",
        },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, link: inserted });
      expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: CLIENT_ID,
          contact_id: "c1",
          deal_id: "d1",
          role: "buyer",
        }),
      );
    });

    it("applies default role when omitted", async () => {
      const inserted = { contact_id: "c1", deal_id: "d1", role: "buyer" };
      const { client, builders } = createMockSupabase({
        deal_contacts: { data: inserted, error: null },
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      await tools.link_records.execute(
        { action: "link", relationship: "contact_deal", source_id: "c1", target_id: "d1" },
        EXEC_OPTIONS,
      );

      expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
        expect.objectContaining({ role: "buyer" }),
      );
    });

    it("unlinks a contact from a deal via junction delete", async () => {
      const removed = { contact_id: "c1", deal_id: "d1" };
      const { client, builders } = createMockSupabase({
        deal_contacts: { data: removed, error: null },
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "unlink", relationship: "contact_deal", source_id: "c1", target_id: "d1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, removed });
      expect(builders.deal_contacts.delete).toHaveBeenCalled();
    });

    it("returns error when no link found (PGRST116)", async () => {
      const { client } = createMockSupabase({
        deal_contacts: { data: null, error: { message: "No rows", code: "PGRST116" } as never },
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "unlink", relationship: "contact_deal", source_id: "c1", target_id: "d1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "No link found between this contact and deal",
      });
    });

    it("requires target_id for link", async () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "link", relationship: "contact_deal", source_id: "c1" },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("required");
    });

    it("requires target_id for unlink on junction", async () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "unlink", relationship: "contact_deal", source_id: "c1" },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("required");
    });
  });

  // ---------------------------------------------------------------------------
  // contact_company (FK)
  // ---------------------------------------------------------------------------
  describe("contact_company", () => {
    it("links a contact to a company via FK update", async () => {
      const existing = { contact_id: "c1", client_id: CLIENT_ID, company_id: null };
      const updated = { ...existing, company_id: "co1" };
      const { client, builders } = createMockSupabase({
        contacts: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "link", relationship: "contact_company", source_id: "c1", target_id: "co1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, link: updated });
      expect(builders.contacts).toBeDefined();
      expect(client.from).toHaveBeenCalledWith("contacts");
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

    it("unlinks a contact from a company by setting FK to null", async () => {
      const existing = { contact_id: "c1", client_id: CLIENT_ID, company_id: "co1" };
      const updated = { ...existing, company_id: null };
      const { client } = createMockSupabase({
        contacts: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "unlink", relationship: "contact_company", source_id: "c1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, removed: updated });
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

    it("requires target_id for link", async () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "link", relationship: "contact_company", source_id: "c1" },
        EXEC_OPTIONS,
      );

      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // deal_company (FK)
  // ---------------------------------------------------------------------------
  describe("deal_company", () => {
    it("links a deal to a company via FK update", async () => {
      const existing = { deal_id: "d1", client_id: CLIENT_ID, company_id: null };
      const updated = { ...existing, company_id: "co1" };
      const { client } = createMockSupabase({
        deals: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "link", relationship: "deal_company", source_id: "d1", target_id: "co1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, link: updated });
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          recordType: "deal",
          recordId: "d1",
          action: "updated",
          actorType: "agent",
          before: existing,
          after: updated,
        }),
      );
    });

    it("unlinks a deal from a company by setting FK to null", async () => {
      const existing = { deal_id: "d1", client_id: CLIENT_ID, company_id: "co1" };
      const updated = { ...existing, company_id: null };
      const { client } = createMockSupabase({
        deals: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      });
      const tools = createLinkRecordsTool(client, CLIENT_ID);

      const result = await tools.link_records.execute(
        { action: "unlink", relationship: "deal_company", source_id: "d1" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, removed: updated });
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          recordType: "deal",
          recordId: "d1",
          action: "updated",
          actorType: "agent",
          before: existing,
          after: updated,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------
  describe("schema validation", () => {
    it("rejects invalid action", () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);
      const parsed = tools.link_records.inputSchema.safeParse({
        action: "delete",
        relationship: "contact_deal",
        source_id: "660e8400-e29b-41d4-a716-446655440000",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects invalid relationship", () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);
      const parsed = tools.link_records.inputSchema.safeParse({
        action: "link",
        relationship: "deal_task",
        source_id: "660e8400-e29b-41d4-a716-446655440000",
      });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid link request", () => {
      const { client } = createMockSupabase();
      const tools = createLinkRecordsTool(client, CLIENT_ID);
      const parsed = tools.link_records.inputSchema.safeParse({
        action: "link",
        relationship: "contact_deal",
        source_id: "660e8400-e29b-41d4-a716-446655440000",
        target_id: "770e8400-e29b-41d4-a716-446655440000",
      });
      expect(parsed.success).toBe(true);
    });
  });
});
