/**
 * Tests for the show_view tool contract.
 * @module lib/runner/tools/views/show-view.test
 */
import { describe, expect, it } from "vitest";

import { createViewTools } from "./index";

const executeOptions = {
  toolCallId: "tool-call-1",
  messages: [],
  abortSignal: new AbortController().signal,
};

describe("show_view tool", () => {
  it("returns success with a valid spec and state", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
          root: "metric",
          elements: {
            metric: {
              type: "StatMetric",
              props: { label: "Deals", value: 29 },
              children: [],
            },
          },
        },
        state: { stats: { deals: 29 } },
      },
      executeOptions,
    );

    expect(result).toMatchObject({ success: true });
    expect(result.spec.root).toBe("metric");
  });

  it("rejects unsupported component types", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
          root: "dialog",
          elements: {
            dialog: {
              type: "Dialog",
              props: {},
              children: [],
            },
          },
        },
        state: {},
      },
      executeOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Dialog");
  });

  it("rejects malformed specs that fail catalog validation", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
          root: "missing",
          elements: {},
        },
        state: {},
      },
      executeOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid view spec");
  });

  it("accepts compact repeat-based specs for repeated records", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
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
        },
        state: {
          deals: [
            { id: "1", address: "10 Market Street", price: "$1.2M", stage: "leads" },
            { id: "2", address: "22 River Valley Road", price: "$980K", stage: "offer" },
          ],
        },
      },
      executeOptions,
    );

    expect(result.success).toBe(true);
  });

  it("rejects chart payloads with more than 8 data points", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
          root: "chart",
          elements: {
            chart: {
              type: "BarChartPanel",
              props: {
                title: "Pipeline by source",
                data: Array.from({ length: 9 }, (_, index) => ({
                  source: `Source ${index + 1}`,
                  count: index + 1,
                })),
                xKey: "source",
                yKey: "count",
              },
              children: [],
            },
          },
        },
        state: {},
      },
      executeOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("8 data points");
  });

  it("rejects outputs whose serialized payload exceeds the cap", async () => {
    const tools = createViewTools();

    const result = await tools.show_view.execute(
      {
        spec: {
          root: "deal",
          elements: {
            deal: {
              type: "DealCard",
              props: {
                address: "x".repeat(4_200),
                price: "$1",
              },
              children: [],
            },
          },
        },
        state: {},
      },
      executeOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
  });
});
