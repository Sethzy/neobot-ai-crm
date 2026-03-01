/** Client chart section for agent profile page. */
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";

type AgentProfileChartsProps = {
  dates: (string | null)[];
  propertyTypeBreakdown: Array<{ label: string; count: number }>;
};

export function AgentProfileCharts({
  dates,
  propertyTypeBreakdown,
}: AgentProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = propertyTypeBreakdown.length > 0;

  if (!hasVolume && !hasBreakdown) return null;

  return (
    <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-2">
      {hasVolume ? <TransactionVolumeChart dates={dates} /> : null}
      {hasBreakdown ? (
        <TypeBreakdownChart title="Property Type" data={propertyTypeBreakdown} />
      ) : null}
    </div>
  );
}
