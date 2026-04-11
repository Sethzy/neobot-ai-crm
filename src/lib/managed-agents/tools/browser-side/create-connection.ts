/**
 * create_connection tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/create-connection
 */
import { z } from "zod";

import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getCallbackUrl, initiateOAuthFlow } from "@/lib/composio/connection-flow";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  integrations: z.array(
    z.object({
      integrationId: z.string().trim().min(1),
      toolsToActivate: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
});

type CreateConnectionInput = z.infer<typeof inputSchema>;

export const createConnectionTool: ManagedAgentTool<CreateConnectionInput> = {
  name: "create_connection",
  description:
    "Creates new Composio OAuth integrations.\nDisplays a UI card where the user can choose to create each connection or skip it.\nCreating a connection authenticates the user to the service and then saves the connection to the user's account so they can use it in other agents in the future.\n\nIMPORTANT: You MUST read /agent/skills/system/creating-connections/SKILL.md for detailed setup instructions before using this tool.\n\nYou can request multiple integrations at once.\n\nFor each connection creation request returns:\n- userAction: 'created' if user authorized, 'skipped' if user declined.\n\nIf successfully created, also returns:\n- connectionId: the new connection ID. Don't mention the connectionId to the user.\n- tools: { activated: string[], deactivated: string[] } - list of all connection tool names by activation state\n- connection-specific details",
  inputSchema,
  execute: async ({ integrations }, context) => {
    const results: Array<
      | {
          integrationId: string;
          displayName: string;
          description: string;
          connectionStatus: "pending_auth";
          redirectUrl: string;
          composioConnectedAccountId: string;
        }
      | {
          integrationId: string;
          error: string;
        }
    > = [];

    for (const integration of integrations) {
      const callbackUrl = getCallbackUrl(integration.integrationId, context.threadId ? { threadId: context.threadId } : undefined);
      const toolkitDisplayInfo = await getToolkitDisplayInfo(integration.integrationId).catch(() => ({
        integrationId: integration.integrationId,
        displayName: integration.integrationId,
        description: "",
      }));

      const { data: existingConnection, error } = await context.supabase
        .from("connections")
        .select("*")
        .eq("client_id", context.clientId)
        .eq("toolkit_slug", integration.integrationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { success: false as const, error: error.message };
      }

      if (existingConnection) {
        results.push({
          integrationId: integration.integrationId,
          error: "Already connected. Delete the existing connection first.",
        });
        continue;
      }

      const { redirectUrl, connectedAccountId } = await initiateOAuthFlow({
        composioUserId: context.clientId,
        toolkitSlug: integration.integrationId,
        callbackUrl,
      });

      const { error: insertError } = await context.supabase
        .from("connections")
        .insert({
          client_id: context.clientId,
          composio_connected_account_id: connectedAccountId,
          toolkit_slug: integration.integrationId,
          display_name: null,
          account_identifier: null,
          status: "pending",
          activated_tools: integration.toolsToActivate ?? [],
          tool_count: 0,
        });

      if (insertError) {
        return { success: false as const, error: insertError.message };
      }

      results.push({
        integrationId: integration.integrationId,
        displayName: toolkitDisplayInfo.displayName,
        description: toolkitDisplayInfo.description,
        connectionStatus: "pending_auth",
        redirectUrl,
        composioConnectedAccountId: connectedAccountId,
      });
    }

    const hasPendingAuthCard = results.some((result) => "connectionStatus" in result);

    return {
      success: true as const,
      message: hasPendingAuthCard
        ? "Connection cards are ready in chat for the user to complete authorization. After they finish, use list_connections to verify the connections were created."
        : "No new connection cards were created. Review the per-integration errors and resolve those before retrying.",
      results,
    };
  },
};
