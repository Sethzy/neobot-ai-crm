/**
 * Shared filter contract for CRM saved views.
 *
 * Defines supported filter operators, symbolic date tokens, and utilities
 * for resolving and applying view filters. Used by:
 * - `manage_views` agent tool (validates filters on write)
 * - Frontend data hooks (applies filters on read)
 *
 * @module lib/crm/view-filters
 */
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { z } from "zod";

/** Symbolic date tokens that are resolved at query time. */
export const SYMBOLIC_DATE_TOKENS = [
  "$today",
  "$week_start",
  "$week_end",
  "$month_start",
  "$month_end",
] as const;

type SymbolicToken = (typeof SYMBOLIC_DATE_TOKENS)[number];

const TOKEN_SET = new Set<string>(SYMBOLIC_DATE_TOKENS);

function isSymbolicToken(value: unknown): value is SymbolicToken {
  return typeof value === "string" && TOKEN_SET.has(value);
}

/** Resolves symbolic date tokens to ISO date strings (YYYY-MM-DD). */
export function resolveSymbolicDates(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const now = new Date();
  const weekReferenceDate = addDays(now, 1);
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (!isSymbolicToken(value)) {
      resolved[key] = value;
      continue;
    }

    switch (value) {
      case "$today":
        resolved[key] = format(now, "yyyy-MM-dd");
        break;
      case "$week_start":
        resolved[key] = format(
          startOfWeek(weekReferenceDate, { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        );
        break;
      case "$week_end":
        resolved[key] = format(
          endOfWeek(weekReferenceDate, { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        );
        break;
      case "$month_start":
        resolved[key] = format(startOfMonth(now), "yyyy-MM-dd");
        break;
      case "$month_end":
        resolved[key] = format(endOfMonth(now), "yyyy-MM-dd");
        break;
    }
  }

  return resolved;
}

/**
 * Zod schema for validating view filter objects.
 * Accepts equality values, arrays (for IN filters), symbolic tokens, and null.
 */
export const viewFiltersSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
  ]),
);

export type ViewFilters = z.infer<typeof viewFiltersSchema>;

/**
 * Applies resolved view filters to a Supabase query builder.
 *
 * Filter key conventions:
 * - `column_after` → `.gte(column, value)`
 * - `column_before` → `.lte(column, value)`
 * - Array value → `.in(column, values)`
 * - Scalar value → `.eq(column, value)`
 * - Null → skipped
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyViewFilters<Q extends Record<string, (...args: any[]) => Q>>(
  query: Q,
  filters: Record<string, unknown>,
): Q {
  let q = query;

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key.endsWith("_before")) {
      const column = key.slice(0, -"_before".length);
      q = q.lte(column, value);
    } else if (key.endsWith("_after")) {
      const column = key.slice(0, -"_after".length);
      q = q.gte(column, value);
    } else if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }

  return q;
}
