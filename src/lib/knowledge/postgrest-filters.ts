/**
 * PostgREST search filter builders for Knowledge Base queries.
 * @module lib/knowledge/postgrest-filters
 */
import { buildSearchExpression } from "@/lib/crm/postgrest-filters";

/**
 * Builds an OR filter for vault file free-text search across metadata and content text.
 */
export function buildVaultSearchOrFilter(searchText: string): string {
  return buildSearchExpression(searchText, ["title", "filename", "summary", "content"]);
}
