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
  flexibleTimestampSchema,
  normalizeDateString,
} from "./filter-utils";

/**
 * Creates the create_interaction tool.
 *
 * Search and delete are handled by search_crm and delete_records respectively.
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
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_crm to find this."),
      deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_crm to find this."),
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

  return {
    create_interaction,
  };
}
