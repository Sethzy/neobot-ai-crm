/**
 * Shared utilities for CRM tool filter expressions and input normalization.
 * @module lib/crm/filter-utils
 */
import { isValid, parse } from "date-fns";
import { z } from "zod";

export { buildContainsIlikeLiteral, buildIlikePattern, buildSearchExpression } from "@/lib/crm/postgrest-filters";

/** Default max results for CRM search tools. */
export const DEFAULT_CRM_RESULT_LIMIT = 20;

/** Zod schema matching YYYY-MM-DD date strings. */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Zod schema accepting either an ISO-8601 datetime or a YYYY-MM-DD date. */
export const flexibleTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((val) => normalizeDateString(val) !== null, {
    message: "Unrecognised date format",
  });

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "MM-dd-yyyy",
  "dd-MM-yyyy",
  "MMMM d, yyyy",
  "MMM d, yyyy",
  "d MMM yyyy",
  "d MMMM yyyy",
] as const;

function toUtcDayStartString(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .replace(".000", "");
}

/**
 * Normalizes a date-only string (YYYY-MM-DD) to an ISO-8601 timestamp.
 * Passes through full timestamps and null/undefined unchanged.
 */
export function normalizeDateString(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (dateOnlySchema.safeParse(trimmed).success) {
    return `${trimmed}T00:00:00Z`;
  }

  for (const format of DATE_FORMATS) {
    const parsed = parse(trimmed, format, new Date());
    if (isValid(parsed)) {
      return toUtcDayStartString(parsed);
    }
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().replace(".000", "");
  }

  return null;
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
