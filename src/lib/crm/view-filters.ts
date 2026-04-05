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
 * Per-entity whitelist of allowed filter keys and sortable columns.
 * Prevents hallucinated column names from being persisted and erroring at query time.
 */
export const ENTITY_ALLOWED_COLUMNS: Record<
  string,
  { filterKeys: Set<string>; sortColumns: Set<string> }
> = {
  contacts: {
    filterKeys: new Set([
      "type", "company_id",
      "created_at_after", "created_at_before",
    ]),
    sortColumns: new Set(["first_name", "last_name", "type", "created_at"]),
  },
  companies: {
    filterKeys: new Set([
      "industry",
      "created_at_after", "created_at_before",
    ]),
    sortColumns: new Set(["name", "industry", "created_at"]),
  },
  deals: {
    filterKeys: new Set([
      "stage", "company_id",
      "close_date_after", "close_date_before",
      "created_at_after", "created_at_before",
    ]),
    sortColumns: new Set(["address", "stage", "amount", "close_date", "created_at"]),
  },
  tasks: {
    filterKeys: new Set([
      "status", "contact_id", "deal_id",
      "due_date_after", "due_date_before",
      "created_at_after", "created_at_before",
    ]),
    sortColumns: new Set(["title", "status", "due_date", "created_at"]),
  },
};

/**
 * Validates that filter keys and sort column are allowed for the given entity type.
 * Returns an error string if validation fails, or null if valid.
 */
export function validateViewFilters(
  entityType: string,
  filters: Record<string, unknown>,
  sort?: { column: string; ascending: boolean } | null,
): string | null {
  const allowed = ENTITY_ALLOWED_COLUMNS[entityType];
  if (!allowed) return `Unknown entity type: ${entityType}`;

  const invalidKeys = Object.keys(filters).filter(
    (key) => !allowed.filterKeys.has(key),
  );
  if (invalidKeys.length > 0) {
    return `Invalid filter keys for ${entityType}: ${invalidKeys.join(", ")}. Allowed: ${[...allowed.filterKeys].join(", ")}`;
  }

  if (sort && !allowed.sortColumns.has(sort.column)) {
    return `Invalid sort column for ${entityType}: ${sort.column}. Allowed: ${[...allowed.sortColumns].join(", ")}`;
  }

  return null;
}

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
export function applyViewFilters<Q>(
  query: Q,
  filters: Record<string, unknown>,
): Q {
  const queryBuilder = query as {
    eq: (column: string, value: unknown) => unknown;
    gte: (column: string, value: unknown) => unknown;
    in: (column: string, values: unknown[]) => unknown;
    lte: (column: string, value: unknown) => unknown;
  };
  let q: unknown = queryBuilder;

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key.endsWith("_before")) {
      const column = key.slice(0, -"_before".length);
      q = (q as typeof queryBuilder).lte(column, value);
    } else if (key.endsWith("_after")) {
      const column = key.slice(0, -"_after".length);
      q = (q as typeof queryBuilder).gte(column, value);
    } else if (Array.isArray(value)) {
      q = (q as typeof queryBuilder).in(key, value);
    } else {
      q = (q as typeof queryBuilder).eq(key, value);
    }
  }

  return q as Q;
}
