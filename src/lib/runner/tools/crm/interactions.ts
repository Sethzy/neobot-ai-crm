/**
 * CRM interaction tools for the runner.
 * @module lib/runner/tools/crm/interactions
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

import {
  buildIlikePattern,
  DEFAULT_CRM_RESULT_LIMIT,
  flexibleTimestampSchema,
  normalizeDateString,
  normalizeDateUpperBound,
} from "./filter-utils";

/**
 * Creates interaction-related CRM tools.
 *
 * Interactions are append-only in v1, so only create is exposed.
 */
export function createInteractionTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const interactionTypeEnum = z.enum(config.interaction_types as [string, ...string[]]);
  const interactionTypeList = config.interaction_types.join(", ");

  const create_interaction = tool({
    description:
      `Record a CRM interaction. Valid interaction types: ${interactionTypeList}. ` +
      "Data Modification Warning: Only record interactions when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_contacts to find this."),
      deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_deals to find this."),
      type: interactionTypeEnum.describe(`Interaction type (${interactionTypeList}).`),
      summary: z.string().optional().describe("Interaction summary."),
      occurred_at: flexibleTimestampSchema
        .optional()
        .describe("ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."),
    }),
    execute: async ({ contact_id, deal_id, type, summary, occurred_at }) => {
      const normalizedOccurredAt = normalizeDateString(occurred_at);

      const { data, error } = await supabase
        .from("interactions")
        .insert({
          client_id: clientId,
          contact_id,
          deal_id,
          type,
          summary: summary ?? null,
          occurred_at: normalizedOccurredAt ?? new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        interaction: data,
      };
    },
  });

  const search_interactions = tool({
    description:
      `Search CRM interaction history. Optionally filter by type (${interactionTypeList}), contact, deal, or date range. ` +
      "Results are sorted by occurred_at (newest first). " +
      "Use this to review activity history before logging new interactions.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Free-text search on interaction summary."),
      type: interactionTypeEnum.optional().describe(`Interaction type filter (${interactionTypeList}).`),
      contact_id: z.string().uuid().optional().describe("Filter by contact UUID."),
      deal_id: z.string().uuid().optional().describe("Filter by deal UUID."),
      occurred_after: flexibleTimestampSchema.optional()
        .describe("Only return interactions on or after this timestamp/date."),
      occurred_before: flexibleTimestampSchema.optional()
        .describe("Only return interactions on or before this timestamp/date."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, type, contact_id, deal_id, occurred_after, occurred_before, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
      let queryBuilder = supabase
        .from("interactions")
        .select("*")
        .eq("client_id", clientId);

      if (query) {
        queryBuilder = queryBuilder.ilike("summary", buildIlikePattern(query));
      }

      if (type) {
        queryBuilder = queryBuilder.eq("type", type);
      }

      if (contact_id) {
        queryBuilder = queryBuilder.eq("contact_id", contact_id);
      }

      if (deal_id) {
        queryBuilder = queryBuilder.eq("deal_id", deal_id);
      }

      const normalizedAfter = normalizeDateString(occurred_after);
      if (normalizedAfter) {
        queryBuilder = queryBuilder.gte("occurred_at", normalizedAfter);
      }

      const normalizedBefore = normalizeDateUpperBound(occurred_before);
      if (normalizedBefore) {
        queryBuilder = queryBuilder.lte("occurred_at", normalizedBefore);
      }

      const { data, error } = await queryBuilder
        .order("occurred_at", { ascending: false })
        .limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const interactions = data ?? [];

      return {
        success: true as const,
        interactions,
        count: interactions.length,
      };
    },
  });

  const delete_interaction = tool({
    description:
      "Permanently delete an interaction by id. This cannot be undone. " +
      "Use search_interactions to find the interaction first.",
    inputSchema: z.object({
      interaction_id: z.string().uuid().describe("UUID of the interaction to delete."),
    }),
    needsApproval: true,
    execute: async ({ interaction_id }) => {
      const { data, error } = await supabase
        .from("interactions")
        .delete()
        .eq("interaction_id", interaction_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, interaction: data };
    },
  });

  return {
    create_interaction,
    search_interactions,
    delete_interaction,
  };
}
