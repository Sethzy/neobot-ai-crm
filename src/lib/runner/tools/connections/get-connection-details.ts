/**
 * get_details_for_connections tool for connection-level capability inspection.
 * @module lib/runner/tools/connections/get-connection-details
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "@/lib/composio/client";
import { getConnectionsByIds } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

interface RawConnectionTool {
  slug: string;
  name: string;
  description?: string | null;
  inputParameters?: Record<string, unknown>;
}

/**
 * Creates a read-only tool that expands connections into activated and deactivated tool sets.
 */
export function createGetConnectionDetailsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    get_details_for_connections: tool({
      description:
        "Gets detailed information for the listed connections.\nReturns a full list of tools, including both activated and deactivated tools, for each connection, including full detailed descriptions and arguments if requested.\nAlso returns connectionId, serviceName, description, accountName, connectionType, toolCount, and other connection-specific details.\n\nUse this to:\n- Discover what actions you can perform with a connection before activating it\n- Check which tools are already activated for a connection\n- Verify exact tool names before activating connections",
      inputSchema: z.object({
        connectionIds: z
          .array(z.string().min(1))
          .describe("The connection IDs to inspect."),
        includeToolDetails: z
          .boolean()
          .describe(
            "Pass true to include each tool's description and arguments schema in the response.",
          ),
      }),
      execute: async ({ connectionIds, includeToolDetails }) => {
        const connections = await getConnectionsByIds(supabase, clientId, connectionIds);
        const composio = getComposio();

        const resolvedConnections = await Promise.all(
          connections.map(async (connection) => {
            const rawTools = (await composio.tools.getRawComposioTools({
              toolkits: [connection.toolkit_slug],
              limit: COMPOSIO_TOOL_FETCH_LIMIT,
            })) as RawConnectionTool[];
            const activatedToolSlugs = new Set(connection.activated_tools);

            const mapTool = (rawTool: RawConnectionTool) => {
              if (includeToolDetails) {
                return {
                  slug: rawTool.slug,
                  name: rawTool.name,
                  description: rawTool.description ?? "",
                  arguments: rawTool.inputParameters ?? {},
                };
              }

              return {
                slug: rawTool.slug,
                name: rawTool.name,
              };
            };

            return {
              connectionId: connection.id,
              serviceName: connection.toolkit_slug,
              description: connection.display_name ?? connection.toolkit_slug,
              accountName:
                connection.account_identifier ??
                connection.display_name ??
                connection.toolkit_slug,
              connectionType: "integrations" as const,
              status: connection.status,
              toolCount: rawTools.length,
              tools: {
                activated: rawTools
                  .filter((rawTool) => activatedToolSlugs.has(rawTool.slug))
                  .map(mapTool),
                deactivated: rawTools
                  .filter((rawTool) => !activatedToolSlugs.has(rawTool.slug))
                  .map(mapTool),
              },
            };
          }),
        );

        return {
          success: true,
          connections: resolvedConnections,
        };
      },
    }),
  };
}
