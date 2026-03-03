/**
 * PostgREST search filter builders for Knowledge Base queries.
 * @module lib/knowledge/postgrest-filters
 */
import { buildContainsIlikeLiteral } from "@/lib/crm/postgrest-filters";

/**
 * Builds an OR filter for vault file free-text search across metadata and content text.
 */
export function buildVaultSearchOrFilter(searchText: string): string {
  const containsLiteral = buildContainsIlikeLiteral(searchText);

  return [
    `title.ilike.${containsLiteral}`,
    `filename.ilike.${containsLiteral}`,
    `summary.ilike.${containsLiteral}`,
    `content.ilike.${containsLiteral}`,
  ].join(",");
}
