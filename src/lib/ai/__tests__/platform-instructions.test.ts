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

  it("includes <context-management> instructions with recovery guidance", () => {
    const instructions = buildPlatformInstructions();

    expect(instructions).toContain("<context-management>");
    expect(instructions).toContain("</context-management>");
    expect(instructions).toContain("You MUST read the full untruncated data");
    expect(instructions).toContain("Data truncated:");
    expect(instructions).toContain("<context-removed>");
    expect(instructions).toContain("read_file");
    expect(instructions).toContain("toolcalls/");
    expect(instructions).toContain("result.json");
    expect(instructions).toContain("args.json");
    expect(instructions).toContain("trigger invocation");
    expect(instructions).toContain("Omitted");
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

  it("uses /agent/ prefixes for state and toolcall paths", () => {
    const instructions = buildPlatformInstructions();

    expect(instructions).toContain("/agent/state/");
    expect(instructions).toContain("/agent/state/draft-email.md");
    expect(instructions).toContain("/agent/state/research-notes.md");
    expect(instructions).toContain("/agent/toolcalls/");
    expect(instructions).toContain('/agent/toolcalls/{toolCallId}/result.json');
    expect(instructions).toContain('/agent/toolcalls/{toolCallId}/args.json');
  });

  it("does not contain bare state or toolcalls directory references", () => {
    const instructions = buildPlatformInstructions();

    expect(instructions.match(/(?<!\/agent\/)state\//g) ?? []).toHaveLength(0);
    expect(instructions.match(/(?<!\/agent\/)toolcalls\//g) ?? []).toHaveLength(0);
  });
});
