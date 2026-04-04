/**
 * Tests for config-driven interaction and task tools.
 * @module lib/runner/tools/crm/__tests__/dynamic-config
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

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
  company_label: "Brokerage",
  company_industries: ["property_agency", "developer", "mortgage_broker"],
  deal_custom_fields: [
    { key: "policy_number", label: "Policy Number", type: "text" as const, required: true },
    { key: "coverage", label: "Coverage", type: "number" as const },
  ],
  company_custom_fields: [
    { key: "tier", label: "Tier", type: "select" as const, options: ["a", "b"] },
  ],
  task_custom_fields: [
    { key: "priority", label: "Priority", type: "select" as const, options: ["low", "high"] },
  ],
};

describe("interaction tools configurable vocab", () => {
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
      status: "todo",
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
      status: "todo",
      custom_fields: { priority: "high" },
    }).success).toBe(true);
    expect(tools.create_task.inputSchema.safeParse({
      title: "Review policy",
      status: "pending",
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
