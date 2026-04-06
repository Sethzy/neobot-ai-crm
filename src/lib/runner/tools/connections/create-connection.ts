/**
 * create_new_connections tool for initiating external service connections.
 * @module lib/runner/tools/connections/create-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getCallbackUrl, initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { getConnectionByToolkit, insertConnection } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

const createConnectionInputSchema = z.object({
  integrations: z.array(
    z.object({
      integrationId: z.string().trim().min(1),
      toolsToActivate: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
});

/**
 * Creates the create_new_connections tool.
 */
export function createCreateConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    create_new_connections: tool({
      description:
        "Creates new Composio OAuth integrations.\nDisplays a UI card where the user can choose to create each connection or skip it.\nCreating a connection authenticates the user to the service and then saves the connection to the user's account so they can use it in other agents in the future.\n\nIMPORTANT: You MUST read /agent/skills/system/creating-connections/SKILL.md for detailed setup instructions before using this tool.\n\nYou can request multiple integrations at once.\n\nFor each connection creation request returns:\n- userAction: 'created' if user authorized, 'skipped' if user declined.\n\nIf successfully created, also returns:\n- connectionId: the new connection ID. Don't mention the connectionId to the user.\n- tools: { activated: string[], deactivated: string[] } - list of all connection tool names by activation state\n- connection-specific details",
      inputSchema: createConnectionInputSchema,
      execute: async ({ integrations }) => {
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
          const callbackUrl = getCallbackUrl(integration.integrationId);
          const toolkitDisplayInfo = await getToolkitDisplayInfo(integration.integrationId)
            .catch(() => ({
              integrationId: integration.integrationId,
              displayName: integration.integrationId,
              description: "",
            }));
          const existingConnection = await getConnectionByToolkit(
            supabase,
            clientId,
            integration.integrationId,
          );

          if (existingConnection) {
            results.push({
              integrationId: integration.integrationId,
              error: "Already connected. Delete the existing connection first.",
            });
            continue;
          }

          const { redirectUrl, connectedAccountId } = await initiateOAuthFlow({
            composioUserId: clientId,
            toolkitSlug: integration.integrationId,
            callbackUrl,
          });

          await insertConnection(supabase, {
            client_id: clientId,
            composio_connected_account_id: connectedAccountId,
            toolkit_slug: integration.integrationId,
            display_name: null,
            account_identifier: null,
            status: "pending",
            activated_tools: integration.toolsToActivate ?? [],
            tool_count: 0,
          });

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
          success: true,
          message: hasPendingAuthCard
            ? "Connection cards are ready in chat for the user to complete authorization. After they finish, use list_users_connections to verify the connections were created."
            : "No new connection cards were created. Review the per-integration errors and resolve those before retrying.",
          results,
        };
      },
    }),
  };
}
