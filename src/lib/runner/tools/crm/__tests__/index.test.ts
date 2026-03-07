/**
 * Tests for CRM tool barrel aggregation.
 * @module lib/runner/tools/crm/__tests__/index.test
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { createCrmTools } from "../index";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createCrmTools", () => {
  it("returns only read tools when writes are disabled", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: false });

    expect(Object.keys(tools).sort()).toEqual([
      "get_deal_contacts",
      "search_contacts",
      "search_deals",
      "search_tasks",
    ]);
  });

  it("returns all 15 expected CRM tools when writes are enabled", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: true });

    expect(Object.keys(tools).sort()).toEqual([
      "batch_create_contacts",
      "batch_create_deals",
      "create_contact",
      "create_deal",
      "create_interaction",
      "create_task",
      "get_deal_contacts",
      "link_contact_to_deal",
      "search_contacts",
      "search_deals",
      "search_tasks",
      "unlink_contact_from_deal",
      "update_contact",
      "update_deal",
      "update_task",
    ]);
  });

  it("returns tool objects with execute functions", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID);

    for (const toolName of Object.keys(tools)) {
      expect(typeof tools[toolName as keyof typeof tools]).toBe("object");
      expect(typeof tools[toolName as keyof typeof tools].execute).toBe("function");
    }
  });

  it("returns only configure_crm in setup mode", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { mode: "setup" });

    expect(Object.keys(tools)).toEqual(["configure_crm"]);
  });

  it("passes config through to the normal tool factories", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, {
      mode: "normal",
      config: {
        ...CRM_DEFAULTS,
        deal_label: "Policy",
        deal_stages: ["lead", "underwriting", "bound"],
      },
    });

    expect(tools.create_deal.description).toContain("Policy");
    expect(tools.search_deals.description).toContain("Policy");
    expect(tools.search_deals.inputSchema.safeParse({ stage: "underwriting" }).success).toBe(true);
    expect(tools.search_deals.inputSchema.safeParse({ stage: "offer" }).success).toBe(false);
    expect(tools).not.toHaveProperty("configure_crm");
  });
});
