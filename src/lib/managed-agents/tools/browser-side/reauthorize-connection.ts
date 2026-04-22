/**
 * reauthorize_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/reauthorize-connection
 */
import { z } from "zod";

import { getCachedToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getComposio } from "@/lib/composio/client";
import { getCallbackUrl } from "@/lib/composio/connection-flow";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  connectionId: z.string().trim().min(1),
});

type ReauthorizeConnectionInput = z.infer<typeof inputSchema>;

export const reauthorizeConnectionTool: ManagedAgentTool<ReauthorizeConnectionInput> = {
  name: "reauthorize_connection",
  description: [
    "Refresh the stored credentials for an existing connection whose OAuth has expired or is returning auth errors.",
    "",
    "Use this when:",
    "- The user says a provider has stopped working and the error looks authentication-related.",
    "- A provider action failed because the saved connection needs to be refreshed.",
    "",
    "An inline auth card appears in chat when browser reauthorization is required. END YOUR TURN after calling this tool. Reauthorization finishes on the user's next message.",
    "Reauthorization cannot change which account is connected. If the user wants a different account, call delete_connection first, then create_connection.",
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
          .update({
            status: "active",
            auth_redirect_url: null,
            auth_redirect_expires_at: null,
          })
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

    const redirectUrl = refreshResult.redirect_url
      ?? (refreshResult as { redirectUrl?: string }).redirectUrl;

    if (!redirectUrl) {
      return { success: false as const, error: "Composio did not return a re-authorization URL." };
    }

    const rawAuthRedirectExpiresAt = (refreshResult as {
      expiresAt?: string | null;
      expires_at?: string | null;
    }).expires_at
      ?? (refreshResult as { expiresAt?: string | null; expires_at?: string | null }).expiresAt;
    const authRedirectExpiresAt = typeof rawAuthRedirectExpiresAt === "string"
      && Number.isFinite(Date.parse(rawAuthRedirectExpiresAt))
      ? new Date(Date.parse(rawAuthRedirectExpiresAt)).toISOString()
      : null;
    const { error: updateError } = await context.supabase
      .from("connections")
      .update({
        auth_redirect_url: redirectUrl,
        auth_redirect_expires_at: authRedirectExpiresAt,
      })
      .eq("client_id", context.clientId)
      .eq("id", connection.id);

    if (updateError) {
      return { success: false as const, error: updateError.message };
    }

    const toolkitDisplayInfo = await getCachedToolkitDisplayInfo(connection.toolkit_slug).catch(() => ({
      integrationId: connection.toolkit_slug,
      displayName: connection.toolkit_slug,
      description: "",
      logoUrl: null,
    }));

    return {
      success: true as const,
      connectionId: connection.id,
      status: "pending_reauth" as const,
      redirectUrl,
      integrationId: connection.toolkit_slug,
      displayName: toolkitDisplayInfo.displayName,
      description: toolkitDisplayInfo.description,
      logoUrl: toolkitDisplayInfo.logoUrl ?? null,
      connectionStatus: "pending_reauth" as const,
      authRedirectExpiresAt,
      composioConnectedAccountId: connection.composio_connected_account_id,
      message:
        "A reauthorization card is now visible in chat. End this turn. The provider becomes usable again on the user's next message after OAuth completes.",
    };
  },
};
