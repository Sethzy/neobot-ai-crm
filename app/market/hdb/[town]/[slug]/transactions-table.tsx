/** Client-side paginated transactions table for HDB street profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
import { MARKET_HDB_FLAT_TYPE_TONE_CLASSES } from "@/lib/ui/color-maps";
import {
  formatAreaSqft,
  formatCurrencySgd,
  formatDateMonthYear,
  toNumber,
} from "@/lib/property/utils";

type HdbRow = {
  month: string | null;
  flat_type: string | null;
  block: string | null;
  street_name: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  flat_model: string | null;
  lease_commence_date: number | null;
  remaining_lease: string | null;
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
          header: "Address",
          cell: (row) => {
            const block = row.block ?? "";
            const street = row.street_name ?? "";
            return block && street ? `Blk ${block} ${street}` : street || block || "N/A";
          },
        },
        {
          header: "Floor",
          cell: (row) => row.storey_range ?? "N/A",
        },
        {
          header: "Price",
          cell: (row) => formatCurrencySgd(toNumber(row.resale_price)),
        },
        {
          header: "Area",
          cell: (row) => {
            const sqm = toNumber(row.floor_area_sqm);
            return sqm ? formatAreaSqft(sqm) : "N/A";
          },
        },
        {
          header: "PSF",
          cell: (row) => {
            const price = toNumber(row.resale_price);
            const sqm = toNumber(row.floor_area_sqm);
            if (!price || !sqm || sqm <= 0) return "N/A";
            return `$${Math.round(price / (sqm * 10.764)).toLocaleString()}`;
          },
        },
        {
          header: "Flat Type",
          cell: (row) => {
            const type = row.flat_type ?? "Unknown";
            const color =
              MARKET_HDB_FLAT_TYPE_TONE_CLASSES[type] ?? "bg-muted text-muted-foreground";
            return (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                {type}
              </span>
            );
          },
        },
      ]}
      mobileCardRenderer={(row) => {
        const type = row.flat_type ?? "Unknown";
        const color =
          MARKET_HDB_FLAT_TYPE_TONE_CLASSES[type] ?? "bg-muted text-muted-foreground";
        const block = row.block ?? "";
        const street = row.street_name ?? "";
        const address = block && street ? `Blk ${block} ${street}` : street || block || "";
        const price = toNumber(row.resale_price);
        const sqm = toNumber(row.floor_area_sqm);
        const psf = price && sqm && sqm > 0 ? Math.round(price / (sqm * 10.764)) : null;

        return (
          <div className="space-y-1 px-4 py-3">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium text-foreground">
                {formatCurrencySgd(price)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                {type}
              </span>
            </div>
            {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
            <p className="text-xs text-muted-foreground">
              {row.storey_range ?? ""} · {sqm ? formatAreaSqft(sqm) : ""}
              {psf ? ` · $${psf.toLocaleString()} psf` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateMonthYear(row.month)}</p>
          </div>
        );
      }}
    />
  );
}
