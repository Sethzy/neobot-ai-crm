/**
 * manage_activated_tools_for_connections tool for per-connection tool activation.
 * @module lib/runner/tools/connections/manage-tools
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import { getConnectionById, updateConnectionActivatedTools } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

const manageToolsInputSchema = z.object({
  connections: z.array(
    z.object({
      connectionId: z.string().trim().min(1),
      activate: z.array(z.string().trim().min(1)),
      deactivate: z.array(z.string().trim().min(1)),
    }),
  ),
});

/**
 * Creates the manage_activated_tools_for_connections tool.
 */
export function createManageToolsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    manage_activated_tools_for_connections: tool({
      description:
        "Activates or deactivates tools for connections.\nChanging activation status of tools requires the user to approve the permission changes, so a UI card will be displayed to the user where they can approve or reject the changes.\nThe tool will return after the user approves or rejects the permission changes.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- userAction: 'approved' if user approved the changes, 'skipped' if user rejected\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.\nTo discover the full set of tools that are available for each connection before activating them call get_details_for_connections.\n\nIf your connection has an associated skills file you MUST read and follow the instructions in the skills file before using any tools from that connection.",
      inputSchema: manageToolsInputSchema,
      needsApproval: true,
      execute: async ({ connections: connectionRequests }) => {
        const composio = getComposio();
        const results: Array<
          | {
              connectionId: string;
              userAction: "approved";
              tools: { activated: string[]; deactivated: string[] };
              skills?: string;
            }
          | { connectionId: string; error: string }
        > = [];

        for (const connectionRequest of connectionRequests) {
          const connection = await getConnectionById(
            supabase,
            clientId,
            connectionRequest.connectionId,
          );

          if (!connection) {
            results.push({
              connectionId: connectionRequest.connectionId,
              error: "Connection not found.",
            });
            continue;
          }

          const rawTools = await composio.tools.getRawComposioTools({
            toolkits: [connection.toolkit_slug],
          });
          const allToolSlugs = new Set(rawTools.map((rawTool) => rawTool.slug));
          const invalidActivate = connectionRequest.activate.filter(
            (toolSlug) => !allToolSlugs.has(toolSlug),
          );
          const invalidDeactivate = connectionRequest.deactivate.filter(
            (toolSlug) => !allToolSlugs.has(toolSlug),
          );

          if (invalidActivate.length > 0 || invalidDeactivate.length > 0) {
            results.push({
              connectionId: connection.id,
              error: `Unknown tools: ${[...invalidActivate, ...invalidDeactivate].join(", ")}`,
            });
            continue;
          }

          const nextActivatedTools = new Set(connection.activated_tools);

          connectionRequest.activate.forEach((toolSlug) => {
            nextActivatedTools.add(toolSlug);
          });
          connectionRequest.deactivate.forEach((toolSlug) => {
            nextActivatedTools.delete(toolSlug);
          });

          const activatedTools = Array.from(nextActivatedTools);
          await updateConnectionActivatedTools(supabase, clientId, connection.id, activatedTools);

          const activatedToolSet = new Set(activatedTools);
          results.push({
            connectionId: connection.id,
            userAction: "approved",
            tools: {
              activated: rawTools
                .filter((rawTool) => activatedToolSet.has(rawTool.slug))
                .map((rawTool) => rawTool.slug),
              deactivated: rawTools
                .filter((rawTool) => !activatedToolSet.has(rawTool.slug))
                .map((rawTool) => rawTool.slug),
            },
            skills:
              connection.activated_tools.length === 0 && activatedTools.length > 0
                ? `Check for a connection skill file at: /agent/skills/connections/${connection.id}/SKILL.md - not all connections have one.`
                : undefined,
          });
        }

        return {
          success: true,
          connections: results,
        };
      },
    }),
  };
}
