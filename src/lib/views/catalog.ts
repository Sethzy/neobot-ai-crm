/**
 * Shared json-render catalog for agent-generated CRM views.
 * @module lib/views/catalog
 */
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

const allowedComponentTypes = [
  "Card",
  "Grid",
  "Tabs",
  "Text",
  "Badge",
  "Table",
  "StatMetric",
  "DealCard",
  "ContactCard",
  "TaskItem",
  "BarChartPanel",
  "DonutChartPanel",
  "FunnelChartPanel",
] as const;

const viewCatalogRules = [
  "Use only the allowed components from this catalog.",
  "For repeated rows, boards, and cards, prefer repeat + $item over one element per record.",
  "Use $state for read-only bindings into pre-computed state.",
  "Charts are snapshot-only in PR42a. Use compact aggregated data and do not imply refresh, filters, pinning, or live dashboards.",
  "Keep the full serialized show_view result under about 4KB.",
] as const;

/** Explicit runtime allowlist used for ergonomic error messages and tests. */
export const ALLOWED_COMPONENT_TYPES = new Set<string>(allowedComponentTypes);

const chartDataSchema = z.array(
  z.record(z.string(), z.union([z.string(), z.number()])),
);

export const catalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Grid: shadcnComponentDefinitions.Grid,
    Tabs: shadcnComponentDefinitions.Tabs,
    Text: shadcnComponentDefinitions.Text,
    Badge: shadcnComponentDefinitions.Badge,
    Table: shadcnComponentDefinitions.Table,
    StatMetric: {
      props: z.object({
        label: z.string().min(1),
        value: z.union([z.string(), z.number()]),
        trend: z.enum(["up", "down", "flat"]).optional(),
      }),
      slots: [],
      description:
        "Compact metric tile for a headline CRM number. Use a resolved value or a $state binding on the value prop.",
    },
    DealCard: {
      props: z.object({
        address: z.string().min(1),
        price: z.string().min(1),
        stage: z.string().min(1).optional(),
      }),
      slots: [],
      description:
        "Compact CRM deal card with address, formatted price, and optional stage badge.",
    },
    ContactCard: {
      props: z.object({
        name: z.string().min(1),
        type: z.string().min(1).optional(),
        subtitle: z.string().min(1).optional(),
      }),
      slots: [],
      description:
        "Compact CRM contact card with name, optional type badge, and optional subtitle.",
    },
    TaskItem: {
      props: z.object({
        title: z.string().min(1),
        dueDate: z.string().min(1).optional(),
        status: z.enum(["open", "completed"]).optional(),
        contactName: z.string().min(1).optional(),
        dealAddress: z.string().min(1).optional(),
      }),
      slots: [],
      description:
        "Single CRM task row with title, due date, status, and optional contact or deal context.",
    },
    BarChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).optional(),
        insight: z.string().min(1).optional(),
        data: chartDataSchema,
        xKey: z.string().min(1),
        yKey: z.string().min(1),
      }),
      slots: [],
      description:
        "Compact snapshot bar chart panel for aggregated category comparisons. Use compact aggregated rows only.",
    },
    DonutChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).optional(),
        insight: z.string().min(1).optional(),
        data: chartDataSchema,
        nameKey: z.string().min(1),
        valueKey: z.string().min(1),
        centerLabel: z.string().min(1).optional(),
      }),
      slots: [],
      description:
        "Compact snapshot donut chart panel for aggregated share or distribution views.",
    },
    FunnelChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).optional(),
        insight: z.string().min(1).optional(),
        data: chartDataSchema,
        nameKey: z.string().min(1),
        valueKey: z.string().min(1),
        footerText: z.string().min(1).optional(),
      }),
      slots: [],
      description:
        "Compact snapshot funnel chart panel for ordered aggregated stage progressions.",
    },
  },
  actions: {},
});

/** Builds prompt guidance from the same catalog contract enforced at runtime. */
export function getViewCatalogPrompt() {
  return [
    `Allowed components: ${allowedComponentTypes.join(", ")}.`,
    ...viewCatalogRules,
  ].join("\n");
}
