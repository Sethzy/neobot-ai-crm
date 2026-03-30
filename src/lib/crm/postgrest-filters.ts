/**
 * Shared PostgREST search filter builders for CRM query hooks.
 * @module lib/crm/postgrest-filters
 */

/** Normalizes whitespace and escapes LIKE wildcards (`%`, `_`, `\`). */
function escapeIlikeWildcards(searchText: string): string {
  return searchText
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Returns a raw `%escaped%` pattern for use with `.ilike()` builder calls.
 * Escapes LIKE wildcards but does NOT add PostgREST quoting.
 */
export function buildIlikePattern(searchText: string): string {
  return `%${escapeIlikeWildcards(searchText)}%`;
}

/**
 * Returns a quoted PostgREST literal for a case-insensitive contains search.
 * Escapes LIKE wildcards and wraps in PostgREST-quoted `"%…%"` format.
 */
export function buildContainsIlikeLiteral(searchText: string): string {
  const escaped = escapeIlikeWildcards(searchText).replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/**
 * Builds a PostgREST OR filter expression for case-insensitive search across multiple columns.
 */
export function buildSearchExpression(query: string, columns: string[]): string {
  const containsLiteral = buildContainsIlikeLiteral(query);
  return columns.map((col) => `${col}.ilike.${containsLiteral}`).join(",");
}
