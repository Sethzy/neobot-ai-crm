/**
 * reauthorize_connection tool for repairing an existing connection.
 * @module lib/runner/tools/connections/reauthorize-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import { getCallbackUrl } from "@/lib/composio/connection-flow";
import { getConnectionById, updateConnectionStatus } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the reauthorize_connection tool.
 */
export function createReauthorizeConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    reauthorize_connection: tool({
      description:
        "Re-authorizes an existing connection that has expired or needs refreshed permissions. Attempts silent refresh first, then falls back to a user-facing re-authorization URL if required.",
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

        if (connection.status === "pending") {
          return {
            success: false,
            error: "Connection is still pending initial authorization.",
          };
        }

        const composio = getComposio();

        try {
          await composio.connectedAccounts.refresh(connection.composio_connected_account_id);
          const refreshedConnection = await composio.connectedAccounts.get(
            connection.composio_connected_account_id,
          );

          if (refreshedConnection.status === "ACTIVE") {
            await updateConnectionStatus(supabase, clientId, connection.id, "active");

            return {
              success: true,
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
            redirectUrl: getCallbackUrl(connection.toolkit_slug, "reauth"),
          },
        );

        if (!refreshResult.redirect_url) {
          return {
            success: false,
            error: "Composio did not return a re-authorization URL.",
          };
        }

        await updateConnectionStatus(supabase, clientId, connection.id, "pending");

        return {
          success: true,
          connectionId: connection.id,
          status: "pending_reauth" as const,
          redirectUrl: refreshResult.redirect_url,
          message:
            "Send this re-authorization link to the user. The connection account cannot change.",
        };
      },
    }),
  };
}
