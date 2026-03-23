/**
 * Connection-scoped Composio tool loading from cached DB schemas.
 * Falls back to Composio API for pre-migration connections with empty tool_schemas.
 * @module lib/composio/activated-tools
 */
import { jsonSchema, tool, type ToolSet } from "ai";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { getComposio } from "./client";

const EMPTY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {},
};

/**
 * Loads only the activated tools for each active connection using cached schemas
 * from the DB row. Falls back to Composio API when schemas are missing (pre-migration rows).
 * Prefixes each tool name with the connection id so multi-connection tool routing stays unambiguous.
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
      let schemas = connection.tool_schemas ?? {};

      // Fallback: pre-migration rows have empty tool_schemas. Fetch from Composio API
      // and use the raw tool definitions directly. This path will be eliminated once
      // all existing connections have been re-activated (which caches their schemas).
      const hasCachedSchemas = Object.keys(schemas).length > 0;
      if (!hasCachedSchemas) {
        console.warn(`[composio] No cached schemas for connection ${connection.id}, falling back to API`);
        const rawTools = await composio.tools.getRawComposioTools({
          tools: connection.activated_tools,
        });
        schemas = {};
        for (const rawTool of rawTools) {
          schemas[rawTool.slug] = {
            description: rawTool.description ?? null,
            inputParameters: rawTool.inputParameters ?? null,
          };
        }
      }

      for (const slug of connection.activated_tools) {
        const schema = schemas[slug];
        if (!schema) {
          console.warn(`[composio] No cached schema for ${slug} on connection ${connection.id}, skipping`);
          continue;
        }

        loadedTools[`${connection.id}__${slug}`] = tool({
          description: schema.description ?? slug,
          inputSchema: jsonSchema(
            schema.inputParameters ?? EMPTY_TOOL_INPUT_SCHEMA,
          ),
          execute: async (args) =>
            composio.tools.execute(slug, {
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
