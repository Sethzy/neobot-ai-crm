import { describe, expect, it } from "vitest";

import { siteBrand } from "./site";

describe("siteBrand", () => {
  it("exports the current NeoBot marketing metadata", () => {
    expect(siteBrand.name).toBe("NeoBot");
    expect(siteBrand.assistantName).toBe("NeoBot");
    expect(siteBrand.siteUrl).toBe("https://neobot-ai-crm.vercel.app");
    expect(siteBrand.ogImageUrl).toBe(
      "https://neobot-ai-crm.vercel.app/exports/og-image.png",
    );
    expect(siteBrand.marketingTitle).toContain(siteBrand.name);
    expect(siteBrand.marketingTitle).not.toContain("Sunder");
    expect(siteBrand.marketingDescription).not.toContain("document processing");
    expect(siteBrand.supportEmail).toBe("seth@tryneobot.com");
  });
});
