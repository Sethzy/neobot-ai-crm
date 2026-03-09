/**
 * Connection-scoped Composio tool loading.
 * @module lib/composio/activated-tools
 */
import { jsonSchemaToZodSchema } from "@composio/core";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { getComposio } from "./client";

const EMPTY_TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {},
} as const;

/**
 * Loads only the activated tools for each active connection and prefixes each
 * tool name with the connection id so multi-connection tool routing stays unambiguous.
 */
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
): Promise<ToolSet> {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active" && connection.activated_tools.length > 0,
  );

  if (activeConnections.length === 0) {
    return {};
  }

  const composio = getComposio();
  const loadedTools: ToolSet = {};

  for (const connection of activeConnections) {
    try {
      const rawTools = await composio.tools.getRawComposioTools({
        tools: connection.activated_tools,
      });

      for (const rawTool of rawTools) {
        loadedTools[`${connection.id}__${rawTool.slug}`] = tool({
          description: rawTool.description ?? rawTool.slug,
          inputSchema: jsonSchemaToZodSchema<z.ZodTypeAny>(
            rawTool.inputParameters ?? EMPTY_TOOL_INPUT_SCHEMA,
          ),
          execute: async (args) =>
            composio.tools.execute(rawTool.slug, {
              connectedAccountId: connection.composio_connected_account_id,
              arguments: args,
              dangerouslySkipVersionCheck: true,
            }),
        });
      }
    } catch (error) {
      console.error(`[composio] Failed to load tools for connection ${connection.id}:`, error);
    }
  }

  return loadedTools;
}
