"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";

type AgencyProfileChartsProps = {
  dates: (string | null)[];
};

export function AgencyProfileCharts({ dates }: AgencyProfileChartsProps) {
  if (dates.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <TransactionVolumeChart
        dates={dates}
        subtitle="Volume of sales over time"
      />
    </div>
  );
}
