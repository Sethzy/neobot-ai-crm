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
  "LineChartPanel",
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
        trend: z.enum(["up", "down", "flat"]).nullable(),
        change: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Compact metric tile for a headline CRM number. Use a resolved value or a $state binding on the value prop. Use the optional change prop to show trend magnitude (e.g. '12%').",
      example: { label: "Active Deals", value: { $state: "/stats/activeDeals" }, trend: "up", change: "12%" },
    },
    DealCard: {
      props: z.object({
        address: z.string().min(1),
        price: z.string().min(1),
        stage: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Compact CRM deal card with address, formatted price string, and optional stage badge. The price prop must be a pre-formatted display string like \"$1,200,000\" or \"Price TBD\" — never a raw number or state pointer.",
      example: { address: "10 Market Street #12-34", price: "$1,200,000", stage: "offer" },
    },
    ContactCard: {
      props: z.object({
        name: z.string().min(1),
        type: z.string().min(1).nullable(),
        subtitle: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Compact CRM contact card with name, optional type badge, and optional subtitle.",
      example: { name: "John Tan", type: "buyer", subtitle: "Looking for 3BR in Bishan" },
    },
    TaskItem: {
      props: z.object({
        title: z.string().min(1),
        dueDate: z.string().min(1).nullable(),
        status: z.enum(["open", "completed"]).nullable(),
        contactName: z.string().min(1).nullable(),
        dealAddress: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Single CRM task row with title, due date, status, and optional contact or deal context.",
      example: { title: "Follow up with John", dueDate: "2026-03-15", status: "open", contactName: "John Tan" },
    },
    BarChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).nullable(),
        insight: z.string().min(1).nullable(),
        data: chartDataSchema,
        xKey: z.string().min(1),
        yKey: z.string().min(1),
      }),
      slots: [],
      description:
        "Compact snapshot bar chart panel for aggregated category comparisons. Use compact aggregated rows only.",
      example: {
        title: "Deals by Stage",
        data: { $state: "/charts/dealsByStage" },
        xKey: "stage",
        yKey: "count",
      },
    },
    DonutChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).nullable(),
        insight: z.string().min(1).nullable(),
        data: chartDataSchema,
        nameKey: z.string().min(1),
        valueKey: z.string().min(1),
        centerLabel: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Compact snapshot donut chart panel for aggregated share or distribution views.",
      example: {
        title: "Pipeline by Source",
        data: { $state: "/charts/pipelineBySource" },
        nameKey: "source",
        valueKey: "count",
        centerLabel: "Total",
      },
    },
    FunnelChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).nullable(),
        insight: z.string().min(1).nullable(),
        data: chartDataSchema,
        nameKey: z.string().min(1),
        valueKey: z.string().min(1),
        footerText: z.string().min(1).nullable(),
      }),
      slots: [],
      description:
        "Compact snapshot funnel chart panel for ordered aggregated stage progressions.",
      example: {
        title: "Deal Funnel",
        data: { $state: "/charts/dealFunnel" },
        nameKey: "stage",
        valueKey: "count",
      },
    },
    LineChartPanel: {
      props: z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1).nullable(),
        insight: z.string().min(1).nullable(),
        data: chartDataSchema,
        xKey: z.string().min(1),
        yKey: z.string().min(1),
        areaFill: z.boolean().nullable(),
      }),
      slots: [],
      description:
        "Compact snapshot line chart panel for time-series trends. Use areaFill for emphasis. Use compact aggregated rows only.",
      example: {
        title: "Deals Over Time",
        data: { $state: "/charts/dealsOverTime" },
        xKey: "month",
        yKey: "count",
        areaFill: true,
      },
    },
  },
  actions: {},
});
