/**
 * list_connections tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/list-connections
 */
import { z } from "zod";

import { getSupportedProviderDisplayName } from "../supported-providers";
import type { ManagedAgentTool } from "../types";

export const listConnectionsTool: ManagedAgentTool = {
  name: "list_connections",
  description:
    "Lists the user's external-service connections. Returns the machine-stable toolkitSlug plus a human displayName, account identifier, and current status per connection so you can confirm what is connected before using a provider. When another connection tool asks for an app slug, use toolkitSlug.",
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
      const displayName =
        connection.display_name ?? getSupportedProviderDisplayName(connection.toolkit_slug);
      const description = displayName;
      const accountName =
        connection.account_identifier ?? displayName;

      return {
        connectionId: connection.id,
        toolkitSlug: connection.toolkit_slug,
        serviceName: connection.toolkit_slug,
        displayName,
        description,
        accountName,
        status: connection.status,
      };
    });

    return { success: true as const, connections };
  },
};
