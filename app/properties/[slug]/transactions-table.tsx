/** Client-side paginated transactions table for property profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
import {
  formatCount,
  formatCurrencySgd,
  formatDateMonthYear,
  toNumber,
} from "@/lib/property/utils";

type UraTransactionRow = {
  contract_date: string | null;
  price: number | string | null;
  price_psf: number | string | null;
  area_sqm: number | string | null;
  floor_range: string | null;
  type_of_sale: string | null;
  property_type: string | null;
  tenure: string | null;
  no_of_units: number | null;
};

export function PropertyTransactionsTableClient({
  transactions,
}: {
  transactions: UraTransactionRow[];
}) {
  return (
    <PaginatedTable
      data={transactions}
      title="Recent Transactions"
      emptyMessage="No transaction records are available for this project."
      keyFn={(row, i) => `${row.contract_date}-${i}`}
      columns={[
        {
          header: "Date",
          cell: (row) => formatDateMonthYear(row.contract_date),
        },
        {
          header: "Price",
          cell: (row) => formatCurrencySgd(toNumber(row.price)),
        },
        {
          header: "PSF",
          cell: (row) => formatCurrencySgd(toNumber(row.price_psf)),
        },
        {
          header: "Area (sqm)",
          cell: (row) => formatCount(toNumber(row.area_sqm) ?? 0),
        },
        {
          header: "Type",
          cell: (row) => row.property_type ?? "N/A",
        },
        {
          header: "Sale Type",
          cell: (row) => row.type_of_sale ?? "N/A",
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-zinc-900">
              {formatCurrencySgd(toNumber(row.price))}
            </span>
            <span className="text-xs text-zinc-500">
              {formatDateMonthYear(row.contract_date)}
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            PSF: {formatCurrencySgd(toNumber(row.price_psf))} · {formatCount(toNumber(row.area_sqm) ?? 0)} sqm
          </p>
          <p className="text-xs text-zinc-500">
            {row.property_type ?? "N/A"} · {row.type_of_sale ?? "N/A"}
          </p>
        </div>
      )}
    />
  );
}
