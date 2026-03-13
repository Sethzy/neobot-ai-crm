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

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    Tabs: shadcnComponents.Tabs,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Table: shadcnComponents.Table,
    StatMetric: ({ props }) => <StatMetric {...props} />,
    DealCard: ({ props }) => <DealCard {...props} />,
    ContactCard: ({ props }) => <ContactCard {...props} />,
    TaskItem: ({ props }) => <TaskItem {...props} />,
    BarChartPanel: ({ props }) => <BarChartPanel {...props} />,
    DonutChartPanel: ({ props }) => <DonutChartPanel {...props} />,
    FunnelChartPanel: ({ props }) => <FunnelChartPanel {...props} />,
    LineChartPanel: ({ props }) => <LineChartPanel {...props} />,
  },
});
