/** Client-side paginated transactions table for area profile. */
"use client";

import Link from "next/link";
import { PaginatedTable } from "@/components/property/paginated-table";
import { MARKET_TRANSACTION_TYPE_TONE_CLASSES } from "@/lib/ui/color-maps";
import {
  formatDateMonthYear,
  formatEnumLabel,
  formatPropertyType,
} from "@/lib/property/utils";

type CeaTransaction = {
  id: number;
  salesperson_reg_num: string | null;
  salesperson_name: string | null;
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
};

function TxnBadge({ label }: { label: string | null }) {
  const formatted = formatEnumLabel(label);
  const colors =
    MARKET_TRANSACTION_TYPE_TONE_CLASSES[formatted] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {formatted}
    </span>
  );
}

export function AreaTransactionsTableClient({
  transactions,
  areaName,
}: {
  transactions: CeaTransaction[];
  areaName: string;
}) {
  return (
    <PaginatedTable
      data={transactions}
      title={`Recent CEA Transactions in ${areaName}`}
      emptyMessage="No CEA transaction records were found for this area."
      keyFn={(row) => String(row.id)}
      columns={[
        {
          header: "Date",
          cell: (row) => formatDateMonthYear(row.transaction_date),
        },
        {
          header: "Agent",
          cell: (row) =>
            row.salesperson_reg_num ? (
              <Link
                href={`/market/agents/${row.salesperson_reg_num}`}
                className="font-medium text-foreground hover:text-primary"
              >
                {row.salesperson_name ?? row.salesperson_reg_num}
              </Link>
            ) : (
              "Unknown"
            ),
          className: "px-4 py-4 text-sm text-foreground",
        },
        {
          header: "Property Type",
          cell: (row) => formatPropertyType(row.property_type),
        },
        {
          header: "Transaction Type",
          cell: (row) => <TxnBadge label={row.transaction_type} />,
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="space-y-1 px-4 py-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-foreground">
              {row.salesperson_name ?? row.salesperson_reg_num ?? "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateMonthYear(row.transaction_date)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{formatPropertyType(row.property_type)}</p>
          <TxnBadge label={row.transaction_type} />
        </div>
      )}
    />
  );
}
