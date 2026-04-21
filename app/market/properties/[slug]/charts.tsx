/** Client chart section for property profile page. */
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { PriceTrendChart } from "@/components/property/charts/price-trend-chart";
import { FloorPremiumChart } from "@/components/property/charts/floor-premium-chart";

type PropertyProfileChartsProps = {
  dates: (string | null)[];
  saleTypeBreakdown: Array<{ label: string; count: number }>;
  psfPoints: Array<{ date: string | null; value: number | null }>;
  floorPsfPoints: Array<{ floor: number; psf: number }>;
};

export function PropertyProfileCharts({
  dates,
  saleTypeBreakdown,
  psfPoints,
  floorPsfPoints,
}: PropertyProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = saleTypeBreakdown.length > 0;
  const hasPsf = psfPoints.filter((p) => p.date && p.value !== null).length >= 2;
  const hasFloorData = floorPsfPoints.length >= 5;

  if (!hasVolume && !hasBreakdown && !hasPsf) return null;

  return (
    <div className="mt-8 space-y-6">
      {/* Activity Overview */}
      {hasVolume ? (
        <>
          <p className="type-kicker text-muted-foreground/80">Activity Overview</p>
          <TransactionVolumeChart dates={dates} subtitle="Volume of sales over time" />
        </>
      ) : null}

      {/* Price Analysis */}
      {(hasPsf || hasFloorData) ? (
        <>
          <p className="type-kicker text-muted-foreground/80">Price Analysis</p>
          {hasPsf ? (
            <PriceTrendChart
              title="Price Trend"
              subtitle="Min, Median, and Max unit price (PSF) over time"
              points={psfPoints}
              valueLabel="Median PSF"
            />
          ) : null}
        </>
      ) : null}

      {(hasFloorData || hasBreakdown) ? (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {hasFloorData ? <FloorPremiumChart data={floorPsfPoints} /> : null}
          {hasBreakdown ? (
            <TypeBreakdownChart title="Type of Sale" data={saleTypeBreakdown} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
