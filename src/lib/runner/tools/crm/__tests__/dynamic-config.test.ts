/**
 * Tests for config-driven deal, interaction, task, and role tools.
 * @module lib/runner/tools/crm/__tests__/dynamic-config
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { createDealContactTools } from "../deal-contacts";
import { createDealTools } from "../deals";
import { createInteractionTools } from "../interactions";
import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const INSURANCE_CONFIG = {
  ...CRM_DEFAULTS,
  deal_label: "Policy",
  deal_stages: ["lead", "quoted", "underwriting", "bound", "lost"],
  interaction_types: ["call", "email", "site_visit"],
  deal_contact_roles: ["client", "broker"],
  deal_custom_fields: [
    { key: "policy_number", label: "Policy Number", type: "text" as const, required: true },
    { key: "coverage", label: "Coverage", type: "number" as const },
  ],
  task_custom_fields: [
    { key: "priority", label: "Priority", type: "select" as const, options: ["low", "high"] },
  ],
};

describe("deal tools configurable vocab", () => {
  it("uses config-driven deal stages and labels", () => {
    const { client } = createMockSupabase();
    const tools = createDealTools(client, CLIENT_ID, INSURANCE_CONFIG);

    expect(tools.search_deals.inputSchema.safeParse({ stage: "underwriting" }).success).toBe(true);
    expect(tools.search_deals.inputSchema.safeParse({ stage: "offer" }).success).toBe(false);
    expect(tools.create_deal.description).toContain("Policy");
  });

  it("validates and persists deal custom_fields on create", async () => {
    const created = {
      deal_id: "750e8400-e29b-41d4-a716-446655440000",
      client_id: CLIENT_ID,
      address: "123 Orchard Road",
      stage: "underwriting",
      price: 50000,
      notes: null,
      custom_fields: { policy_number: "POL-1", coverage: 50000 },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      deals: [
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createDealTools(client, CLIENT_ID, INSURANCE_CONFIG);

    const result = await tools.create_deal.execute({
      address: "123 Orchard Road",
      stage: "underwriting",
      price: 50000,
      custom_fields: { policy_number: "POL-1", coverage: 50000 },
    }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, deal: created });
    expect(builderHistory.deals[1].insert).toHaveBeenCalledWith(expect.objectContaining({
      custom_fields: { policy_number: "POL-1", coverage: 50000 },
    }));
  });

  it("merges deal custom_fields patches on update", async () => {
    const existing = {
      deal_id: "750e8400-e29b-41d4-a716-446655440010",
      client_id: CLIENT_ID,
      address: "123 Orchard Road",
      stage: "underwriting",
      price: 50000,
      notes: null,
      custom_fields: { policy_number: "POL-1", coverage: 50000 },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const updated = {
      ...existing,
      custom_fields: { policy_number: "POL-1", coverage: 75000 },
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      deals: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    const tools = createDealTools(client, CLIENT_ID, INSURANCE_CONFIG);

    const result = await tools.update_deal.execute({
      deal_id: existing.deal_id,
      custom_fields: { coverage: 75000 },
    }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, deal: updated });
    expect(builderHistory.deals[1].update).toHaveBeenCalledWith(expect.objectContaining({
      custom_fields: { policy_number: "POL-1", coverage: 75000 },
    }));
  });
});

describe("interaction and deal-contact tools configurable vocab", () => {
  it("uses config-driven interaction types", () => {
    const { client } = createMockSupabase();
    const tools = createInteractionTools(client, CLIENT_ID, INSURANCE_CONFIG);

    expect(tools.create_interaction.inputSchema.safeParse({
      contact_id: CLIENT_ID,
      type: "site_visit",
    }).success).toBe(true);
    expect(tools.create_interaction.inputSchema.safeParse({
      contact_id: CLIENT_ID,
      type: "meeting",
    }).success).toBe(false);
  });

  it("uses config-driven deal-contact roles", () => {
    const { client } = createMockSupabase();
    const tools = createDealContactTools(client, CLIENT_ID, INSURANCE_CONFIG);

    expect(tools.link_contact_to_deal.inputSchema.safeParse({
      deal_id: CLIENT_ID,
      contact_id: CLIENT_ID,
      role: "broker",
    }).success).toBe(true);
    expect(tools.link_contact_to_deal.inputSchema.safeParse({
      deal_id: CLIENT_ID,
      contact_id: CLIENT_ID,
      role: "buyer",
    }).success).toBe(false);
  });
});

describe("task tools configurable custom fields", () => {
  it("keeps binary status but accepts configured custom_fields", async () => {
    const created = {
      task_id: "950e8400-e29b-41d4-a716-446655440000",
      client_id: CLIENT_ID,
      contact_id: null,
      deal_id: null,
      title: "Review policy",
      description: null,
      status: "open",
      due_date: null,
      custom_fields: { priority: "high" },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: created, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID, INSURANCE_CONFIG);

    expect(tools.create_task.inputSchema.safeParse({
      title: "Review policy",
      status: "open",
      custom_fields: { priority: "high" },
    }).success).toBe(true);
    expect(tools.create_task.inputSchema.safeParse({
      title: "Review policy",
      status: "in_progress",
    }).success).toBe(false);
    expect(tools.create_task.inputSchema.safeParse({
      title: "Review policy",
      custom_fields: { unknown: "value" },
    }).success).toBe(false);

    const result = await tools.create_task.execute({
      title: "Review policy",
      custom_fields: { priority: "high" },
    }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, task: created });
    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(expect.objectContaining({
      custom_fields: { priority: "high" },
    }));
  });
});
