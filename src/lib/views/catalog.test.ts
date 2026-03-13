/**
 * Tests for the json-render catalog used by agent-generated views.
 * @module lib/views/catalog.test
 */
import { describe, expect, it } from "vitest";

import { ALLOWED_COMPONENT_TYPES, catalog } from "./catalog";

/** Custom component names (not from shadcn). These must have `example` fields. */
const CUSTOM_COMPONENT_NAMES = [
  "StatMetric",
  "DealCard",
  "ContactCard",
  "TaskItem",
  "BarChartPanel",
  "DonutChartPanel",
  "FunnelChartPanel",
  "LineChartPanel",
];

describe("view catalog", () => {
  it("exposes only the approved component allowlist", () => {
    expect(ALLOWED_COMPONENT_TYPES).toBeInstanceOf(Set);
    expect(ALLOWED_COMPONENT_TYPES.has("Card")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("StatMetric")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("BarChartPanel")).toBe(true);
    expect(ALLOWED_COMPONENT_TYPES.has("Dialog")).toBe(false);
    expect(ALLOWED_COMPONENT_TYPES.has("Chart")).toBe(false);
  });

  it("every custom component has a non-empty example object", () => {
    const components = (catalog.data as { components: Record<string, { example?: unknown }> }).components;
    for (const name of CUSTOM_COMPONENT_NAMES) {
      const def = components[name];
      expect(def, `${name} missing from catalog`).toBeDefined();
      expect(def.example, `${name} missing example`).toBeDefined();
      expect(typeof def.example, `${name} example should be an object`).toBe("object");
      expect(Object.keys(def.example as Record<string, unknown>).length, `${name} example should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("catalog.prompt({ mode: 'inline' }) returns a string containing component names", () => {
    const prompt = catalog.prompt({ mode: "inline" });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("StatMetric");
    expect(prompt).toContain("DealCard");
    expect(prompt).toContain("BarChartPanel");
    expect(prompt).toContain("LineChartPanel");
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
