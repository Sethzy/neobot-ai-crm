/**
 * reauthorize_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/reauthorize-connection
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import { getCallbackUrl } from "@/lib/composio/connection-flow";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  connectionId: z.string().trim().min(1),
});

type ReauthorizeConnectionInput = z.infer<typeof inputSchema>;

export const reauthorizeConnectionTool: ManagedAgentTool<ReauthorizeConnectionInput> = {
  name: "reauthorize_connection",
  description:
    "Re-authorizes an existing connection that has expired or needs new permissions. Displays a UI card where the user can complete the auth flow to re-authorize the connection.\n\nUse this tool if and only if there were authorization errors with a connection or the user explicitly asks you to.\nThe connection must already exist in the user's account.\nRe-authorizing cannot change which account the connection is logged into in the external service.",
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

    if (connection.status === "pending") {
      return { success: false as const, error: "Connection is still pending initial authorization." };
    }

    const composio = getComposio();

    try {
      await composio.connectedAccounts.refresh(connection.composio_connected_account_id);
      const refreshedConnection = await composio.connectedAccounts.get(
        connection.composio_connected_account_id,
      );

      if (refreshedConnection.status === "ACTIVE") {
        const { error: updateError } = await context.supabase
          .from("connections")
          .update({ status: "active" })
          .eq("client_id", context.clientId)
          .eq("id", connection.id);

        if (updateError) {
          return { success: false as const, error: updateError.message };
        }

        return {
          success: true as const,
          connectionId: connection.id,
          status: "reauthorized" as const,
          message: "Connection credentials refreshed successfully.",
        };
      }
    } catch {
      // Silent refresh failed, so fall through to redirect-based re-authorization.
    }

    const refreshResult = await composio.connectedAccounts.refresh(
      connection.composio_connected_account_id,
      {
        redirectUrl: getCallbackUrl(connection.toolkit_slug, {
          reason: "reauth",
          ...(context.threadId ? { threadId: context.threadId } : {}),
        }),
      },
    );

    if (!refreshResult.redirect_url) {
      return { success: false as const, error: "Composio did not return a re-authorization URL." };
    }

    const { error: updateError } = await context.supabase
      .from("connections")
      .update({ status: "pending" })
      .eq("client_id", context.clientId)
      .eq("id", connection.id);

    if (updateError) {
      return { success: false as const, error: updateError.message };
    }

    return {
      success: true as const,
      connectionId: connection.id,
      status: "pending_reauth" as const,
      redirectUrl: refreshResult.redirect_url,
      message: "Send this re-authorization link to the user. The connection account cannot change.",
    };
  },
};
