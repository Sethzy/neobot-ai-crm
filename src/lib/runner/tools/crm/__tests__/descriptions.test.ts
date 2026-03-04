/**
 * Tests for CRM tool description quality (P0 warnings + P1 improvements).
 * @module lib/runner/tools/crm/__tests__/descriptions.test
 */
import { describe, expect, it } from "vitest";

import { createContactTools } from "../contacts";
import { createDealTools } from "../deals";
import { createDealContactTools } from "../deal-contacts";
import { createInteractionTools } from "../interactions";
import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const { client } = createMockSupabase();

describe("P0: data modification warnings on all write tools", () => {
  const contactTools = createContactTools(client, CLIENT_ID);
  const dealTools = createDealTools(client, CLIENT_ID);
  const dealContactTools = createDealContactTools(client, CLIENT_ID);
  const interactionTools = createInteractionTools(client, CLIENT_ID);
  const taskTools = createTaskTools(client, CLIENT_ID);

  it.each([
    ["create_contact", contactTools.create_contact],
    ["update_contact", contactTools.update_contact],
    ["create_deal", dealTools.create_deal],
    ["update_deal", dealTools.update_deal],
    ["link_contact_to_deal", dealContactTools.link_contact_to_deal],
    ["unlink_contact_from_deal", dealContactTools.unlink_contact_from_deal],
    ["create_interaction", interactionTools.create_interaction],
    ["create_task", taskTools.create_task],
    ["update_task", taskTools.update_task],
  ])("%s has data modification warning", (_name, toolObj) => {
    expect(toolObj.description).toContain("Data Modification Warning");
  });
});

describe("P1-c: search tool descriptions include usage guidance", () => {
  const contactTools = createContactTools(client, CLIENT_ID);
  const dealTools = createDealTools(client, CLIENT_ID);
  const taskTools = createTaskTools(client, CLIENT_ID);

  it("search_contacts mentions avoiding duplicates", () => {
    expect(contactTools.search_contacts.description).toContain("avoid duplicates");
  });

  it("search_contacts mentions omitting query to list all", () => {
    expect(contactTools.search_contacts.description).toContain("Omit query to list all");
  });

  it("search_deals mentions get_deal_contacts", () => {
    expect(dealTools.search_deals.description).toContain("get_deal_contacts");
  });

  it("search_tasks mentions finding tasks before updating", () => {
    expect(taskTools.search_tasks.description).toContain("before updating");
  });
});

describe("P1-f: update tools mention partial-update behavior", () => {
  const contactTools = createContactTools(client, CLIENT_ID);
  const dealTools = createDealTools(client, CLIENT_ID);
  const taskTools = createTaskTools(client, CLIENT_ID);

  it.each([
    ["update_contact", contactTools.update_contact],
    ["update_deal", dealTools.update_deal],
    ["update_task", taskTools.update_task],
  ])("%s mentions partial updates", (_name, toolObj) => {
    expect(toolObj.description).toContain("Only provided fields are updated");
  });
});
