/**
 * Tests for platform-instructions assembly.
 * @module lib/ai/__tests__/platform-instructions
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { buildPlatformInstructions } from "../platform-instructions";

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
