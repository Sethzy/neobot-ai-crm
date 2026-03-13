/**
 * json-render component registry for agent-generated inline views.
 * @module lib/views/registry
 */
"use client";

import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";

import {
  BarChartPanel,
  DonutChartPanel,
  FunnelChartPanel,
  LineChartPanel,
} from "@/components/views/chart-panels";
import { ContactCard } from "@/components/views/contact-card";
import { DealCard } from "@/components/views/deal-card";
import { StatMetric } from "@/components/views/stat-metric";
import { TaskItem } from "@/components/views/task-item";
import { catalog } from "@/lib/views/catalog";

/** Convert all `null` values in an object to `undefined` so catalog nullable fields match component optional props. */
function nullToUndefined<T extends Record<string, unknown>>(obj: T) {
  const result = {} as { [K in keyof T]: Exclude<T[K], null> | (null extends T[K] ? undefined : never) };
  for (const key in obj) {
    (result as Record<string, unknown>)[key] = obj[key] ?? undefined;
  }
  return result;
}

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    Tabs: shadcnComponents.Tabs,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Table: shadcnComponents.Table,
    StatMetric: ({ props }) => <StatMetric {...nullToUndefined(props)} />,
    DealCard: ({ props }) => <DealCard {...nullToUndefined(props)} />,
    ContactCard: ({ props }) => <ContactCard {...nullToUndefined(props)} />,
    TaskItem: ({ props }) => <TaskItem {...nullToUndefined(props)} />,
    BarChartPanel: ({ props }) => <BarChartPanel {...nullToUndefined(props)} />,
    DonutChartPanel: ({ props }) => <DonutChartPanel {...nullToUndefined(props)} />,
    FunnelChartPanel: ({ props }) => <FunnelChartPanel {...nullToUndefined(props)} />,
    LineChartPanel: ({ props }) => <LineChartPanel {...nullToUndefined(props)} />,
  },
});
