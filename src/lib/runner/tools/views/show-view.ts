/**
 * show_view tool for agent-generated inline views.
 * @module lib/runner/tools/views/show-view
 */
import { tool } from "ai";
import { z } from "zod";

import { ALLOWED_COMPONENT_TYPES, catalog } from "@/lib/views/catalog";
import { serializeToolOutput } from "@/lib/runner/toolcall-artifacts";

const SHOW_VIEW_OUTPUT_SIZE_CAP_BYTES = 4_000;
const MAX_CHART_DATA_POINTS = 8;
const TEXT_ENCODER = new TextEncoder();
const snapshotChartTypes = new Set([
  "BarChartPanel",
  "DonutChartPanel",
  "FunnelChartPanel",
]);

function getUnsupportedComponentTypes(spec: unknown): string[] {
  if (typeof spec !== "object" || spec === null) {
    return [];
  }

  const elements = (spec as { elements?: unknown }).elements;
  if (typeof elements !== "object" || elements === null) {
    return [];
  }

  return Object.values(elements).flatMap((element) => {
    if (typeof element !== "object" || element === null) {
      return [];
    }

    const type = (element as { type?: unknown }).type;
    if (typeof type !== "string" || ALLOWED_COMPONENT_TYPES.has(type)) {
      return [];
    }

    return [type];
  });
}

function getStructuralSpecError(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) {
    return "Invalid view spec. Spec must be an object.";
  }

  const root = (spec as { root?: unknown }).root;
  const elements = (spec as { elements?: unknown }).elements;
  if (typeof root !== "string" || root.length === 0) {
    return "Invalid view spec. Root must be a non-empty string.";
  }

  if (typeof elements !== "object" || elements === null) {
    return "Invalid view spec. Elements must be an object.";
  }

  if (!Object.prototype.hasOwnProperty.call(elements, root)) {
    return "Invalid view spec. Root element must exist in elements.";
  }

  return null;
}

function getStateValueFromPointer(
  state: Record<string, unknown>,
  pointer: string,
): unknown {
  if (!pointer.startsWith("/")) {
    return undefined;
  }

  const segments = pointer
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.replace(/~1/g, "/").replace(/~0/g, "~"),
    );

  let current: unknown = state;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function resolveChartDataCandidate(
  value: unknown,
  state: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (
    "$state" in value &&
    typeof (value as { $state?: unknown }).$state === "string"
  ) {
    return getStateValueFromPointer(
      state,
      (value as { $state: string }).$state,
    );
  }

  return value;
}

function getChartCompactnessError(
  spec: unknown,
  state: Record<string, unknown>,
): string | null {
  if (typeof spec !== "object" || spec === null) {
    return null;
  }

  const elements = (spec as { elements?: unknown }).elements;
  if (typeof elements !== "object" || elements === null) {
    return null;
  }

  for (const [elementKey, elementValue] of Object.entries(elements)) {
    if (typeof elementValue !== "object" || elementValue === null) {
      continue;
    }

    const type = (elementValue as { type?: unknown }).type;
    if (typeof type !== "string" || !snapshotChartTypes.has(type)) {
      continue;
    }

    const props = (elementValue as { props?: unknown }).props;
    if (typeof props !== "object" || props === null) {
      continue;
    }

    const resolvedData = resolveChartDataCandidate(
      (props as { data?: unknown }).data,
      state,
    );
    if (
      Array.isArray(resolvedData) &&
      resolvedData.length > MAX_CHART_DATA_POINTS
    ) {
      return `${type} on "${elementKey}" exceeds ${MAX_CHART_DATA_POINTS} data points. Keep snapshot charts compact.`;
    }
  }

  return null;
}

export function createShowViewTool() {
  return tool({
    description:
      "Display an inline view to the user in chat after querying CRM data. " +
      "Use only these components: Card, Grid, Tabs, Text, Badge, Table, StatMetric, DealCard, ContactCard, TaskItem, BarChartPanel, DonutChartPanel, FunnelChartPanel. " +
      "For repeated rows and cards, prefer repeat + $item instead of one element per record. " +
      "Charts are snapshot-only in PR42a: use compact aggregated data, short labels, and no fake refresh, filter, pin, or live-dashboard affordances. " +
      "Keep the full serialized show_view result under about 4KB.",
    inputSchema: z.object({
      spec: z
        .unknown()
        .describe(
          "json-render view specification. Runtime validation uses the shared catalog.",
        ),
      state: z
        .record(z.string(), z.unknown())
        .describe(
          "Pre-computed data for the view. Keep chart data aggregated and compact.",
        ),
    }),
    execute: async ({ spec, state }) => {
      const structuralSpecError = getStructuralSpecError(spec);
      if (structuralSpecError) {
        return {
          success: false as const,
          error: structuralSpecError,
        };
      }

      const validationResult = catalog.validate(spec);
      if (!validationResult.success) {
        const unsupportedTypes = getUnsupportedComponentTypes(spec);
        const unsupportedTypesMessage =
          unsupportedTypes.length > 0
            ? ` Unsupported component types: ${unsupportedTypes.join(", ")}.`
            : "";

        return {
          success: false as const,
          error:
            `Invalid view spec.${unsupportedTypesMessage} ` +
            "Use only catalog-supported components and valid json-render element structures.",
        };
      }

      const chartCompactnessError = getChartCompactnessError(spec, state);
      if (chartCompactnessError) {
        return {
          success: false as const,
          error: chartCompactnessError,
        };
      }

      const successPayload = {
        success: true as const,
        spec,
        state,
      };
      const serializedPayload = serializeToolOutput(successPayload);
      const sizeBytes = serializedPayload
        ? TEXT_ENCODER.encode(serializedPayload).length
        : 0;

      if (sizeBytes > SHOW_VIEW_OUTPUT_SIZE_CAP_BYTES) {
        return {
          success: false as const,
          error:
            "View payload is too large. Prefer repeat + $item, summarize, or trim unneeded fields.",
        };
      }

      return successPayload;
    },
  });
}
