/**
 * get_agent_db_schema tool for managed agents.
 *
 * @module lib/managed-agents/tools/utility/get-agent-db-schema
 */
import { z } from "zod";

import { formatFieldDefinitionsForSchemaTool } from "@/lib/ai/platform-instructions";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({});

export const getAgentDbSchemaTool: ManagedAgentTool<z.infer<typeof inputSchema>> = {
  name: "get_agent_db_schema",
  description: "Get available tables, columns, and row counts for the agent SQL workspace.",
  inputSchema,
  chatOnly: true,
  execute: async (_, context) => {
    const { data, error } = await context.supabase.rpc("get_client_accessible_schema");
    if (error) {
      return { success: false as const, error: error.message };
    }

    if (context.crmConfig) {
      return {
        success: true as const,
        schema: data,
        crm_fields: {
          contacts: formatFieldDefinitionsForSchemaTool(context.crmConfig.contact_fields),
          companies: formatFieldDefinitionsForSchemaTool(context.crmConfig.company_fields),
          deals: formatFieldDefinitionsForSchemaTool(context.crmConfig.deal_fields),
        },
      };
    }

    return { success: true as const, schema: data };
  },
};
