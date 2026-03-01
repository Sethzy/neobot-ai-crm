/** Client chart section for property profile page. */
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { PriceTrendChart } from "@/components/property/charts/price-trend-chart";

type PropertyProfileChartsProps = {
  dates: (string | null)[];
  saleTypeBreakdown: Array<{ label: string; count: number }>;
  psfPoints: Array<{ date: string | null; value: number | null }>;
};

export function PropertyProfileCharts({
  dates,
  saleTypeBreakdown,
  psfPoints,
}: PropertyProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = saleTypeBreakdown.length > 0;
  const hasPsf = psfPoints.filter((p) => p.date && p.value !== null).length >= 2;

  if (!hasVolume && !hasBreakdown && !hasPsf) return null;

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {hasVolume ? <TransactionVolumeChart dates={dates} /> : null}
        {hasBreakdown ? (
          <TypeBreakdownChart title="Sale Type" data={saleTypeBreakdown} />
        ) : null}
      </div>
      {hasPsf ? (
        <PriceTrendChart
          title="PSF Trend (Quarterly Median)"
          points={psfPoints}
          valueLabel="Median PSF"
        />
      ) : null}
    </div>
  );
}
