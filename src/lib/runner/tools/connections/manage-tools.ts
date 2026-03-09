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
        "Activates or deactivates tools for existing connections. Activated tools become available with names prefixed by the connection ID. Use get_details_for_connections first if you need the exact tool names.",
      inputSchema: manageToolsInputSchema,
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
