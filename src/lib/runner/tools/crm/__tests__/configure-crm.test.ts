/**
 * Tests for the CRM configuration tool.
 * @module lib/runner/tools/crm/__tests__/configure-crm
 */
import { describe, expect, it } from "vitest";

import { createConfigureCrmTool } from "../configure-crm";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createConfigureCrmTool", () => {
  it("upserts deduplicated vocabulary updates and returns the resolved config", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      company_label: "Brokerage",
      deal_stages: ["lead", "quoted"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: ["property_agency", "developer"],
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
    };
    const { client, builderHistory } = createMockSupabase({
      crm_config: [
        { data: null, error: null },
        { data: updatedRow, error: null },
      ],
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { deal_label: "Policy", deal_stages: ["lead", "quoted", "lead"] },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.crm_config[1]?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        deal_label: "Policy",
        deal_stages: ["lead", "quoted"],
      }),
      { onConflict: "client_id" },
    );
    expect(result).toMatchObject({
      success: true,
      resolved_config: expect.objectContaining({
        deal_label: "Policy",
        deal_stages: ["lead", "quoted"],
        company_label: "Brokerage",
        company_industries: ["property_agency", "developer"],
      }),
    });
  });

  it("accepts partial updates without requiring every config field", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      company_label: "Company",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
    };
    const { client, builderHistory } = createMockSupabase({
      crm_config: [
        { data: null, error: null },
        { data: updatedRow, error: null },
      ],
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { deal_label: "Policy" },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.crm_config[1]?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        deal_label: "Policy",
      }),
      { onConflict: "client_id" },
    );
    expect(result).toMatchObject({
      success: true,
      resolved_config: expect.objectContaining({ deal_label: "Policy" }),
    });
  });

  it("upserts company-specific label, industries, and custom fields", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Deal",
      company_label: "Brokerage",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: ["property_agency", "developer"],
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [{ key: "tier", label: "Tier", type: "text" }],
      task_custom_fields: [],
    };
    const { client, builderHistory } = createMockSupabase({
      crm_config: [
        { data: null, error: null },
        { data: updatedRow, error: null },
      ],
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      {
        company_label: "Brokerage",
        company_industries: ["property_agency", "developer", "property_agency"],
        company_custom_fields: [{ key: "tier", label: "Tier", type: "text" }],
      },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.crm_config[1]?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        company_label: "Brokerage",
        company_industries: ["property_agency", "developer"],
        company_custom_fields: [{ key: "tier", label: "Tier", type: "text" }],
      }),
      { onConflict: "client_id" },
    );
    expect(result).toMatchObject({
      success: true,
      resolved_config: expect.objectContaining({
        company_label: "Brokerage",
        company_industries: ["property_agency", "developer"],
        company_custom_fields: [{ key: "tier", label: "Tier", type: "text" }],
      }),
    });
  });

  it("rejects empty vocabulary arrays at the schema boundary", () => {
    const { client } = createMockSupabase();
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = tools.configure_crm.inputSchema.safeParse({ deal_stages: [] });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate custom field keys at the schema boundary", () => {
    const { client } = createMockSupabase();
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = tools.configure_crm.inputSchema.safeParse({
      deal_custom_fields: [
        { key: "coverage_amount", label: "Coverage Amount", type: "currency" },
        { key: "coverage_amount", label: "Coverage", type: "number" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("warns before removing vocabulary values that are still in use", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          config_id: "cfg-1",
          client_id: CLIENT_ID,
          deal_label: "Deal",
          company_label: "Company",
          deal_stages: ["lead", "quoted", "bound"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          company_industries: null,
          deal_custom_fields: [],
          contact_custom_fields: [],
          company_custom_fields: [],
          task_custom_fields: [],
        },
        error: null,
      },
      deals: { data: [{ deal_id: "d1", stage: "quoted" }, { deal_id: "d2", stage: "quoted" }], error: null },
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { deal_stages: ["lead", "bound"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "values_in_use",
      in_use_values: {
        deal_stages: {
          quoted: 2,
        },
      },
    });
  });

  it("warns before removing company industries that are still in use", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          config_id: "cfg-1",
          client_id: CLIENT_ID,
          deal_label: "Deal",
          company_label: "Brokerage",
          deal_stages: ["lead", "quoted", "bound"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          company_industries: ["property_agency", "developer", "bank"],
          deal_custom_fields: [],
          contact_custom_fields: [],
          company_custom_fields: [],
          task_custom_fields: [],
        },
        error: null,
      },
      companies: {
        data: [{ company_id: "co-1", industry: "bank" }, { company_id: "co-2", industry: "bank" }],
        error: null,
      },
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { company_industries: ["property_agency", "developer"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "values_in_use",
      in_use_values: {
        company_industries: {
          bank: 2,
        },
      },
    });
  });

  it("warns before removing populated custom field definitions", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          config_id: "cfg-1",
          client_id: CLIENT_ID,
          deal_label: "Policy",
          company_label: "Company",
          deal_stages: ["lead", "quoted"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          company_industries: null,
          deal_custom_fields: [
            { key: "coverage_amount", label: "Coverage Amount", type: "currency" },
          ],
          contact_custom_fields: [],
          company_custom_fields: [],
          task_custom_fields: [],
        },
        error: null,
      },
      deals: {
        data: [
          { custom_fields: { coverage_amount: 500000 } },
          { custom_fields: { coverage_amount: null } },
          { custom_fields: { other_field: "ignore" } },
        ],
        error: null,
      },
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { deal_custom_fields: [] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "custom_fields_in_use",
      in_use_custom_fields: {
        deal_custom_fields: {
          coverage_amount: 1,
        },
      },
    });
  });

  it("warns before removing populated company custom field definitions", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          config_id: "cfg-1",
          client_id: CLIENT_ID,
          deal_label: "Deal",
          company_label: "Brokerage",
          deal_stages: ["lead", "quoted"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          company_industries: ["property_agency"],
          deal_custom_fields: [],
          contact_custom_fields: [],
          company_custom_fields: [
            { key: "tier", label: "Tier", type: "text" },
          ],
          task_custom_fields: [],
        },
        error: null,
      },
      companies: {
        data: [
          { custom_fields: { tier: "a" } },
          { custom_fields: { tier: null } },
        ],
        error: null,
      },
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      { company_custom_fields: [] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "custom_fields_in_use",
      in_use_custom_fields: {
        company_custom_fields: {
          tier: 1,
        },
      },
    });
  });

  it("allows confirmed removals and returns the updated config", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      company_label: "Company",
      deal_stages: ["lead", "bound"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
    };
    const { client, builderHistory } = createMockSupabase({
      crm_config: [
        {
          data: {
            config_id: "cfg-1",
            client_id: CLIENT_ID,
            deal_label: "Policy",
            company_label: "Company",
            deal_stages: ["lead", "quoted", "bound"],
            contact_types: null,
            interaction_types: null,
            deal_contact_roles: null,
            company_industries: null,
            deal_custom_fields: [
              { key: "coverage_amount", label: "Coverage Amount", type: "currency" },
            ],
            contact_custom_fields: [],
            company_custom_fields: [],
            task_custom_fields: [],
          },
          error: null,
        },
        { data: updatedRow, error: null },
      ],
      deals: {
        data: [
          { deal_id: "d1", custom_fields: { coverage_amount: 500000 } },
        ],
        error: null,
      },
    });
    const tools = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tools.configure_crm.execute(
      {
        deal_stages: ["lead", "bound"],
        deal_custom_fields: [],
        confirm_removals: true,
      },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.crm_config[1]?.upsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      resolved_config: expect.objectContaining({
        deal_stages: ["lead", "bound"],
      }),
    });
  });
});
