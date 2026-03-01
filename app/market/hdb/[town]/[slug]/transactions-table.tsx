/** Client-side paginated transactions table for HDB street profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
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

const FLAT_TYPE_COLORS: Record<string, string> = {
  "1 ROOM": "bg-red-100 text-red-800",
  "2 ROOM": "bg-orange-100 text-orange-800",
  "3 ROOM": "bg-amber-100 text-amber-800",
  "4 ROOM": "bg-emerald-100 text-emerald-800",
  "5 ROOM": "bg-sky-100 text-sky-800",
  EXECUTIVE: "bg-violet-100 text-violet-800",
  "MULTI-GENERATION": "bg-pink-100 text-pink-800",
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
            const color = FLAT_TYPE_COLORS[type] ?? "bg-zinc-100 text-zinc-800";
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
        const color = FLAT_TYPE_COLORS[type] ?? "bg-zinc-100 text-zinc-800";
        const block = row.block ?? "";
        const street = row.street_name ?? "";
        const address = block && street ? `Blk ${block} ${street}` : street || block || "";
        const price = toNumber(row.resale_price);
        const sqm = toNumber(row.floor_area_sqm);
        const psf = price && sqm && sqm > 0 ? Math.round(price / (sqm * 10.764)) : null;

        return (
          <div className="px-4 py-3 space-y-1">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-zinc-900">
                {formatCurrencySgd(price)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                {type}
              </span>
            </div>
            {address ? <p className="text-sm text-zinc-600">{address}</p> : null}
            <p className="text-xs text-zinc-500">
              {row.storey_range ?? ""} · {sqm ? formatAreaSqft(sqm) : ""}
              {psf ? ` · $${psf.toLocaleString()} psf` : ""}
            </p>
            <p className="text-xs text-zinc-400">{formatDateMonthYear(row.month)}</p>
          </div>
        );
      }}
    />
  );
}
