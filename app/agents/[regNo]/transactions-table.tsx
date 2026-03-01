/** Client-side paginated transactions table for agent profile. */
"use client";

import { PaginatedTable } from "@/components/property/paginated-table";
import { formatDateMonthYear } from "@/lib/property/utils";

type AgentTransaction = {
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
  represented: string | null;
  town: string | null;
  district: string | null;
  general_location: string | null;
};

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
          cell: (row) => row.property_type ?? "N/A",
        },
        {
          header: "Transaction Type",
          cell: (row) => row.transaction_type ?? "N/A",
        },
        {
          header: "Area",
          cell: (row) =>
            row.general_location ?? row.town ?? row.district ?? "Unknown",
        },
        {
          header: "Represented",
          cell: (row) => row.represented ?? "N/A",
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-zinc-900">
              {formatDateMonthYear(row.transaction_date)}
            </span>
            <span className="text-xs text-zinc-500">{row.represented ?? "N/A"}</span>
          </div>
          <p className="text-sm text-zinc-600">{row.property_type ?? "N/A"}</p>
          <p className="text-xs text-zinc-500">
            {row.general_location ?? row.town ?? row.district ?? "Unknown"} · {row.transaction_type ?? "N/A"}
          </p>
        </div>
      )}
    />
  );
}
