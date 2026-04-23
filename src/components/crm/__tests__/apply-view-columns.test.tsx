import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { applyViewColumns } from "../apply-view-columns";

interface Row {
  amount: number;
  name: string;
  stage: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  { id: "amount", accessorKey: "amount", header: "Amount" },
  { id: "stage", accessorKey: "stage", header: "Stage" },
];

describe("applyViewColumns", () => {
  it("filters and reorders columns from saved-view state", () => {
    const result = applyViewColumns(columns, {
      columns: ["name", "stage"],
      columnOrder: ["stage", "name"],
    });

    expect(result.map((column) => ("id" in column ? column.id : null))).toEqual([
      "stage",
      "name",
    ]);
  });

  it("falls back to the original columns when the saved selection is empty after filtering", () => {
    const result = applyViewColumns(columns, {
      columns: ["missing_column"],
      columnOrder: [],
    });

    expect(result).toEqual(columns);
  });
});
