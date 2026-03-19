/** Client-side paginated transactions table for agent profile. */
"use client";

import type { ReactNode } from "react";
import { PaginatedTable } from "@/components/property/paginated-table";
import {
  MARKET_REPRESENTED_TONE_CLASSES,
  MARKET_TRANSACTION_TYPE_TONE_CLASSES,
} from "@/lib/ui/color-maps";
import {
  formatAreaName,
  formatDateMonthYear,
  formatEnumLabel,
  formatPropertyType,
} from "@/lib/property/utils";

type AgentTransaction = {
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
  represented: string | null;
  town: string | null;
  district: string | null;
  general_location: string | null;
};

function Badge({ label, colorMap }: { label: string | null; colorMap: Record<string, string> }): ReactNode {
  const formatted = formatEnumLabel(label);
  const colors = colorMap[formatted] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {formatted}
    </span>
  );
}

export function AgentTransactionsTableClient({
  transactions,
}: {
  transactions: AgentTransaction[];
}) {
  return (
    <PaginatedTable
      data={transactions}
      title="Recent Transactions"
      emptyMessage="No transaction records are available for this registration number."
      keyFn={(row, i) => `${row.transaction_date}-${i}`}
      columns={[
        {
          header: "Date",
          cell: (row) => formatDateMonthYear(row.transaction_date),
        },
        {
          header: "Property Type",
          cell: (row) => formatPropertyType(row.property_type),
        },
        {
          header: "Transaction Type",
          cell: (row) => (
            <Badge
              label={row.transaction_type}
              colorMap={MARKET_TRANSACTION_TYPE_TONE_CLASSES}
            />
          ),
        },
        {
          header: "Area",
          cell: (row) =>
            formatAreaName(row.general_location ?? row.town ?? row.district),
        },
        {
          header: "Represented",
          cell: (row) => (
            <Badge
              label={row.represented}
              colorMap={MARKET_REPRESENTED_TONE_CLASSES}
            />
          ),
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="space-y-1 px-4 py-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-foreground">
              {formatDateMonthYear(row.transaction_date)}
            </span>
            <Badge
              label={row.represented}
              colorMap={MARKET_REPRESENTED_TONE_CLASSES}
            />
          </div>
          <p className="text-sm text-muted-foreground">{formatPropertyType(row.property_type)}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatAreaName(row.general_location ?? row.town ?? row.district)}</span>
            <Badge
              label={row.transaction_type}
              colorMap={MARKET_TRANSACTION_TYPE_TONE_CLASSES}
            />
          </div>
        </div>
      )}
    />
  );
}
