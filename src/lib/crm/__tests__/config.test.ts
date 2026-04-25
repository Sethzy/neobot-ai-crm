/**
 * Tests for CRM configurability helpers and schemas.
 * @module lib/crm/__tests__/config
 */
import { describe, expect, it } from "vitest";

import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import {
  buildCustomFieldsSchema,
  CRM_DEFAULTS,
  customFieldDefinitionSchema,
  loadCrmConfig,
  matchVocabularyValue,
  resolveCrmConfig,
  type CustomFieldDefinition,
  type CrmConfigRow,
} from "../config";
import {
  CONTACT_DEFAULT_FIELDS,
  COMPANY_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "../field-definitions";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("customFieldDefinitionSchema", () => {
  it("accepts valid text fields", () => {
    const field = { key: "policy_number", label: "Policy Number", type: "text" } as const;

    expect(customFieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("requires non-empty options for select fields", () => {
    const field = {
      key: "priority",
      label: "Priority",
      type: "select",
      options: ["low", "high"],
    } as const;

    expect(customFieldDefinitionSchema.parse(field)).toEqual(field);
    expect(() =>
      customFieldDefinitionSchema.parse({
        key: "priority",
        label: "Priority",
        type: "select",
      }),
    ).toThrow();
  });

  it("accepts boolean fields without options", () => {
    const field = {
      key: "vip",
      label: "VIP",
      type: "boolean",
    } as const;

    expect(customFieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("rejects invalid field types", () => {
    expect(() =>
      customFieldDefinitionSchema.parse({
        key: "test",
        label: "Test",
        type: "checkbox",
      }),
    ).toThrow();
  });
});

describe("resolveCrmConfig", () => {
  it("includes company defaults in the resolved config", () => {
    expect(CRM_DEFAULTS).toMatchObject({
      company_label: "Company",
      company_industries: [
        "property_agency",
        "developer",
        "law_firm",
        "bank",
        "government",
        "other",
      ],
      company_custom_fields: [],
    });
  });

  it("returns defaults when row is null", () => {
    expect(resolveCrmConfig(null)).toEqual(CRM_DEFAULTS);
  });

  it("uses configured values and falls back for null columns", () => {
    const row: CrmConfigRow = {
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound", "lost"],
      contact_types: ["prospect", "client"],
      interaction_types: null,
      deal_contact_roles: null,
      company_label: "Brokerage",
      company_industries: ["property_agency", "developer"],
      deal_custom_fields: [{ key: "policy_number", label: "Policy Number", type: "text" }],
      contact_custom_fields: [],
      company_custom_fields: [{ key: "tier", label: "Tier", type: "select", options: ["a", "b"] }],
      task_custom_fields: [],
    };

    const config = resolveCrmConfig(row);

    expect(config.deal_label).toBe("Policy");
    expect(config.deal_stages).toEqual(["lead", "quoted", "bound", "lost"]);
    expect(config.contact_types).toEqual(["prospect", "client"]);
    expect(config.interaction_types).toEqual(CRM_DEFAULTS.interaction_types);
    expect(config.deal_contact_roles).toEqual(CRM_DEFAULTS.deal_contact_roles);
    expect(config.company_label).toBe("Brokerage");
    expect(config.company_industries).toEqual(["property_agency", "developer"]);
    expect(config.company_custom_fields).toEqual([
      { key: "tier", label: "Tier", type: "select", options: ["a", "b"] },
    ]);
  });

  it("normalizes legacy object-array vocab shapes and deduplicates string values", () => {
    const row: CrmConfigRow = {
      deal_label: "Deal",
      deal_stages: [
        { id: "leads", name: "Leads" },
        { id: "closing", name: "Closing" },
        "leads",
      ],
      contact_types: ["buyer", "buyer", "seller"],
      interaction_types: [{ id: "call", name: "Call" }],
      deal_contact_roles: null,
      company_label: "Company",
      company_industries: [
        { id: "property_agency", name: "Property Agency" },
        "developer",
        "property_agency",
      ],
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
    };

    const config = resolveCrmConfig(row);

    expect(config.deal_stages).toEqual(["leads", "closing"]);
    expect(config.contact_types).toEqual(["buyer", "seller"]);
    expect(config.interaction_types).toEqual(["call"]);
    expect(config.company_industries).toEqual(["property_agency", "developer"]);
  });

  it("filters invalid custom field definitions and keeps the last duplicate key", () => {
    const row: CrmConfigRow = {
      deal_label: "Deal",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_label: "Company",
      company_industries: null,
      deal_custom_fields: [
        { key: "coverage", label: "Coverage", type: "number" },
        { key: "", label: "Broken", type: "text" },
        { key: "coverage", label: "Coverage Amount", type: "currency" },
      ] as CustomFieldDefinition[],
      contact_custom_fields: [],
      company_custom_fields: [
        { key: "tier", label: "Tier", type: "text" },
        { key: "", label: "Broken", type: "text" },
        { key: "tier", label: "Tier Level", type: "select", options: ["a", "b"] },
      ] as CustomFieldDefinition[],
      task_custom_fields: [],
    };

    const config = resolveCrmConfig(row);

    expect(config.deal_custom_fields).toHaveLength(1);
    expect(config.deal_custom_fields[0]).toMatchObject({
      key: "coverage",
      label: "Coverage Amount",
      type: "currency",
    });
    expect(config.company_custom_fields).toHaveLength(1);
    expect(config.company_custom_fields[0]).toMatchObject({
      key: "tier",
      label: "Tier Level",
      type: "select",
      options: ["a", "b"],
    });
  });
});

describe("buildCustomFieldsSchema", () => {
  it("rejects unknown fields when no definitions exist", () => {
    const schema = buildCustomFieldsSchema([]);

    expect(schema.parse({})).toEqual({});
    expect(() => schema.parse({ anything: "goes" })).toThrow();
  });

  it("validates configured custom fields in create mode", () => {
    const schema = buildCustomFieldsSchema([
      { key: "policy_number", label: "Policy Number", type: "text", required: true },
      { key: "coverage", label: "Coverage", type: "number" },
      { key: "priority", label: "Priority", type: "select", options: ["low", "high"] },
      { key: "expiry_date", label: "Expiry Date", type: "date" },
      { key: "vip", label: "VIP", type: "boolean" },
    ]);

    expect(
      schema.parse({
        policy_number: "POL-001",
        coverage: 50000,
        priority: "low",
        expiry_date: "2026-12-31",
        vip: true,
      }),
    ).toEqual({
      policy_number: "POL-001",
      coverage: 50000,
      priority: "low",
      expiry_date: "2026-12-31",
      vip: true,
    });

    expect(schema.parse({ policy_number: "POL-001", vip: false })).toEqual({
      policy_number: "POL-001",
      vip: false,
    });
    expect(schema.parse({ policy_number: "POL-001", vip: null })).toEqual({
      policy_number: "POL-001",
      vip: null,
    });
    expect(() => schema.parse({ coverage: 50000 })).toThrow();
    expect(() => schema.parse({ policy_number: "POL-001", coverage: "50000" })).toThrow();
    expect(() => schema.parse({ policy_number: "POL-001", priority: "urgent" })).toThrow();
    expect(() => schema.parse({ policy_number: "POL-001", vip: "true" })).toThrow();
  });

  it("allows partial updates in update mode", () => {
    const schema = buildCustomFieldsSchema(
      [{ key: "policy_number", label: "Policy Number", type: "text", required: true }],
      "update",
    );

    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ policy_number: "POL-002" })).toEqual({ policy_number: "POL-002" });
  });
});

describe("resolveCrmConfig — field arrays", () => {
  it("returns default field arrays when config row is null", () => {
    const config = resolveCrmConfig(null);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
    expect(config.company_fields).toEqual(COMPANY_DEFAULT_FIELDS);
    expect(config.deal_fields).toEqual(DEAL_DEFAULT_FIELDS);
  });

  it("returns default field arrays when config row has no field arrays", () => {
    const row: CrmConfigRow = {
      deal_label: "Deal",
      deal_stages: ["a", "b"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_label: "Company",
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
    expect(config.company_fields).toEqual(COMPANY_DEFAULT_FIELDS);
    expect(config.deal_fields).toEqual(DEAL_DEFAULT_FIELDS);
  });

  it("uses stored field arrays when present in config row", () => {
    const customContactFields = [
      { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
      { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: true, order: 1, editable: true, required: false },
    ];
    const row: CrmConfigRow = {
      deal_label: "Deal",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_label: "Company",
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
      contact_fields: customContactFields,
    };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toHaveLength(2);
    expect(config.contact_fields[1].key).toBe("budget");
  });

  it("falls back to defaults when stored field arrays are malformed", () => {
    const row: CrmConfigRow = {
      deal_label: "Deal",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_label: "Company",
      company_industries: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
      contact_fields: "not an array",
    };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
  });
});

describe("loadCrmConfig", () => {
  it("returns defaults with hasConfig false when no row exists", async () => {
    const { client, builders } = createMockSupabase({
      crm_config: { data: null, error: null },
    });

    const result = await loadCrmConfig(client, CLIENT_ID);

    expect(result).toEqual({
      config: CRM_DEFAULTS,
      hasConfig: false,
    });
    expect(builders.crm_config.select).toHaveBeenCalled();
    expect(builders.crm_config.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns resolved config with hasConfig true when a row exists", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          deal_label: "Policy",
          deal_stages: ["lead", "quoted", "bound"],
          contact_types: ["prospect", "client"],
          interaction_types: ["call"],
          deal_contact_roles: ["client", "broker"],
          company_label: "Brokerage",
          company_industries: ["property_agency", "developer"],
          deal_custom_fields: [{ key: "policy_number", label: "Policy Number", type: "text" }],
          contact_custom_fields: [],
          company_custom_fields: [{ key: "tier", label: "Tier", type: "text" }],
          task_custom_fields: [],
        },
        error: null,
      },
    });

    const result = await loadCrmConfig(client, CLIENT_ID);

    expect(result.hasConfig).toBe(true);
    expect(result.config.deal_label).toBe("Policy");
    expect(result.config.deal_stages).toEqual(["lead", "quoted", "bound"]);
    expect(result.config.deal_contact_roles).toEqual(["client", "broker"]);
    expect(result.config.company_label).toBe("Brokerage");
    expect(result.config.company_industries).toEqual(["property_agency", "developer"]);
    expect(result.config.company_custom_fields).toEqual([
      { key: "tier", label: "Tier", type: "text" },
    ]);
  });
});

describe("matchVocabularyValue", () => {
  const stages = ["lead", "qualified", "proposal_sent", "negotiation", "won"];

  it("returns exact match unchanged", () => {
    expect(matchVocabularyValue("lead", stages)).toBe("lead");
    expect(matchVocabularyValue("proposal_sent", stages)).toBe("proposal_sent");
  });

  it("matches case-insensitively", () => {
    expect(matchVocabularyValue("Lead", stages)).toBe("lead");
    expect(matchVocabularyValue("NEGOTIATION", stages)).toBe("negotiation");
    expect(matchVocabularyValue("Won", stages)).toBe("won");
  });

  it("matches spaces to underscores", () => {
    expect(matchVocabularyValue("Proposal Sent", stages)).toBe("proposal_sent");
    expect(matchVocabularyValue("proposal sent", stages)).toBe("proposal_sent");
  });

  it("matches hyphens to underscores", () => {
    expect(matchVocabularyValue("proposal-sent", stages)).toBe("proposal_sent");
  });

  it("returns raw value when no config entry matches", () => {
    expect(matchVocabularyValue("lost", stages)).toBe("lost");
    expect(matchVocabularyValue("Unknown Stage", stages)).toBe("Unknown Stage");
  });

  it("returns raw value for empty config array", () => {
    expect(matchVocabularyValue("lead", [])).toBe("lead");
  });
});
