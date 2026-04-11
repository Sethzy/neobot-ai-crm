/**
 * delete_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/delete-connection
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  connectionId: z.string().trim().min(1),
});

type DeleteConnectionInput = z.infer<typeof inputSchema>;

export const deleteConnectionTool: ManagedAgentTool<DeleteConnectionInput> = {
  name: "delete_connection",
  description:
    "PERMANENTLY DELETES a connection from the user's account. This destroys the stored credentials and cannot be undone. Requires user approval before execution.\n\nWARNING: This is a destructive action. Only use when the user explicitly wants to DELETE the connection itself (e.g., \"delete this connection\", \"remove from my account\").\nDO NOT use this tool if the user wants to remove or deactivate tools from a connection (e.g., \"remove {connection name}\") → use manage_activated_tools_for_connections instead",
  inputSchema,
  execute: async ({ connectionId }, context) => {
    const { data: connection, error } = await context.supabase
      .from("connections")
      .select("*")
      .eq("client_id", context.clientId)
      .eq("id", connectionId)
      .maybeSingle();

    if (error) {
      return { success: false as const, error: error.message };
    }

    if (!connection) {
      return { success: false as const, error: "Connection not found." };
    }

    const composio = getComposio();

    try {
      await composio.connectedAccounts.delete(connection.composio_connected_account_id);
    } catch (deleteError) {
      console.error("[delete_connection] Failed to delete Composio account.", deleteError);
    }

    const { error: deleteError } = await context.supabase
      .from("connections")
      .delete()
      .eq("client_id", context.clientId)
      .eq("id", connection.id);

    if (deleteError) {
      return { success: false as const, error: deleteError.message };
    }

    return {
      success: true as const,
      connectionId: connection.id,
      message: `Connection to ${connection.toolkit_slug} permanently deleted.`,
    };
  },
};
