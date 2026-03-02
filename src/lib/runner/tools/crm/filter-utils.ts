/**
 * Utilities for building safe PostgREST filter expressions.
 * @module lib/runner/tools/crm/filter-utils
 */

/**
 * Normalizes free-form user search text to a compact single-line value.
 */
function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Escapes LIKE wildcard characters so user input is treated as literal text.
 */
function escapeLikeWildcards(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Returns a quoted PostgREST literal for a case-insensitive contains search.
 */
export function buildContainsIlikeLiteral(searchText: string): string {
  const normalizedText = normalizeSearchText(searchText);
  const escapedText = escapeLikeWildcards(normalizedText);

  // PostgREST accepts quoted filter values; JSON stringification provides robust escaping.
  return JSON.stringify(`%${escapedText}%`);
}
