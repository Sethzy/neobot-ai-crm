/** Client-only lazy wrapper for the property profile charts. */
"use client";

import dynamic from "next/dynamic";

import type { PropertyProfileChartsProps } from "./charts";

const PropertyProfileCharts = dynamic(
  () => import("./charts").then((module) => module.PropertyProfileCharts),
  { ssr: false },
);

export function PropertyProfileChartsClient(
  props: PropertyProfileChartsProps,
) {
  return <PropertyProfileCharts {...props} />;
}
