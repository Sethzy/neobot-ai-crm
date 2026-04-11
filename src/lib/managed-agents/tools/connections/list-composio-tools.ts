/**
 * list_composio_tools tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/list-composio-tools
 */
import { z } from "zod";

import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  app: z.string().min(1).describe(
    "The Composio app slug (e.g., 'gmail', 'googledrive', 'googlecalendar', 'notion').",
  ),
});

type ListComposioToolsInput = z.infer<typeof inputSchema>;

export const listComposioToolsTool: ManagedAgentTool<ListComposioToolsInput> = {
  name: "list_composio_tools",
  description:
    "Returns the Composio actions available for a connected app (gmail, googledrive, googlecalendar, notion, etc.). Call this FIRST before execute_composio_tool so you know which action slug to use. You must have an active connection to the app (via create_connection) before this returns results.",
  inputSchema,
  execute: async ({ app }, context) => {
    const { data: connection, error } = await context.supabase
      .from("connections")
      .select("id, toolkit_slug, status")
      .eq("client_id", context.clientId)
      .eq("toolkit_slug", app)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false as const, error: error.message };
    }

    if (!connection) {
      return {
        success: false as const,
        error: `No active ${app} connection found. Create or re-authorize the connection first.`,
      };
    }

    try {
      const composio = getComposio();
      const tools = await composio.tools.getRawComposioTools({
        toolkits: [app],
        limit: COMPOSIO_TOOL_FETCH_LIMIT,
      });

      return {
        success: true as const,
        app,
        tools: tools.map((tool) => ({
          slug: tool.slug,
          name: tool.name,
          description: tool.description ?? "",
        })),
      };
    } catch (loadError) {
      return {
        success: false as const,
        error: loadError instanceof Error ? loadError.message : "Failed to load Composio tools.",
      };
    }
  },
};
