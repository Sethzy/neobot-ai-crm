/**
 * @file Shared utilities for field filtering logic
 * @description Filter state types and matching functions used by ExtractionList and ExtractionCard
 */
import { isLowConfidence, type SplitExtraction } from "@/types/extraction";
import type { ValidationFailure } from "@/config/types";
import { isNullCurrencyObject } from "@/lib/field-utils";

/**
 * Checks if a validation failure applies to a specific field.
 * Handles both single-field (string) and multi-field (string[]) failures.
 * Uses prefix matching so nested fields inherit parent validation badges.
 *
 * @example
 * // Parent field match
 * failureAppliesToField({ field: "medisave_amount" }, "medisave_amount") // true
 *
 * // Nested field inherits parent validation
 * failureAppliesToField({ field: "medisave_amount" }, "medisave_amount.amount") // true
 * failureAppliesToField({ field: "medisave_amount" }, "medisave_amount.iso_4217_currency_code") // true
 */
export function failureAppliesToField(failure: ValidationFailure, fieldName: string): boolean {
  if (Array.isArray(failure.field)) {
    return failure.field.some(f => fieldName === f || fieldName.startsWith(f + "."));
  }
  return failure.field === fieldName || fieldName.startsWith(failure.field + ".");
}

/**
 * Extracts all field names from a validation failure.
 * Returns array for both single and multi-field failures.
 */
function getFailureFields(failure: ValidationFailure): string[] {
  if (Array.isArray(failure.field)) {
    return failure.field;
  }
  return [failure.field];
}

/**
 * Filter state for field visibility.
 * OR logic: show fields matching ANY active filter.
 *
 * Rationale: Each filter represents an independent "needs attention" signal.
 * Reviewers want to see ALL potentially problematic fields, not just fields
 * that fail multiple criteria simultaneously.
 */
export interface FieldFilters {
  /** Show fields with OCR confidence < 0.85 */
  lowConfidence: boolean;
  /** Show fields with validation failures */
  needsReview: boolean;
  /** Show fields with non-null values */
  nonNull: boolean;
}

/**
 * Field counts for filter display.
 */
export interface FieldCounts {
  /** Total fields across all splits */
  total: number;
  /** Fields with low OCR confidence */
  lowConfidence: number;
  /** Fields with validation failures */
  needsReview: number;
  /** Fields with non-null values */
  nonNull: number;
  /** Currently visible fields based on active filters */
  visible: number;
}

/**
 * Checks if a field matches the active filters.
 * Uses OR logic: returns true if field matches ANY active filter.
 * Returns true if no filters are active (show all).
 *
 * @param allMetadata - Full metadata record for array row-level lookups (keys like `fieldName[i]`)
 */
export function fieldMatchesFilters(
  fieldName: string,
  value: unknown,
  ocrConfidence: number | null | undefined,
  validationFailures: ValidationFailure[] | null,
  filters: FieldFilters,
  allMetadata?: Record<string, { ocrConfidence?: number | null }> | null
): boolean {
  // If no filters active, show all
  if (!filters.lowConfidence && !filters.needsReview && !filters.nonNull) {
    return true;
  }

  // OR logic: show if matches ANY active filter

  // Low confidence: check field-level, then array row-level metadata
  if (filters.lowConfidence) {
    if (isLowConfidence(ocrConfidence)) return true;
    // For arrays: scan row-level metadata (keyed as `fieldName[i]`)
    if (Array.isArray(value) && allMetadata) {
      for (let i = 0; i < value.length; i++) {
        const rowConf = allMetadata[`${fieldName}[${i}]`]?.ocrConfidence;
        if (rowConf != null && isLowConfidence(rowConf)) return true;
      }
    }
  }

  // Needs review: check validation failures for this field (handles multi-field rules)
  if (filters.needsReview && validationFailures?.some((f) => failureAppliesToField(f, fieldName))) {
    return true;
  }

  // Non-null: treat empty arrays and null currency objects as null
  if (filters.nonNull) {
    if (isNonNullValue(value)) return true;
  }

  return false;
}

/**
 * Checks if a field has low confidence, including array row-level metadata.
 */
function fieldHasLowConfidence(
  fieldName: string,
  value: unknown,
  meta: Record<string, { ocrConfidence?: number | null }> | null
): boolean {
  // Check field-level confidence
  if (isLowConfidence(meta?.[fieldName]?.ocrConfidence ?? null)) return true;
  // For arrays: scan row-level metadata (keyed as `fieldName[i]`)
  if (Array.isArray(value) && meta) {
    for (let i = 0; i < value.length; i++) {
      const rowConf = meta[`${fieldName}[${i}]`]?.ocrConfidence;
      if (rowConf != null && isLowConfidence(rowConf)) return true;
    }
  }
  return false;
}

/**
 * Checks if a value is non-null.
 * Treats empty arrays and null currency objects as null.
 */
function isNonNullValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (isNullCurrencyObject(value)) return false;
  return true;
}

/**
 * Computes field counts in a single pass over splits.
 * More efficient than multiple separate counting functions.
 */
export function computeFieldCounts(
  splits: SplitExtraction[],
  filters?: FieldFilters
): FieldCounts {
  let total = 0;
  let lowConfidence = 0;
  let needsReview = 0;
  let nonNull = 0;
  let visible = 0;

  for (const split of splits) {
    const data = split.extractedData ?? {};
    const meta = split.extractionMetadata ?? {};
    const failedFields = new Set(
      split.validationFailures?.flatMap((f) => getFailureFields(f)) ?? []
    );

    for (const [fieldName, value] of Object.entries(data)) {
      total++;

      const isLowConf = fieldHasLowConfidence(fieldName, value, meta);
      const hasFailure = failedFields.has(fieldName);
      const isNonNull = isNonNullValue(value);

      if (isLowConf) lowConfidence++;
      if (hasFailure) needsReview++;
      if (isNonNull) nonNull++;

      // Count visible based on current filters
      if (!filters || (!filters.lowConfidence && !filters.needsReview && !filters.nonNull)) {
        visible++;
      } else if (
        (filters.lowConfidence && isLowConf) ||
        (filters.needsReview && hasFailure) ||
        (filters.nonNull && isNonNull)
      ) {
        visible++;
      }
    }
  }

  return { total, lowConfidence, needsReview, nonNull, visible };
}
