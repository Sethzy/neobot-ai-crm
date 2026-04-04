/**
 * Tests for the unified search_crm tool.
 * @module lib/runner/tools/crm/__tests__/search.test
 */
import { describe, expect, it } from "vitest";

import { createSearchCrmTool } from "../search";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_crm", () => {
  describe("contacts", () => {
    it("searches contacts with text query", async () => {
      const mockContacts = [{ contact_id: "c1", first_name: "John", last_name: "Tan" }];
      const { client, builders } = createMockSupabase({
        contacts: { data: mockContacts, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "contacts", query: "John" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockContacts, count: 1 });
      expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
      expect(builders.contacts.or).toHaveBeenCalled();
    });

    it("filters contacts by type and company_id", async () => {
      const { client, builders } = createMockSupabase({
        contacts: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "contacts", filters: { type: "buyer", company_id: "comp-1" } },
        EXEC_OPTIONS,
      );

      expect(builders.contacts.eq).toHaveBeenCalledWith("type", "buyer");
      expect(builders.contacts.eq).toHaveBeenCalledWith("company_id", "comp-1");
    });

    it("applies limit", async () => {
      const { client, builders } = createMockSupabase({
        contacts: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "contacts", limit: 5 },
        EXEC_OPTIONS,
      );

      expect(builders.contacts.limit).toHaveBeenCalledWith(5);
    });

    it("defaults to 20 results when limit omitted", async () => {
      const { client, builders } = createMockSupabase({
        contacts: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute({ entity: "contacts" }, EXEC_OPTIONS);

      expect(builders.contacts.limit).toHaveBeenCalledWith(20);
    });
  });

  describe("companies", () => {
    it("searches companies by query", async () => {
      const mockCompanies = [{ company_id: "co1", name: "ERA" }];
      const { client, builders } = createMockSupabase({
        companies: { data: mockCompanies, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "companies", query: "ERA" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockCompanies, count: 1 });
      expect(builders.companies.or).toHaveBeenCalled();
    });

    it("filters companies by industry", async () => {
      const { client, builders } = createMockSupabase({
        companies: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "companies", filters: { industry: "developer" } },
        EXEC_OPTIONS,
      );

      expect(builders.companies.eq).toHaveBeenCalledWith("industry", "developer");
    });
  });

  describe("deals", () => {
    it("searches deals by address", async () => {
      const mockDeals = [{ deal_id: "d1", address: "123 Bishan" }];
      const { client, builders } = createMockSupabase({
        deals: { data: mockDeals, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "deals", query: "Bishan" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockDeals, count: 1 });
      // Single search column uses .ilike() directly instead of .or()
      expect(builders.deals.ilike).toHaveBeenCalled();
    });

    it("filters deals by stage and company_id", async () => {
      const { client, builders } = createMockSupabase({
        deals: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "deals", filters: { stage: "leads", company_id: "comp-1" } },
        EXEC_OPTIONS,
      );

      expect(builders.deals.eq).toHaveBeenCalledWith("stage", "leads");
      expect(builders.deals.eq).toHaveBeenCalledWith("company_id", "comp-1");
    });
  });

  describe("interactions", () => {
    it("searches interactions by summary and orders by occurred_at DESC", async () => {
      const mockInteractions = [{ interaction_id: "i1", summary: "Called buyer" }];
      const { client, builders } = createMockSupabase({
        interactions: { data: mockInteractions, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "interactions", query: "buyer" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockInteractions, count: 1 });
      expect(builders.interactions.ilike).toHaveBeenCalled();
      expect(builders.interactions.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    });

    it("handles date range filters", async () => {
      const { client, builders } = createMockSupabase({
        interactions: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        {
          entity: "interactions",
          filters: { occurred_after: "2026-03-01", occurred_before: "2026-03-10" },
        },
        EXEC_OPTIONS,
      );

      expect(builders.interactions.gte).toHaveBeenCalledWith(
        "occurred_at",
        "2026-03-01T00:00:00Z",
      );
      expect(builders.interactions.lte).toHaveBeenCalledWith(
        "occurred_at",
        "2026-03-10T23:59:59.999Z",
      );
    });

    it("filters interactions by type, contact_id, and deal_id", async () => {
      const { client, builders } = createMockSupabase({
        interactions: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        {
          entity: "interactions",
          filters: { type: "call", contact_id: "c1", deal_id: "d1" },
        },
        EXEC_OPTIONS,
      );

      expect(builders.interactions.eq).toHaveBeenCalledWith("type", "call");
      expect(builders.interactions.eq).toHaveBeenCalledWith("contact_id", "c1");
      expect(builders.interactions.eq).toHaveBeenCalledWith("deal_id", "d1");
    });
  });

  describe("tasks", () => {
    it("searches tasks and orders by due_date ASC", async () => {
      const mockTasks = [{ task_id: "t1", title: "Follow up" }];
      const { client, builders } = createMockSupabase({
        crm_tasks: { data: mockTasks, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "tasks", query: "Follow" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockTasks, count: 1 });
      expect(builders.crm_tasks.or).toHaveBeenCalled();
      expect(builders.crm_tasks.order).toHaveBeenCalledWith("due_date", { ascending: true });
    });

    it("filters tasks by status", async () => {
      const { client, builders } = createMockSupabase({
        crm_tasks: { data: [], error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "tasks", filters: { status: "todo" } },
        EXEC_OPTIONS,
      );

      expect(builders.crm_tasks.eq).toHaveBeenCalledWith("status", "todo");
    });
  });

  describe("deal_contacts", () => {
    it("returns contacts linked to a deal when deal_id provided", async () => {
      const mockLinks = [
        { contact_id: "c1", deal_id: "d1", contacts: { first_name: "John" } },
      ];
      const { client, builders } = createMockSupabase({
        deal_contacts: { data: mockLinks, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "deal_contacts", filters: { deal_id: "d1" } },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockLinks, count: 1 });
      expect(builders.deal_contacts.select).toHaveBeenCalledWith(
        "*, contacts(first_name, last_name, email, phone)",
      );
      expect(builders.deal_contacts.eq).toHaveBeenCalledWith("deal_id", "d1");
    });

    it("returns deals linked to a contact when contact_id provided", async () => {
      const mockLinks = [
        { contact_id: "c1", deal_id: "d1", deals: { address: "123 Bishan" } },
      ];
      const { client, builders } = createMockSupabase({
        deal_contacts: { data: mockLinks, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "deal_contacts", filters: { contact_id: "c1" } },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockLinks, count: 1 });
      expect(builders.deal_contacts.select).toHaveBeenCalledWith(
        "*, deals(deal_id, address, stage, amount)",
      );
      expect(builders.deal_contacts.order).toHaveBeenCalledWith("is_primary", {
        ascending: false,
      });
    });

    it("returns error when no deal_id or contact_id filter provided", async () => {
      const { client } = createMockSupabase();
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "deal_contacts" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "deal_contacts requires a deal_id or contact_id filter.",
      });
    });
  });

  describe("record_notes", () => {
    it("searches notes by body text", async () => {
      const mockNotes = [{ note_id: "n1", record_type: "contact", record_id: "c1", body: "Discussed pricing" }];
      const { client, builders } = createMockSupabase({
        record_notes: { data: mockNotes, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "record_notes", query: "pricing" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: true, records: mockNotes, count: 1 });
      // Single search column uses .ilike() directly
      expect(builders.record_notes.ilike).toHaveBeenCalled();
      expect(builders.record_notes.order).toHaveBeenCalledWith("created_at", { ascending: false });
    });

    it("filters notes by record_type and record_id", async () => {
      const mockNotes = [{ note_id: "n1", body: "Some note" }];
      const { client, builders } = createMockSupabase({
        record_notes: { data: mockNotes, error: null },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      await tools.search_crm.execute(
        { entity: "record_notes", filters: { record_type: "contact", record_id: "c1" } },
        EXEC_OPTIONS,
      );

      expect(builders.record_notes.eq).toHaveBeenCalledWith("record_type", "contact");
      expect(builders.record_notes.eq).toHaveBeenCalledWith("record_id", "c1");
    });
  });

  describe("error handling", () => {
    it("returns error when database query fails", async () => {
      const { client } = createMockSupabase({
        contacts: { data: null, error: { message: "connection refused" } },
      });
      const tools = createSearchCrmTool(client, CLIENT_ID);

      const result = await tools.search_crm.execute(
        { entity: "contacts", query: "test" },
        EXEC_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "connection refused" });
    });
  });

  describe("schema validation", () => {
    it("rejects invalid entity type", () => {
      const { client } = createMockSupabase();
      const tools = createSearchCrmTool(client, CLIENT_ID);
      const parsed = tools.search_crm.inputSchema.safeParse({ entity: "invalid" });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid entity without optional params", () => {
      const { client } = createMockSupabase();
      const tools = createSearchCrmTool(client, CLIENT_ID);
      const parsed = tools.search_crm.inputSchema.safeParse({ entity: "contacts" });
      expect(parsed.success).toBe(true);
    });

    it("rejects limit outside bounds", () => {
      const { client } = createMockSupabase();
      const tools = createSearchCrmTool(client, CLIENT_ID);

      expect(
        tools.search_crm.inputSchema.safeParse({ entity: "contacts", limit: 0 }).success,
      ).toBe(false);
      expect(
        tools.search_crm.inputSchema.safeParse({ entity: "contacts", limit: 51 }).success,
      ).toBe(false);
    });
  });
});
