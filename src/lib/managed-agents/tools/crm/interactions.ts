/**
 * CRM interaction tool for managed agents.
 *
 * @module lib/managed-agents/tools/crm/interactions
 */
import { z } from "zod";

import { CRM_DEFAULTS, matchVocabularyValue } from "@/lib/crm/config";
import {
  flexibleTimestampSchema,
  normalizeDateString,
} from "@/lib/crm/filter-utils";

import type { ManagedAgentTool } from "../types";

const inputSchema = (interactionTypes: readonly string[]) =>
  z.object({
    contact_id: z.string().uuid().describe("UUID of the contact. Use search_crm to find this."),
    deal_id: z.string().uuid().optional().describe("UUID of the deal. Use search_crm to find this."),
    type: z.string().trim().min(1).describe(
      `Interaction type (${interactionTypes.join(", ")} or configured CRM values).`,
    ),
    summary: z.string().optional().describe("Interaction summary."),
    occurred_at: flexibleTimestampSchema
      .optional()
      .describe("ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."),
  });

type CreateInteractionInput = {
  contact_id: string;
  deal_id?: string;
  type: string;
  summary?: string;
  occurred_at?: string;
};

export const createInteractionTool: ManagedAgentTool<CreateInteractionInput> = {
  name: "create_interaction",
  description:
    `Record a CRM interaction. Valid interaction types: ${CRM_DEFAULTS.interaction_types.join(", ")}. ` +
    "Data Modification Warning: Only record interactions when the user has explicitly asked to do so.",
  inputSchema: inputSchema(CRM_DEFAULTS.interaction_types),
  execute: async ({ contact_id, deal_id, type, summary, occurred_at }, context) => {
    const interactionTypes = context.crmConfig?.interaction_types ?? CRM_DEFAULTS.interaction_types;
    const resolvedType = matchVocabularyValue(type, interactionTypes);

    if (!interactionTypes.includes(resolvedType)) {
      return {
        success: false as const,
        error: `Invalid interaction type "${type}". Valid values: ${interactionTypes.join(", ")}`,
      };
    }

    const normalizedOccurredAt = normalizeDateString(occurred_at);

    const { data, error } = await context.supabase
      .from("interactions")
      .insert({
        client_id: context.clientId,
        contact_id,
        deal_id,
        type: resolvedType,
        summary: summary ?? null,
        occurred_at: normalizedOccurredAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    return { success: true as const, interaction: data };
  },
};
