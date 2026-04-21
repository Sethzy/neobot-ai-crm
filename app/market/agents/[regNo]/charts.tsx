/** Client chart section for agent profile page. */
"use client";

import { ActivityHeatmap } from "@/components/property/charts/activity-heatmap";
import { TopNeighbourhoods } from "@/components/property/charts/top-neighbourhoods";
import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";

type BreakdownEntry = { label: string; count: number };
type TransactionLocation = { town: string | null; district: string | null };

type AgentProfileChartsProps = {
  dates: (string | null)[];
  propertyTypeBreakdown: BreakdownEntry[];
  transactionTypeBreakdown: BreakdownEntry[];
  salesRepBreakdown: BreakdownEntry[];
  rentalRepBreakdown: BreakdownEntry[];
  transactions: TransactionLocation[];
};

export function AgentProfileCharts({
  dates,
  propertyTypeBreakdown,
  transactionTypeBreakdown,
  salesRepBreakdown,
  rentalRepBreakdown,
  transactions,
}: AgentProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasHeatmap = dates.some(Boolean);
  const hasPropertyType = propertyTypeBreakdown.length > 0;
  const hasTransactionType = transactionTypeBreakdown.length > 0;
  const hasSalesRep = salesRepBreakdown.length > 0;
  const hasRentalRep = rentalRepBreakdown.length > 0;
  const hasTopNeighbourhoods = transactions.length > 0;

  if (
    !hasVolume &&
    !hasHeatmap &&
    !hasPropertyType &&
    !hasTransactionType &&
    !hasSalesRep &&
    !hasRentalRep &&
    !hasTopNeighbourhoods
  ) {
    return null;
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Activity Overview */}
      {(hasVolume || hasHeatmap) ? (
        <>
          <p className="type-kicker text-muted-foreground/80">Activity Overview</p>
          {hasVolume ? (
            <TransactionVolumeChart dates={dates} subtitle="Volume of sales over time" />
          ) : null}
        </>
      ) : null}

      {(hasHeatmap || hasPropertyType) ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {hasHeatmap ? <ActivityHeatmap dates={dates} /> : null}
          {hasPropertyType ? (
            <TypeBreakdownChart title="Property Type" data={propertyTypeBreakdown} />
          ) : null}
        </div>
      ) : null}

      {/* Transaction Breakdown */}
      {(hasTransactionType || hasSalesRep || hasRentalRep) ? (
        <>
          <p className="type-kicker text-muted-foreground/80">Transaction Breakdown</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {hasTransactionType ? (
              <TypeBreakdownChart title="Transaction Type" data={transactionTypeBreakdown} />
            ) : null}
            {hasSalesRep ? (
              <TypeBreakdownChart title="Sales Representation" data={salesRepBreakdown} />
            ) : null}
            {hasRentalRep ? (
              <TypeBreakdownChart title="Rental Representation" data={rentalRepBreakdown} />
            ) : null}
          </div>
        </>
      ) : null}

      {/* Geography */}
      {hasTopNeighbourhoods ? (
        <>
          <p className="type-kicker text-muted-foreground/80">Geography</p>
          <TopNeighbourhoods transactions={transactions} />
        </>
      ) : null}
    </div>
  );
}
