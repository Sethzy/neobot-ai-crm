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
});
