/**
 * Read-only CRM config tool for managed agents.
 *
 * Returns the resolved CRM vocabulary (deal stages, contact types, interaction
 * types, custom field definitions, etc.) so the agent knows valid values before
 * writing records. No input required — reads the current tenant's config.
 *
 * @module lib/managed-agents/tools/crm/get-crm-config
 */
import { z } from "zod";

import { loadCrmConfig } from "@/lib/crm/config";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({});

type GetCrmConfigInput = z.infer<typeof inputSchema>;

export const getCrmConfigTool: ManagedAgentTool<GetCrmConfigInput> = {
  name: "get_crm_config",
  description:
    "Read the current CRM configuration: valid deal stages, contact types, " +
    "company industries, interaction types, deal contact roles, and custom " +
    "field definitions for each entity. Use this before creating or updating " +
    "records when you need to know the valid values.",
  inputSchema,
  execute: async (_input, context) => {
    const { config } = await loadCrmConfig(context.supabase, context.clientId);

    return {
      success: true as const,
      config,
    };
  },
};
