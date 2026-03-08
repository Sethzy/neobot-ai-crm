/**
 * list_users_connections tool for external connection discovery.
 * @module lib/runner/tools/connections/list-connections
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAllConnections } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates a read-only tool that lists every persisted connection for the client.
 */
export function createListConnectionsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    list_users_connections: tool({
      description:
        "Lists all connections to external services that the user has already created in their account. Returns active, inactive, error, and pending connections with connectionId, serviceName, description, accountName, connectionType, and connection-specific details.",
      inputSchema: z.object({}),
      execute: async () => {
        const connections = await getAllConnections(supabase, clientId);

        return {
          success: true,
          connections: connections.map((connection) => {
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
          }),
        };
      },
    }),
  };
}
