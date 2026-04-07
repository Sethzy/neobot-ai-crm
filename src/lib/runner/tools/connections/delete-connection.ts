/**
 * delete_connection tool for permanently removing a connection.
 * @module lib/runner/tools/connections/delete-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import { deleteConnection, getConnectionById } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the delete_connection tool.
 */
export function createDeleteConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    delete_connection: tool({
      description:
        "PERMANENTLY DELETES a connection from the user's account. This destroys the stored credentials and cannot be undone. Requires user approval before execution.\n\nWARNING: This is a destructive action. Only use when the user explicitly wants to DELETE the connection itself (e.g., \"delete this connection\", \"remove from my account\").\nDO NOT use this tool if the user wants to remove or deactivate tools from a connection (e.g., \"remove {connection name}\") → use manage_activated_tools_for_connections instead",
      inputSchema: z.object({
        connectionId: z.string().trim().min(1),
      }),
      needsApproval: true,
      execute: async ({ connectionId }) => {
        const connection = await getConnectionById(supabase, clientId, connectionId);

        if (!connection) {
          return {
            success: false,
            error: "Connection not found.",
          };
        }

        const composio = getComposio();

        try {
          await composio.connectedAccounts.delete(connection.composio_connected_account_id);
        } catch (error) {
          console.error("[delete_connection] Failed to delete Composio account.", error);
        }

        await deleteConnection(supabase, clientId, connection.id);

        return {
          success: true,
          connectionId: connection.id,
          message: `Connection to ${connection.toolkit_slug} permanently deleted.`,
        };
      },
    }),
  };
}
