/**
 * delete_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/delete-connection
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";

import { getSupportedProviderDisplayName } from "../supported-providers";
import type { ManagedAgentTool } from "../types";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

const inputSchema = z.object({
  connectionId: z.string().trim().min(1),
});

type DeleteConnectionInput = z.infer<typeof inputSchema>;

export const deleteConnectionTool: ManagedAgentTool<DeleteConnectionInput> = {
  name: "delete_connection",
  description: [
    "Disconnect a provider. PERMANENTLY deletes the stored OAuth credentials and the connections row for the specified connectionId. This cannot be undone.",
    "",
    "Use this when the user explicitly wants to remove a provider from their account (\"disconnect Notion\", \"remove Gmail\").",
    "If the user is reporting that a connection has stopped working, use reauthorize_connection instead.",
    "If the user wants to switch to a different account for the same provider, call this first, then create_connection.",
  ].join("\n"),
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

    const displayName =
      connection.display_name ?? getSupportedProviderDisplayName(connection.toolkit_slug);

    return {
      success: true as const,
      connectionId: connection.id,
      displayName,
      message: `${displayName} connection permanently deleted.`,
    };
  },
};
