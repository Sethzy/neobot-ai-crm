/**
 * Shared utilities for CRM tool filter expressions and input normalization.
 * @module lib/runner/tools/crm/filter-utils
 */
import { z } from "zod";

export { buildContainsIlikeLiteral, buildIlikePattern, buildSearchExpression } from "@/lib/crm/postgrest-filters";

/** Default max results for CRM search tools. */
export const DEFAULT_CRM_RESULT_LIMIT = 20;

/** Zod schema matching YYYY-MM-DD date strings. */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Zod schema accepting either an ISO-8601 datetime or a YYYY-MM-DD date. */
export const flexibleTimestampSchema = z.union([
  z.string().datetime({ offset: true }),
  dateOnlySchema,
]);

/**
 * Normalizes a date-only string (YYYY-MM-DD) to an ISO-8601 timestamp.
 * Passes through full timestamps and null/undefined unchanged.
 */
export function normalizeDateString(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return value.length === 10 ? `${value}T00:00:00Z` : value;
}

/**
 * Normalizes a date-only upper bound to the end of the UTC day.
 * Passes through full timestamps and null/undefined unchanged.
 */
export function normalizeDateUpperBound(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return value.length === 10 ? `${value}T23:59:59.999Z` : value;
}
