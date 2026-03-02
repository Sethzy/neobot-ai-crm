/**
 * Tests for CRM deal tools.
 * @module lib/runner/tools/crm/__tests__/deals.test
 */
import { describe, expect, it } from "vitest";

import { createDealTools } from "../deals";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_deals", () => {
  it("returns matching deals for a query", async () => {
    const deals = [
      {
        deal_id: "550e8400-e29b-41d4-a716-446655440010",
        address: "123 Orchard Rd",
        stage: "leads",
        price: 1500000,
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        notes: null,
      },
    ];
    const { client, builders } = createMockSupabase({
      deals: { data: deals, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.search_deals.execute(
      { query: "Orchard" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deals, count: 1 });
    expect(builders.deals.or).toHaveBeenCalledWith(expect.stringContaining("Orchard"));
  });

  it("filters by stage when provided", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    await tools.search_deals.execute({ stage: "offer" }, EXECUTION_OPTIONS);

    expect(builders.deals.eq).toHaveBeenCalledWith("stage", "offer");
  });

  it("filters by contact_id when provided", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    await tools.search_deals.execute(
      { contact_id: "550e8400-e29b-41d4-a716-446655440001" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deals.eq).toHaveBeenCalledWith(
      "contact_id",
      "550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "timeout" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.search_deals.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: false, error: "timeout" });
  });

  it("escapes reserved PostgREST and LIKE characters in query text", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    await tools.search_deals.execute(
      { query: "Blk 123, #08-01 (A)_%" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deals.or).toHaveBeenCalledWith(
      expect.stringContaining("address.ilike.\"%Blk 123, #08-01 (A)\\\\_\\\\%%\""),
    );
  });
});

describe("create_deal", () => {
  it("creates and returns a deal", async () => {
    const created = {
      deal_id: "550e8400-e29b-41d4-a716-446655440011",
      client_id: CLIENT_ID,
      address: "456 Marina Bay",
      stage: "viewing",
      price: 2000000,
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deals: { data: created, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.create_deal.execute(
      {
        address: "456 Marina Bay",
        stage: "viewing",
        price: 2000000,
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal: created });
    expect(builders.deals.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        address: "456 Marina Bay",
        price: 2000000,
      }),
    );
    expect(builders.deals.single).toHaveBeenCalled();
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "invalid address" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.create_deal.execute(
      { address: "123" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "invalid address" });
  });
});

describe("update_deal", () => {
  it("updates and returns a deal", async () => {
    const updated = {
      deal_id: "550e8400-e29b-41d4-a716-446655440012",
      client_id: CLIENT_ID,
      address: "123 Orchard Rd",
      stage: "negotiation",
      price: 1600000,
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      notes: "Price negotiated down",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deals: { data: updated, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.update_deal.execute(
      {
        deal_id: "550e8400-e29b-41d4-a716-446655440012",
        stage: "negotiation",
        price: 1600000,
        notes: "Price negotiated down",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal: updated });
    expect(builders.deals.eq).toHaveBeenCalledWith(
      "deal_id",
      "550e8400-e29b-41d4-a716-446655440012",
    );
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.update_deal.execute(
      { deal_id: "550e8400-e29b-41d4-a716-446655440012" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "Row not found" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.update_deal.execute(
      {
        deal_id: "550e8400-e29b-41d4-a716-446655440012",
        stage: "lost",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
