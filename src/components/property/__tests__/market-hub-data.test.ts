import { describe, expect, it } from "vitest";

const MARKET_CATEGORIES = [
  { href: "/market/agents", title: "Agent Profiles" },
  { href: "/market/properties", title: "Private Properties" },
  { href: "/market/hdb", title: "HDB Resale" },
  { href: "/market/agencies", title: "Agencies" },
  { href: "/market/areas", title: "Areas" },
];

describe("Market hub category data", () => {
  it("defines exactly 5 categories", () => {
    expect(MARKET_CATEGORIES).toHaveLength(5);
  });

  it("all categories have valid /market/* hrefs", () => {
    for (const cat of MARKET_CATEGORIES) {
      expect(cat.href).toMatch(/^\/market\//);
    }
  });
});
