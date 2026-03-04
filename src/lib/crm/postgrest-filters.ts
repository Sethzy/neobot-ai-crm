/**
 * Shared PostgREST search filter builders for CRM and knowledge base query hooks.
 * @module lib/crm/postgrest-filters
 */

/**
 * Returns a quoted PostgREST literal for a case-insensitive contains search.
 * Escapes LIKE wildcards and wraps in PostgREST-quoted `"%…%"` format.
 */
export function buildContainsIlikeLiteral(searchText: string): string {
  const normalized = searchText.trim().replace(/\s+/g, " ");
  const escaped = normalized
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '\\"');

  return `"%${escaped}%"`;
}

/**
 * Builds a PostgREST OR filter expression for case-insensitive search across multiple columns.
 */
export function buildSearchExpression(query: string, columns: string[]): string {
  const containsLiteral = buildContainsIlikeLiteral(query);
  return columns.map((col) => `${col}.ilike.${containsLiteral}`).join(",");
}
