/**
 * list_connections tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/list-connections
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

export const listConnectionsTool: ManagedAgentTool = {
  name: "list_connections",
  description:
    "Lists all connections to external services that the user has already created in their account. Returns active, inactive, error, and pending connections with connectionId, serviceName, description, accountName, connectionType, and connection-specific details.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { data, error } = await context.supabase
      .from("connections")
      .select("*")
      .eq("client_id", context.clientId)
      .order("toolkit_slug", { ascending: true });

    if (error) {
      return { success: false as const, error: error.message };
    }

    const connections = (data ?? []).map((connection) => {
      const description = connection.display_name ?? connection.toolkit_slug;
      const accountName =
        connection.account_identifier ?? connection.display_name ?? connection.toolkit_slug;

      return {
        connectionId: connection.id,
        serviceName: connection.toolkit_slug,
        description,
        accountName,
        connectionType: "integrations" as const,
        status: connection.status,
        activatedToolCount: connection.activated_tools.length,
        totalToolCount: connection.tool_count,
      };
    });

    return { success: true as const, connections };
  },
};
