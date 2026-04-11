/**
 * manage_activated_tools_for_connections tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/manage-activated-tools
 */
import { z } from "zod";

import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  connections: z.array(
    z.object({
      connectionId: z.string().trim().min(1),
      activate: z.array(z.string().trim().min(1)),
      deactivate: z.array(z.string().trim().min(1)),
    }),
  ),
});

type ManageActivatedToolsInput = z.infer<typeof inputSchema>;

export const manageActivatedToolsForConnectionsTool: ManagedAgentTool<ManageActivatedToolsInput> = {
  name: "manage_activated_tools_for_connections",
  description:
    "Activates or deactivates tools for connections. Requires user approval before execution.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools then appear in your tool context by their plain slug, for example GMAIL_SEND_EMAIL. If you don't see the tool you need, try activating it first.\nTo discover the full set of tools that are available for each connection before activating them call get_connection_details.\n\nIf your connection has an associated skills file you MUST read and follow the instructions in the skills file before using any tools from that connection.",
  inputSchema,
  execute: async ({ connections: connectionRequests }, context) => {
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
      const { data: connection, error } = await context.supabase
        .from("connections")
        .select("*")
        .eq("client_id", context.clientId)
        .eq("id", connectionRequest.connectionId)
        .maybeSingle();

      if (error) {
        return { success: false as const, error: error.message };
      }

      if (!connection) {
        results.push({
          connectionId: connectionRequest.connectionId,
          error: "Connection not found.",
        });
        continue;
      }

      const rawTools = await composio.tools.getRawComposioTools({
        toolkits: [connection.toolkit_slug],
        limit: COMPOSIO_TOOL_FETCH_LIMIT,
      });
      const allToolSlugs = new Set(rawTools.map((rawTool) => rawTool.slug));
      const invalidActivate = connectionRequest.activate.filter((toolSlug) => !allToolSlugs.has(toolSlug));
      const invalidDeactivate = connectionRequest.deactivate.filter((toolSlug) => !allToolSlugs.has(toolSlug));

      if (invalidActivate.length > 0 || invalidDeactivate.length > 0) {
        results.push({
          connectionId: connection.id,
          error: `Unknown tools: ${[...invalidActivate, ...invalidDeactivate].join(", ")}`,
        });
        continue;
      }

      const nextActivatedTools = new Set(connection.activated_tools);
      connectionRequest.activate.forEach((toolSlug) => nextActivatedTools.add(toolSlug));
      connectionRequest.deactivate.forEach((toolSlug) => nextActivatedTools.delete(toolSlug));

      const activatedTools = Array.from(nextActivatedTools);
      const { error: updateError } = await context.supabase
        .from("connections")
        .update({ activated_tools: activatedTools })
        .eq("client_id", context.clientId)
        .eq("id", connection.id);

      if (updateError) {
        return { success: false as const, error: updateError.message };
      }

      const activatedToolSet = new Set(activatedTools);
      results.push({
        connectionId: connection.id,
        userAction: "approved",
        tools: {
          activated: rawTools.filter((rawTool) => activatedToolSet.has(rawTool.slug)).map((rawTool) => rawTool.slug),
          deactivated: rawTools.filter((rawTool) => !activatedToolSet.has(rawTool.slug)).map((rawTool) => rawTool.slug),
        },
        skills:
          connection.activated_tools.length === 0 && activatedTools.length > 0
            ? `Check for a connection skill file at: /agent/skills/connections/${connection.id}/SKILL.md - not all connections have one.`
            : undefined,
      });
    }

    return { success: true as const, connections: results };
  },
};
