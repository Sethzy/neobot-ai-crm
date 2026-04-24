/** Client-only lazy wrapper for the agent profile charts. */
"use client";

import dynamic from "next/dynamic";

import type { AgentProfileChartsProps } from "./charts";

const AgentProfileCharts = dynamic(
  () => import("./charts").then((module) => module.AgentProfileCharts),
  { ssr: false },
);

export function AgentProfileChartsClient(props: AgentProfileChartsProps) {
  return <AgentProfileCharts {...props} />;
}
