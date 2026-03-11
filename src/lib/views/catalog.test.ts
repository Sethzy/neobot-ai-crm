/**
 * Tests for the json-render catalog used by agent-generated views.
 * @module lib/views/catalog.test
 */
import { describe, expect, it } from "vitest";

import { ALLOWED_COMPONENT_TYPES, catalog, getViewCatalogPrompt } from "./catalog";

describe("view catalog", () => {
  it("exposes only the approved component allowlist", () => {
    expect(ALLOWED_COMPONENT_TYPES).toBeInstanceOf(Set);
    expect(ALLOWED_COMPONENT_TYPES.has("Card")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("StatMetric")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("BarChartPanel")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("Dialog")).toBe(false);
    expect(ALLOWED_COMPONENT_TYPES.has("Chart")).toBe(false);
  });

  it("builds prompt guidance from the catalog contract", () => {
    const prompt = getViewCatalogPrompt();

    expect(prompt).toContain("StatMetric");
    expect(prompt).toContain("DealCard");
    expect(prompt).toContain("repeat + $item");
    expect(prompt).toContain("4KB");
    expect(prompt).not.toContain("You are a UI generator");
    expect(prompt).not.toContain("JSON Patch");
    expect(prompt.length).toBeLessThan(1_500);
  });

  it("accepts a minimal spec that binds resolved state into a custom prop", () => {
    const result = catalog.validate({
      root: "metric",
      elements: {
        metric: {
          type: "StatMetric",
          props: {
            label: "Active Deals",
            value: { $state: "/stats/activeDeals" },
          },
          children: [],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts repeat-based specs for repeated records", () => {
    const result = catalog.validate({
      root: "deal-grid",
      elements: {
        "deal-grid": {
          type: "Grid",
          props: { columns: 2, gap: "md" },
          repeat: { statePath: "/deals", key: "id" },
          children: ["deal-card"],
        },
        "deal-card": {
          type: "DealCard",
          props: {
            address: { $item: "address" },
            price: { $item: "price" },
            stage: { $item: "stage" },
          },
          children: [],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects specs with unsupported component types", () => {
    const result = catalog.validate({
      root: "dialog",
      elements: {
        dialog: {
          type: "Dialog",
          props: {},
          children: [],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
