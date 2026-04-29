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
    summary: z.string().optional().describe(
      "Free-text summary of what happened — e.g. 'Discussed Q2 pricing, sent proposal'. Use this whenever the user provides any narrative context for the interaction.",
    ),
    duration_minutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24)
      .optional()
      .describe(
        "Duration in whole minutes (0-1440). Use for calls and meetings when known. Reject negative durations at the call site.",
      ),
    occurred_at: flexibleTimestampSchema
      .optional()
      .describe("ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."),
  });

type CreateInteractionInput = {
  contact_id: string;
  deal_id?: string;
  type: string;
  summary?: string;
  duration_minutes?: number;
  occurred_at?: string;
};

export const createInteractionTool: ManagedAgentTool<CreateInteractionInput> = {
  name: "create_interaction",
  description:
    `Record a CRM interaction (call, meeting, email, etc.). ` +
    `Valid interaction types: ${CRM_DEFAULTS.interaction_types.join(", ")}. ` +
    `Accepts: contact_id (required), type (required), summary, duration_minutes, occurred_at, deal_id. ` +
    `Always pass summary when the user gives narrative context. ` +
    `Pass duration_minutes for calls/meetings when known (validated to 0-1440). ` +
    `Data Modification Warning: Only record interactions when the user has explicitly asked to do so.`,
  inputSchema: inputSchema(CRM_DEFAULTS.interaction_types),
  execute: async (
    { contact_id, deal_id, type, summary, duration_minutes, occurred_at },
    context,
  ) => {
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
        duration_minutes: duration_minutes ?? null,
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
