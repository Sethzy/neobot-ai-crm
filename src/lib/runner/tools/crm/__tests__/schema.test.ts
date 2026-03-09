/**
 * Tests for CRM schema introspection tool.
 * @module lib/runner/tools/crm/__tests__/schema.test
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";

import { createSchemaTools } from "../schema";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("describe_crm_schema", () => {
  it("returns the full resolved CRM config with defaults", async () => {
    const tools = createSchemaTools(CRM_DEFAULTS);

    const result = await tools.describe_crm_schema.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      schema: {
        deal_label: CRM_DEFAULTS.deal_label,
        company_label: CRM_DEFAULTS.company_label,
        deal_stages: CRM_DEFAULTS.deal_stages,
        contact_types: CRM_DEFAULTS.contact_types,
        interaction_types: CRM_DEFAULTS.interaction_types,
        deal_contact_roles: CRM_DEFAULTS.deal_contact_roles,
        company_industries: CRM_DEFAULTS.company_industries,
        deal_custom_fields: CRM_DEFAULTS.deal_custom_fields,
        contact_custom_fields: CRM_DEFAULTS.contact_custom_fields,
        company_custom_fields: CRM_DEFAULTS.company_custom_fields,
        task_custom_fields: CRM_DEFAULTS.task_custom_fields,
      },
    });
  });

  it("reflects custom config with non-default labels and vocab", async () => {
    const custom: CrmVocabConfig = {
      ...CRM_DEFAULTS,
      deal_label: "Policy",
      company_label: "Brokerage",
      deal_stages: ["lead", "underwriting", "bound"],
      company_industries: ["insurance", "reinsurance"],
    };
    const tools = createSchemaTools(custom);

    const result = await tools.describe_crm_schema.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      schema: expect.objectContaining({
        deal_label: "Policy",
        company_label: "Brokerage",
        deal_stages: ["lead", "underwriting", "bound"],
        company_industries: ["insurance", "reinsurance"],
      }),
    });
  });

  it("includes custom field definitions in the output", async () => {
    const custom: CrmVocabConfig = {
      ...CRM_DEFAULTS,
      contact_custom_fields: [
        { key: "nationality", label: "Nationality", type: "text" },
      ],
      deal_custom_fields: [
        { key: "commission_rate", label: "Commission %", type: "number" },
      ],
    };
    const tools = createSchemaTools(custom);

    const result = await tools.describe_crm_schema.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      schema: expect.objectContaining({
        contact_custom_fields: [
          { key: "nationality", label: "Nationality", type: "text" },
        ],
        deal_custom_fields: [
          { key: "commission_rate", label: "Commission %", type: "number" },
        ],
      }),
    });
  });

  it("has no required input parameters", () => {
    const tools = createSchemaTools(CRM_DEFAULTS);
    const parsed = tools.describe_crm_schema.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });
});
