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
        "Permanently deletes a connection from the user's account. Use this only when the user explicitly wants the connection itself removed, not when they only want tools deactivated.",
      inputSchema: z.object({
        connectionId: z.string().trim().min(1),
      }),
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
