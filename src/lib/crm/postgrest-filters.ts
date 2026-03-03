/**
 * Shared PostgREST search filter builders for CRM query hooks.
 * @module lib/crm/postgrest-filters
 */

/**
 * Builds a JSON-quoted contains pattern for PostgREST ilike filters.
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
 * Builds an OR filter for contact free-text search across name and channels.
 */
export function buildContactSearchOrFilter(searchText: string): string {
  const containsLiteral = buildContainsIlikeLiteral(searchText);

  return [
    `first_name.ilike.${containsLiteral}`,
    `last_name.ilike.${containsLiteral}`,
    `email.ilike.${containsLiteral}`,
    `phone.ilike.${containsLiteral}`,
  ].join(",");
}

/**
 * Builds an OR filter for deal free-text search across address and notes.
 */
export function buildDealSearchOrFilter(searchText: string): string {
  const containsLiteral = buildContainsIlikeLiteral(searchText);

  return [
    `address.ilike.${containsLiteral}`,
    `notes.ilike.${containsLiteral}`,
  ].join(",");
}

/**
 * Builds an OR filter for CRM task free-text search across title and description.
 */
export function buildCrmTaskSearchOrFilter(searchText: string): string {
  const containsLiteral = buildContainsIlikeLiteral(searchText);

  return [
    `title.ilike.${containsLiteral}`,
    `description.ilike.${containsLiteral}`,
  ].join(",");
}
