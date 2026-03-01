/** Computes donut breakdown datasets for agent profile charts. */

import { formatEnumLabel } from "./utils";

type Transaction = {
  transaction_type: string | null;
  represented: string | null;
};

type Breakdown = Array<{ label: string; count: number }>;

function countByField(
  transactions: Transaction[],
  field: keyof Transaction,
  filter?: (t: Transaction) => boolean
): Breakdown {
  const source = filter ? transactions.filter(filter) : transactions;
  const map = new Map<string, number>();

  for (const row of source) {
    const label = formatEnumLabel(row[field] ?? "Unknown");
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeTransactionTypeBreakdown(
  transactions: Transaction[]
): Breakdown {
  return countByField(transactions, "transaction_type");
}

export function computeSalesRepBreakdown(transactions: Transaction[]): Breakdown {
  return countByField(
    transactions,
    "represented",
    (t) => (t.transaction_type ?? "").toLowerCase() === "resale"
  );
}

export function computeRentalRepBreakdown(transactions: Transaction[]): Breakdown {
  return countByField(
    transactions,
    "represented",
    (t) => (t.transaction_type ?? "").toLowerCase().includes("rental")
  );
}
