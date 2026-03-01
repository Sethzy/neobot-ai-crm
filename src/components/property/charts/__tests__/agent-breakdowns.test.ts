import { describe, expect, it } from "vitest";
import {
  computeRentalRepBreakdown,
  computeSalesRepBreakdown,
  computeTransactionTypeBreakdown,
} from "@/lib/property/agent-breakdowns";

const MOCK_TRANSACTIONS = [
  { transaction_type: "Resale", represented: "Seller" },
  { transaction_type: "Resale", represented: "Buyer" },
  { transaction_type: "Rental (Whole)", represented: "Tenant" },
  { transaction_type: "Rental (Whole)", represented: "Landlord" },
  { transaction_type: "Rental (Room)", represented: "Tenant" },
  { transaction_type: "Resale", represented: "Seller" },
];

describe("computeTransactionTypeBreakdown", () => {
  it("counts by transaction_type", () => {
    const result = computeTransactionTypeBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Resale", count: 3 });
    expect(result).toContainEqual({ label: "Rental (Whole)", count: 2 });
    expect(result).toContainEqual({ label: "Rental (Room)", count: 1 });
  });

  it("sorts by count descending", () => {
    const result = computeTransactionTypeBreakdown(MOCK_TRANSACTIONS);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });
});

describe("computeSalesRepBreakdown", () => {
  it("only includes Resale transactions", () => {
    const result = computeSalesRepBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Seller", count: 2 });
    expect(result).toContainEqual({ label: "Buyer", count: 1 });
    expect(result).toHaveLength(2);
  });
});

describe("computeRentalRepBreakdown", () => {
  it("only includes Rental transactions", () => {
    const result = computeRentalRepBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Tenant", count: 2 });
    expect(result).toContainEqual({ label: "Landlord", count: 1 });
    expect(result).toHaveLength(2);
  });
});
