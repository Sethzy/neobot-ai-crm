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
      company_label: 'Brokerage <Firm>',
      deal_stages: ["lead & quoted", "bound"],
      contact_types: ['buyer "vip"', "insured"],
      company_industries: ["property_agency", 'law_firm "partner"'],
      deal_custom_fields: [
        {
          key: "coverage_amount",
          label: 'Coverage "Amount"',
          type: "currency",
          required: true,
        },
      ],
      company_custom_fields: [
        {
          key: "tier",
          label: 'Tier "Band"',
          type: "select",
          options: ["a", "b"],
        },
      ],
    });

    expect(result).toContain("<crm-vocabulary>");
    expect(result).toContain("Policy &lt;Line&gt;");
    expect(result).toContain("Brokerage &lt;Firm&gt;");
    expect(result).toContain("lead &amp; quoted");
    expect(result).toContain("buyer &quot;vip&quot;");
    expect(result).toContain("law_firm &quot;partner&quot;");
    expect(result).toContain("Coverage &quot;Amount&quot;");
    expect(result).toContain("Tier &quot;Band&quot;");
  });
});
