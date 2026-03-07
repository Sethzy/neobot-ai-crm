/**
 * Tests for dynamic CRM vocabulary injection in platform instructions.
 * @module lib/ai/__tests__/platform-instructions-configurable
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { buildPlatformInstructions } from "../platform-instructions";

describe("buildPlatformInstructions", () => {
  it("injects CRM vocabulary and escapes config-derived values", () => {
    const result = buildPlatformInstructions({
      ...CRM_DEFAULTS,
      deal_label: 'Policy <Line>',
      deal_stages: ["lead & quoted", "bound"],
      contact_types: ['buyer "vip"', "insured"],
      deal_custom_fields: [
        {
          key: "coverage_amount",
          label: 'Coverage "Amount"',
          type: "currency",
          required: true,
        },
      ],
    });

    expect(result).toContain("<crm-vocabulary>");
    expect(result).toContain("Policy &lt;Line&gt;");
    expect(result).toContain("lead &amp; quoted");
    expect(result).toContain("buyer &quot;vip&quot;");
    expect(result).toContain("Coverage &quot;Amount&quot;");
  });
});
