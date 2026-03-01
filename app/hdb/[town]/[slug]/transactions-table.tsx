/** Client-side paginated transactions table for HDB street profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  toNumber,
} from "@/lib/property/utils";

type HdbRow = {
  month: string | null;
  flat_type: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  resale_price: number | string | null;
};

export function HdbTransactionsTableClient({
  transactions,
}: {
  transactions: HdbRow[];
}) {
  return (
    <PaginatedTable
      data={transactions}
      title="Recent HDB Resale Transactions"
      emptyMessage="No transaction records found."
      keyFn={(row, i) => `${row.month}-${i}`}
      columns={[
        {
          header: "Month",
          cell: (row) => formatDateMonthYear(row.month),
        },
        {
          header: "Flat Type",
          cell: (row) => row.flat_type ?? "N/A",
        },
        {
          header: "Storey Range",
          cell: (row) => row.storey_range ?? "N/A",
        },
        {
          header: "Floor Area (sqm)",
          cell: (row) => formatCount(toNumber(row.floor_area_sqm) ?? 0),
        },
        {
          header: "Resale Price",
          cell: (row) => formatCurrencySgd(toNumber(row.resale_price)),
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-zinc-900">
              {formatCurrencySgd(toNumber(row.resale_price))}
            </span>
            <span className="text-xs text-zinc-500">
              {formatDateMonthYear(row.month)}
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            {row.flat_type ?? "N/A"} · {row.storey_range ?? "N/A"}
          </p>
          <p className="text-xs text-zinc-500">
            {formatCount(toNumber(row.floor_area_sqm) ?? 0)} sqm
          </p>
        </div>
      )}
    />
  );
}
