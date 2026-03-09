/**
 * create_new_connections tool for initiating external service connections.
 * @module lib/runner/tools/connections/create-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

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
        "Creates new connections to external services. For integrations, initiates OAuth and returns a redirect URL for the user to complete authorization. If /agent/skills/system/creating-connections/SKILL.md exists, you MUST read it before using this tool.",
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
          connectionStatus: "pending_auth";
          redirectUrl: string;
          existingConnections:
            | Array<{ connectionId: string; accountIdentifier: string | null }>
            | undefined;
        }> = [];

        for (const integration of connection.integrations) {
          const callbackUrl = getCallbackUrl(integration.integrationId);
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
            connectionStatus: "pending_auth",
            redirectUrl,
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
