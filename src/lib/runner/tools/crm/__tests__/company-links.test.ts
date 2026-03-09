/**
 * Tests for CRM company link tools.
 * @module lib/runner/tools/crm/__tests__/company-links
 */
import { describe, expect, it } from "vitest";

import { createCompanyLinkTools } from "../company-links";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("company link tools", () => {
  it("links and unlinks a contact to a company", async () => {
    const linkedContact = {
      contact_id: "contact-1",
      company_id: "company-1",
      client_id: CLIENT_ID,
    };
    const unlinkedContact = {
      ...linkedContact,
      company_id: null,
    };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: linkedContact, error: null },
        { data: unlinkedContact, error: null },
      ],
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const linked = await tools.link_contact_to_company.execute(
      { contact_id: "contact-1", company_id: "company-1" },
      EXECUTION_OPTIONS,
    );
    const unlinked = await tools.unlink_contact_from_company.execute(
      { contact_id: "contact-1" },
      EXECUTION_OPTIONS,
    );

    expect(linked).toEqual({ success: true, contact: linkedContact });
    expect(unlinked).toEqual({ success: true, contact: unlinkedContact });
    expect(builderHistory.contacts[0].update).toHaveBeenCalledWith({ company_id: "company-1" });
    expect(builderHistory.contacts[1].update).toHaveBeenCalledWith({ company_id: null });
  });

  it("links and unlinks a deal to a company", async () => {
    const linkedDeal = {
      deal_id: "deal-1",
      company_id: "company-1",
      client_id: CLIENT_ID,
    };
    const unlinkedDeal = {
      ...linkedDeal,
      company_id: null,
    };
    const { client, builderHistory } = createMockSupabase({
      deals: [
        { data: linkedDeal, error: null },
        { data: unlinkedDeal, error: null },
      ],
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const linked = await tools.link_deal_to_company.execute(
      { deal_id: "deal-1", company_id: "company-1" },
      EXECUTION_OPTIONS,
    );
    const unlinked = await tools.unlink_deal_from_company.execute(
      { deal_id: "deal-1" },
      EXECUTION_OPTIONS,
    );

    expect(linked).toEqual({ success: true, deal: linkedDeal });
    expect(unlinked).toEqual({ success: true, deal: unlinkedDeal });
    expect(builderHistory.deals[0].update).toHaveBeenCalledWith({ company_id: "company-1" });
    expect(builderHistory.deals[1].update).toHaveBeenCalledWith({ company_id: null });
  });
});

describe("get_company_contacts", () => {
  it("returns contacts for a given company", async () => {
    const contacts = [
      { contact_id: "c-1", first_name: "Alice", last_name: "Tan", company_id: "comp-1" },
      { contact_id: "c-2", first_name: "Bob", last_name: "Lee", company_id: "comp-1" },
    ];
    const { client } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_contacts.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      contacts,
      count: 2,
    });
  });

  it("filters by company_id", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    await tools.get_company_contacts.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.contacts.eq).toHaveBeenCalledWith("company_id", "comp-1");
  });

  it("respects custom limit", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    await tools.get_company_contacts.execute(
      { company_id: "comp-1", limit: 5 },
      EXECUTION_OPTIONS,
    );

    expect(builders.contacts.limit).toHaveBeenCalledWith(5);
  });

  it("returns empty array when company has no contacts", async () => {
    const { client } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_contacts.execute(
      { company_id: "comp-99" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contacts: [], count: 0 });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "timeout" } },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_contacts.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});

describe("get_company_deals", () => {
  it("returns deals for a given company", async () => {
    const deals = [
      { deal_id: "d-1", address: "123 Orchard", stage: "offer", company_id: "comp-1" },
      { deal_id: "d-2", address: "456 Marina", stage: "leads", company_id: "comp-1" },
    ];
    const { client } = createMockSupabase({
      deals: { data: deals, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_deals.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      deals,
      count: 2,
    });
  });

  it("filters by company_id", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    await tools.get_company_deals.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.deals.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builders.deals.eq).toHaveBeenCalledWith("company_id", "comp-1");
  });

  it("respects custom limit", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    await tools.get_company_deals.execute(
      { company_id: "comp-1", limit: 10 },
      EXECUTION_OPTIONS,
    );

    expect(builders.deals.limit).toHaveBeenCalledWith(10);
  });

  it("returns empty array when company has no deals", async () => {
    const { client } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_deals.execute(
      { company_id: "comp-99" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deals: [], count: 0 });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "connection refused" } },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_deals.execute(
      { company_id: "comp-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "connection refused" });
  });
});
