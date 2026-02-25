/**
 * @file Field filter utilities tests
 * @description Tests for shared field filtering logic
 */
import { describe, it, expect } from "vitest";
import {
  fieldMatchesFilters,
  computeFieldCounts,
  type FieldFilters,
} from "./field-filter-utils";
import type { ValidationFailure } from "@/config/types";

describe("fieldMatchesFilters", () => {
  const noFilters: FieldFilters = {
    lowConfidence: false,
    needsReview: false,
    nonNull: false,
  };

  it("should return true when no filters active", () => {
    expect(
      fieldMatchesFilters("field1", "value", 0.95, null, noFilters)
    ).toBe(true);
  });

  it("should match low confidence fields when filter active", () => {
    const filters: FieldFilters = { lowConfidence: true, needsReview: false, nonNull: false };

    expect(fieldMatchesFilters("field1", "value", 0.5, null, filters)).toBe(true);
    expect(fieldMatchesFilters("field1", "value", 0.95, null, filters)).toBe(false);
  });

  it("should match fields with validation failures when filter active", () => {
    const filters: FieldFilters = { lowConfidence: false, needsReview: true, nonNull: false };
    const failures: ValidationFailure[] = [
      { ruleId: "r1", ruleName: "Rule", message: "msg", description: "Field validation rule", field: "field1" },
    ];

    expect(fieldMatchesFilters("field1", "value", 0.95, failures, filters)).toBe(true);
    expect(fieldMatchesFilters("field2", "value", 0.95, failures, filters)).toBe(false);
  });

  it("should match non-null fields when filter active", () => {
    const filters: FieldFilters = { lowConfidence: false, needsReview: false, nonNull: true };

    expect(fieldMatchesFilters("field1", "value", 0.95, null, filters)).toBe(true);
    expect(fieldMatchesFilters("field1", null, 0.95, null, filters)).toBe(false);
    expect(fieldMatchesFilters("field1", "", 0.95, null, filters)).toBe(false);
  });

  it("should treat empty arrays as null for nonNull filter", () => {
    const filters: FieldFilters = { lowConfidence: false, needsReview: false, nonNull: true };

    expect(fieldMatchesFilters("field1", [], 0.95, null, filters)).toBe(false);
    expect(fieldMatchesFilters("field1", [{ a: 1 }], 0.95, null, filters)).toBe(true);
  });

  it("should treat null currency objects as null for nonNull filter", () => {
    const filters: FieldFilters = { lowConfidence: false, needsReview: false, nonNull: true };

    // Null currency object (both amount and currency code are null)
    const nullCurrency = { amount: null, iso_4217_currency_code: null };
    expect(fieldMatchesFilters("field1", nullCurrency, 0.95, null, filters)).toBe(false);

    // Valid currency object
    const validCurrency = { amount: 100.50, iso_4217_currency_code: "SGD" };
    expect(fieldMatchesFilters("field1", validCurrency, 0.95, null, filters)).toBe(true);
  });

  it("should scan array row-level metadata for low confidence", () => {
    const filters: FieldFilters = { lowConfidence: true, needsReview: false, nonNull: false };
    const arrayValue = [{ a: 1 }, { a: 2 }];
    // Metadata keyed as fieldName[i] - row 1 has low confidence
    const allMetadata = {
      "items[0]": { ocrConfidence: 0.95 },
      "items[1]": { ocrConfidence: 0.60 }, // Below 0.85
    };

    // Field-level confidence is null, but row-level has low confidence
    expect(fieldMatchesFilters("items", arrayValue, null, null, filters, allMetadata)).toBe(true);

    // No low confidence rows
    const highConfMeta = {
      "items[0]": { ocrConfidence: 0.95 },
      "items[1]": { ocrConfidence: 0.90 },
    };
    expect(fieldMatchesFilters("items", arrayValue, null, null, filters, highConfMeta)).toBe(false);
  });

  it("should use OR logic when multiple filters active", () => {
    const filters: FieldFilters = { lowConfidence: true, needsReview: true, nonNull: false };
    const failures: ValidationFailure[] = [
      { ruleId: "r1", ruleName: "Rule", message: "msg", description: "Field validation rule", field: "field1" },
    ];

    // field1 has validation failure (matches needsReview)
    expect(fieldMatchesFilters("field1", "value", 0.95, failures, filters)).toBe(true);
    // field2 has low confidence (matches lowConfidence)
    expect(fieldMatchesFilters("field2", "value", 0.5, null, filters)).toBe(true);
    // field3 has neither
    expect(fieldMatchesFilters("field3", "value", 0.95, null, filters)).toBe(false);
  });
});

describe("computeFieldCounts", () => {
  it("should count fields in single pass", () => {
    const splits = [
      {
        extractedData: { field1: "val", field2: null },
        extractionMetadata: {
          field1: { ocrConfidence: 0.95 },
          field2: { ocrConfidence: 0.5 },
        },
        validationFailures: [
          { ruleId: "r1", ruleName: "Rule", message: "msg", field: "field1" },
        ],
      },
    ] as any;

    const counts = computeFieldCounts(splits);

    expect(counts.total).toBe(2);
    expect(counts.lowConfidence).toBe(1); // field2
    expect(counts.needsReview).toBe(1); // field1
    expect(counts.nonNull).toBe(1); // field1 has value, field2 is null
  });

  it("should treat empty arrays as null for nonNull count", () => {
    const splits = [
      {
        extractedData: { emptyArray: [], filledArray: [{ a: 1 }] },
        extractionMetadata: {},
        validationFailures: [],
      },
    ] as any;

    const counts = computeFieldCounts(splits);

    expect(counts.total).toBe(2);
    expect(counts.nonNull).toBe(1); // Only filledArray counts as non-null
  });

  it("should scan array row-level metadata for low confidence count", () => {
    const splits = [
      {
        extractedData: { items: [{ a: 1 }, { a: 2 }] },
        extractionMetadata: {
          // Row-level metadata keyed as fieldName[i]
          "items[0]": { ocrConfidence: 0.95 },
          "items[1]": { ocrConfidence: 0.60 }, // Below 0.85
        },
        validationFailures: [],
      },
    ] as any;

    const counts = computeFieldCounts(splits);

    expect(counts.total).toBe(1);
    expect(counts.lowConfidence).toBe(1); // items has a low conf row
  });
});
