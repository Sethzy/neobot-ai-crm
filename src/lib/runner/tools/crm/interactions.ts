/**
 * CRM interaction tools for the runner.
 * @module lib/runner/tools/crm/interactions
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { interactionTypeValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { flexibleTimestampSchema, normalizeDateString } from "./filter-utils";

/**
 * Creates interaction-related CRM tools.
 *
 * Interactions are append-only in v1, so only create is exposed.
 */
export function createInteractionTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const create_interaction = tool({
    description:
      "Record a CRM interaction such as a call, meeting, email, message, viewing, or note. " +
      "Data Modification Warning: Only record interactions when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_contacts to find this."),
      deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_deals to find this."),
      type: z.enum(interactionTypeValues).describe("Interaction type (call, meeting, email, message, viewing, note)."),
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
