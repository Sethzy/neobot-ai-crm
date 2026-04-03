/**
 * Tests for platform-instructions assembly.
 * @module lib/ai/__tests__/platform-instructions
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import type { FieldDefinition } from "@/lib/crm/field-definitions";

import {
  buildPlatformInstructions,
  formatFieldDefinitions,
  formatFieldDefinitionsForSchemaTool,
} from "../platform-instructions";

describe("formatFieldDefinitions", () => {
  it("formats a basic visible editable text field with label and type only", () => {
    const fields: FieldDefinition[] = [
      {
        key: "name",
        label: "Name",
        type: "text",
        source: "column",
        tier: "indestructible",
        visible: true,
        order: 0,
        editable: true,
        required: true,
      },
    ];

    expect(formatFieldDefinitions(fields)).toBe("Name (text, required)");
  });

  it("omits keys from the passive prompt formatter", () => {
    const fields: FieldDefinition[] = [
      {
        key: "emails",
        label: "Email",
        type: "email",
        source: "column",
        tier: "default",
        visible: true,
        order: 0,
        editable: true,
        required: false,
      },
    ];

    expect(formatFieldDefinitions(fields)).toBe("Email (email)");
  });
});

describe("formatFieldDefinitionsForSchemaTool", () => {
  it("includes keys for explicit schema inspection", () => {
    const fields: FieldDefinition[] = [
      {
        key: "emails",
        label: "Email",
        type: "email",
        source: "column",
        tier: "default",
        visible: true,
        order: 0,
        editable: true,
        required: false,
      },
    ];

    expect(formatFieldDefinitionsForSchemaTool(fields)).toBe("emails — Email (email)");
  });
});

describe("buildPlatformInstructions", () => {
  it("appends the CRM vocabulary block to the base platform instructions", () => {
    const instructions = buildPlatformInstructions({
      ...CRM_DEFAULTS,
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
    });

    expect(instructions).toContain("<platform-instructions>");
    expect(instructions).toContain("<crm-vocabulary>");
    expect(instructions).toContain("Deal label: Policy");
    expect(instructions).toContain("Deal stages: lead, quoted, bound");
  });

  it("does not include context-management truncation instructions (removed for cache stability)", () => {
    const instructions = buildPlatformInstructions();

    expect(instructions).not.toContain("<context-management>");
    expect(instructions).not.toContain("Data truncated:");
    expect(instructions).not.toContain("<context-removed>");
  });

  it("escapes config-derived values before injecting them into XML-like instructions", () => {
    const instructions = buildPlatformInstructions({
      ...CRM_DEFAULTS,
      deal_label: `Policy & Claim <Case>`,
      deal_custom_fields: [
        {
          key: "coverage_amount",
          label: `Coverage "Amount"`,
          type: "currency",
          required: true,
        },
        {
          key: "line",
          label: "Line of Business",
          type: "select",
          options: ["Life & Health", "Property <General>"],
          required: false,
        },
      ],
    });

    expect(instructions).toContain("Policy &amp; Claim &lt;Case&gt;");
    expect(instructions).toContain("Coverage &quot;Amount&quot;");
    expect(instructions).toContain("Life &amp; Health");
    expect(instructions).toContain("Property &lt;General&gt;");
    expect(instructions).not.toContain(`Policy & Claim <Case>`);
  });

  it("includes field definitions for all three CRM entities", () => {
    const instructions = buildPlatformInstructions(CRM_DEFAULTS);

    expect(instructions).toContain("Contact fields:");
    expect(instructions).toContain("Company fields:");
    expect(instructions).toContain("Deal fields:");
    expect(instructions).toContain("Name (full_name, required, read-only)");
  });

  it("shows relation fields with target entity", () => {
    const instructions = buildPlatformInstructions(CRM_DEFAULTS);

    expect(instructions).toContain("Company (relation → companies)");
  });

  it("shows hidden fields with [hidden] marker", () => {
    const instructions = buildPlatformInstructions(CRM_DEFAULTS);

    expect(instructions).toContain("City (text) [hidden]");
  });

  it("falls back to CRM defaults when callers pass a partial runtime config", () => {
    const instructions = buildPlatformInstructions({
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
      contact_types: ["prospect", "policy_holder"],
      interaction_types: ["call", "email"],
      deal_contact_roles: ["insured", "owner"],
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    });

    expect(instructions).toContain("<crm-vocabulary>");
    expect(instructions).toContain("Deal label: Policy");
    expect(instructions).toContain(`Company label: ${CRM_DEFAULTS.company_label}`);
    expect(instructions).toContain(
      `Company industries: ${CRM_DEFAULTS.company_industries.join(", ")}`,
    );
    expect(instructions).toContain("Company custom fields: none");
  });

  it("uses /agent/ prefixes for state paths", () => {
    const instructions = buildPlatformInstructions();

    expect(instructions).toContain("/agent/state/");
    expect(instructions).toContain("/agent/state/draft-email.md");
    expect(instructions).toContain("/agent/state/research-notes.md");
  });
});
