/**
 * create_new_connections tool for initiating external service connections.
 * @module lib/runner/tools/connections/create-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getToolkitDisplayInfo } from "@/lib/composio/catalog";
import { getCallbackUrl, initiateOAuthFlow } from "@/lib/composio/connection-flow";
import { getActiveConnectionsByToolkit, insertConnection } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

const createConnectionInputSchema = z.object({
  connection: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("integrations"),
      integrations: z.array(
        z.object({
          integrationId: z.string().trim().min(1),
          toolsToActivate: z.array(z.string().trim().min(1)).optional(),
        }),
      ),
    }),
    z.object({
      type: z.literal("mcp"),
      displayName: z.string().optional(),
      serverUrl: z.string().optional(),
    }),
    z.object({
      type: z.literal("direct_api"),
      serviceName: z.string(),
      description: z.string(),
      connectionName: z.string(),
      baseUrl: z.string(),
      methods: z.array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])),
      authConfig: z.record(z.string(), z.unknown()),
      notes: z.string(),
      testCases: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
    z.object({
      type: z.literal("computer_use"),
      displayName: z.string(),
    }),
  ]),
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
        "Creates new connections to external services.\nDisplays a UI card where the user can choose to create each connection or skip it.\nCreating a connection will authenticate the user to the service and then save the connection to the user's account so they can use it in other agents in the future.\n\nIMPORTANT: You MUST read /agent/skills/system/creating-connections/SKILL.md for detailed setup instructions before using this tool.\n\nSupports the creation of 4 different types of connections: pre-built integrations, custom MCP, Direct API (HTTP) and Computer Use.\nFor pre-built integrations supports the creation of multiple connections at once. All others support only one connection creation at a time.\n\nFor each connection creation request returns:\n- userAction: 'created' if user authorized, 'skipped' if user declined.\n\nIf successfully created, also returns:\n- connectionId: the new connection ID. Don't mention the connectionId to the user.\n- tools: { activated: string[], deactivated: string[] } - list of all connection tool names by activation state\n- connection-specific details",
      inputSchema: createConnectionInputSchema,
      execute: async ({ connection }) => {
        if (connection.type === "mcp") {
          return {
            success: false,
            error: "MCP connections require manual setup. Contact the Sunder team.",
          };
        }

        if (connection.type === "direct_api") {
          return {
            success: false,
            error: "Direct API connections require manual setup. Contact the Sunder team.",
          };
        }

        if (connection.type === "computer_use") {
          return {
            success: false,
            error: "Computer Use connections are not yet available.",
          };
        }

        const results: Array<{
          integrationId: string;
          displayName: string;
          description: string;
          connectionStatus: "pending_auth";
          redirectUrl: string;
          composioConnectedAccountId: string;
          existingConnections:
            | Array<{ connectionId: string; accountIdentifier: string | null }>
            | undefined;
        }> = [];

        for (const integration of connection.integrations) {
          const callbackUrl = getCallbackUrl(integration.integrationId);
          const toolkitDisplayInfo = await getToolkitDisplayInfo(integration.integrationId);
          const existingConnections = await getActiveConnectionsByToolkit(
            supabase,
            clientId,
            integration.integrationId,
          );
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
            existingConnections:
              existingConnections.length > 0
                ? existingConnections.map((existingConnection) => ({
                    connectionId: existingConnection.id,
                    accountIdentifier: existingConnection.account_identifier,
                  }))
                : undefined,
          });
        }

        return {
          success: true,
          message:
            "Send these authorization links to the user. After they complete authorization, use list_users_connections to verify the connections were created.",
          results,
        };
      },
    }),
  };
}
