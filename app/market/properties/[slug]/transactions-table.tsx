/** Client-side paginated transactions table for property profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
import {
  formatAreaSqft,
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
  street: string | null;
  market_segment: string | null;
};

function saleTypeBadgeClass(type: string | null): string {
  if (type === "New Sale") return "bg-emerald-100 text-emerald-800";
  if (type === "Sub Sale") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

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
          header: "Sale Date",
          cell: (row) => formatDateMonthYear(row.contract_date),
        },
        {
          header: "Address",
          cell: (row) => row.street ?? "N/A",
        },
        {
          header: "Floor",
          cell: (row) => row.floor_range ?? "N/A",
          className: "px-4 py-4 text-sm text-zinc-600 whitespace-nowrap",
        },
        {
          header: "Price",
          cell: (row) => formatCurrencySgd(toNumber(row.price)),
        },
        {
          header: "Area (sqft)",
          cell: (row) => formatAreaSqft(toNumber(row.area_sqm)),
        },
        {
          header: "PSF",
          cell: (row) => formatCurrencySgd(toNumber(row.price_psf)),
        },
        {
          header: "Type",
          cell: (row) => (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${saleTypeBadgeClass(
                row.type_of_sale
              )}`}
            >
              {row.type_of_sale ?? "N/A"}
            </span>
          ),
        },
      ]}
      mobileCardRenderer={(row) => {
        const price = toNumber(row.price);
        const psf = toNumber(row.price_psf);
        const area = toNumber(row.area_sqm);
        return (
          <div className="space-y-1 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900">
                {formatCurrencySgd(price)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${saleTypeBadgeClass(
                  row.type_of_sale
                )}`}
              >
                {row.type_of_sale ?? "N/A"}
              </span>
            </div>
            <p className="text-sm text-zinc-600">
              {row.street ?? "N/A"} · {row.floor_range ?? "N/A"}
            </p>
            <p className="text-xs text-zinc-500">
              PSF: {formatCurrencySgd(psf)} · {formatAreaSqft(area)} sqft ·{" "}
              {formatDateMonthYear(row.contract_date)}
            </p>
          </div>
        );
      }}
    />
  );
}
