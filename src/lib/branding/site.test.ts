import { describe, expect, it } from "vitest";

import { siteBrand } from "./site";

describe("siteBrand", () => {
  it("exports the current Sunder marketing metadata", () => {
    expect(siteBrand.name).toBe("Sunder");
    expect(siteBrand.assistantName).toBe("Sunder");
    expect(siteBrand.siteUrl).toBe("https://www.trysunder.com");
    expect(siteBrand.ogImageUrl).toBe("https://www.trysunder.com/exports/og-image.png");
    expect(siteBrand.marketingTitle).toContain(siteBrand.name);
    expect(siteBrand.marketingTitle).not.toContain("Neo");
    expect(siteBrand.marketingDescription).not.toContain("document processing");
    expect(siteBrand.supportEmail).toBe("hello@trysunder.com");
  });
});
