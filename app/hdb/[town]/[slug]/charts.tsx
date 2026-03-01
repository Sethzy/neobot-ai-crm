/** Client chart section for HDB street profile page. */
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { PriceTrendChart } from "@/components/property/charts/price-trend-chart";

type HdbProfileChartsProps = {
  dates: (string | null)[];
  flatTypeBreakdown: Array<{ label: string; count: number }>;
  pricePoints: Array<{ date: string | null; value: number | null }>;
};

export function HdbProfileCharts({
  dates,
  flatTypeBreakdown,
  pricePoints,
}: HdbProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = flatTypeBreakdown.length > 0;
  const hasPrice = pricePoints.filter((p) => p.date && p.value !== null).length >= 2;

  if (!hasVolume && !hasBreakdown && !hasPrice) return null;

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {hasVolume ? <TransactionVolumeChart dates={dates} /> : null}
        {hasBreakdown ? (
          <TypeBreakdownChart title="Flat Type" data={flatTypeBreakdown} />
        ) : null}
      </div>
      {hasPrice ? (
        <PriceTrendChart
          title="Resale Price Trend (Quarterly Median)"
          points={pricePoints}
          valueLabel="Median Price"
        />
      ) : null}
    </div>
  );
}
