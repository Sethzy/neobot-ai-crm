/** Client-side paginated transactions table for agent profile. */
"use client";

import type { ReactNode } from "react";
import { PaginatedTable } from "@/components/property/paginated-table";
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

const TXN_TYPE_COLORS: Record<string, string> = {
  "New Sale": "bg-[#D8F3DC] text-sunder-green",
  Resale: "bg-[#F0E8D8] text-sunder-green",
  "Whole Rental": "bg-zinc-100 text-zinc-700",
  "Room Rental": "bg-zinc-100 text-zinc-700",
};

const REP_COLORS: Record<string, string> = {
  Seller: "bg-[#D8F3DC] text-sunder-green",
  Buyer: "bg-[#F0E8D8] text-sunder-green",
  Landlord: "bg-zinc-100 text-zinc-600",
  Tenant: "bg-zinc-100 text-zinc-600",
};

function Badge({ label, colorMap }: { label: string | null; colorMap: Record<string, string> }): ReactNode {
  const formatted = formatEnumLabel(label);
  const colors = colorMap[formatted] ?? "bg-zinc-100 text-zinc-700";
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
          cell: (row) => <Badge label={row.transaction_type} colorMap={TXN_TYPE_COLORS} />,
        },
        {
          header: "Area",
          cell: (row) =>
            formatAreaName(row.general_location ?? row.town ?? row.district),
        },
        {
          header: "Represented",
          cell: (row) => <Badge label={row.represented} colorMap={REP_COLORS} />,
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-zinc-900">
              {formatDateMonthYear(row.transaction_date)}
            </span>
            <Badge label={row.represented} colorMap={REP_COLORS} />
          </div>
          <p className="text-sm text-zinc-600">{formatPropertyType(row.property_type)}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{formatAreaName(row.general_location ?? row.town ?? row.district)}</span>
            <Badge label={row.transaction_type} colorMap={TXN_TYPE_COLORS} />
          </div>
        </div>
      )}
    />
  );
}
