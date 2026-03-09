/**
 * Tests for CRM deal-contact linking tools.
 * @module lib/runner/tools/crm/__tests__/deal-contacts.test
 */
import { describe, expect, it } from "vitest";

import { createDealContactTools } from "../deal-contacts";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("link_contact_to_deal", () => {
  it("links a contact to a deal with role", async () => {
    const linked = {
      deal_contact_id: "aaa",
      client_id: CLIENT_ID,
      deal_id: "d-1",
      contact_id: "c-1",
      role: "buyer",
      is_primary: true,
      created_at: "2026-03-04T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: linked, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_deal.execute(
      { deal_id: "d-1", contact_id: "c-1", role: "buyer", is_primary: true },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal_contact: linked });
    expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        deal_id: "d-1",
        contact_id: "c-1",
        role: "buyer",
        is_primary: true,
      }),
    );
  });

  it("defaults role to buyer and is_primary to false", async () => {
    const linked = {
      deal_contact_id: "bbb",
      client_id: CLIENT_ID,
      deal_id: "d-1",
      contact_id: "c-1",
      role: "buyer",
      is_primary: false,
      created_at: "2026-03-04T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: linked, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal_contact: linked });
    expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "buyer",
        is_primary: false,
      }),
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "duplicate key" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "duplicate key" });
  });
});

describe("unlink_contact_from_deal", () => {
  it("removes a contact-deal link", async () => {
    const removed = {
      deal_contact_id: "dc-1",
      client_id: CLIENT_ID,
      deal_id: "d-1",
      contact_id: "c-1",
      role: "buyer",
      is_primary: false,
      created_at: "2026-03-04T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: removed, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.unlink_contact_from_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, removed });
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("deal_id", "d-1");
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("contact_id", "c-1");
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "not found" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.unlink_contact_from_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "not found" });
  });
});

describe("get_deal_contacts", () => {
  it("returns contacts linked to a deal", async () => {
    const links = [
      { deal_contact_id: "dc-1", contact_id: "c-1", role: "buyer", is_primary: true },
      { deal_contact_id: "dc-2", contact_id: "c-2", role: "seller", is_primary: false },
    ];
    const { client } = createMockSupabase({
      deal_contacts: { data: links, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_deal_contacts.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      deal_contacts: links,
      count: 2,
    });
  });

  it("scopes deal contact reads to the current client", async () => {
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: [], error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    await tools.get_deal_contacts.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("deal_id", "d-1");
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "timeout" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_deal_contacts.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});

describe("get_contact_deals", () => {
  it("returns deals linked to a contact with role and is_primary", async () => {
    const links = [
      {
        deal_contact_id: "dc-1",
        deal_id: "d-1",
        contact_id: "c-1",
        role: "buyer",
        is_primary: true,
        deals: { deal_id: "d-1", address: "123 Orchard Rd", stage: "offer", price: 1200000 },
      },
      {
        deal_contact_id: "dc-2",
        deal_id: "d-2",
        contact_id: "c-1",
        role: "seller",
        is_primary: false,
        deals: { deal_id: "d-2", address: "456 Marina Bay", stage: "leads", price: null },
      },
    ];
    const { client } = createMockSupabase({
      deal_contacts: { data: links, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_contact_deals.execute(
      { contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      contact_deals: links,
      count: 2,
    });
  });

  it("queries deal_contacts by contact_id with deal join", async () => {
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: [], error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    await tools.get_contact_deals.execute(
      { contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deal_contacts.select).toHaveBeenCalledWith(
      "*, deals(deal_id, address, stage, price)",
    );
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("contact_id", "c-1");
  });

  it("sorts primary links first", async () => {
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: [], error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    await tools.get_contact_deals.execute(
      { contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deal_contacts.order).toHaveBeenCalledWith(
      "is_primary",
      { ascending: false },
    );
  });

  it("returns empty array when contact has no linked deals", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: [], error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_contact_deals.execute(
      { contact_id: "c-99" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      contact_deals: [],
      count: 0,
    });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "connection reset" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_contact_deals.execute(
      { contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "connection reset" });
  });
});
