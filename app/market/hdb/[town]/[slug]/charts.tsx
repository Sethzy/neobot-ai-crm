/** Client chart section for HDB street profile page. */
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { PriceTrendChart } from "@/components/property/charts/price-trend-chart";
import { FloorPremiumChart } from "@/components/property/charts/floor-premium-chart";

type HdbProfileChartsProps = {
  dates: (string | null)[];
  flatTypeBreakdown: Array<{ label: string; count: number }>;
  pricePoints: Array<{ date: string | null; value: number | null }>;
  storeyPsfPoints: Array<{ floor: number; psf: number }>;
};

export function HdbProfileCharts({
  dates,
  flatTypeBreakdown,
  pricePoints,
  storeyPsfPoints,
}: HdbProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = flatTypeBreakdown.length > 0;
  const hasPrice = pricePoints.filter((p) => p.date && p.value !== null).length >= 2;
  const hasFloor = storeyPsfPoints.length >= 3;

  if (!hasVolume && !hasBreakdown && !hasPrice && !hasFloor) return null;

  return (
    <div className="mt-8 space-y-6">
      {hasVolume ? (
        <TransactionVolumeChart
          dates={dates}
          subtitle="HDB resale transactions over time"
        />
      ) : null}
      {hasPrice ? (
        <PriceTrendChart
          title="Resale Price Trend (Quarterly Median)"
          points={pricePoints}
          valueLabel="Median Price"
        />
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {hasFloor ? <FloorPremiumChart data={storeyPsfPoints} /> : null}
        {hasBreakdown ? (
          <TypeBreakdownChart title="Flat Type" data={flatTypeBreakdown} />
        ) : null}
      </div>
    </div>
  );
}
