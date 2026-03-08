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
