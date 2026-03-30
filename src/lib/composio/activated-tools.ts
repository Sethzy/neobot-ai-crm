/**
 * Connection-scoped Composio tool loading from cached DB schemas.
 * Falls back to Composio API for pre-migration connections with empty tool_schemas.
 * @module lib/composio/activated-tools
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonSchema, tool, type ToolSet } from "ai";

import { updateConnection } from "@/lib/connections/queries";
import type { ConnectionRow } from "@/lib/connections/schemas";
import type { Database } from "@/types/database";

import { unlink } from "node:fs/promises";

import type { AgentFileClient } from "@/lib/storage/agent-files";
import { AGENT_ROOT } from "@/lib/storage/agent-paths";

import { getComposio } from "./client";
import { bridgeDownloadedFile, findDownloadedFile, resolveAgentPathForUpload } from "./file-bridge";

const EMPTY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {},
};

type ChatSupabaseClient = SupabaseClient<Database>;

interface LoadActivatedConnectionToolsOptions {
  supabase?: ChatSupabaseClient;
  clientId?: string;
  /** Agent file client for persisting downloaded files to storage. */
  fileClient?: Pick<AgentFileClient, "uploadArtifact" | "downloadBinary">;
  /** Returns the active sandbox instance, or null if not yet booted. */
  getSandbox?: () => { writeFiles: (files: { path: string; content: Buffer }[]) => Promise<void> } | null;
}

/**
 * Loads only the activated tools for each active connection using cached schemas
 * from the DB row. Falls back to Composio API when schemas are missing (pre-migration rows).
 * Prefixes each tool name with the connection id so multi-connection tool routing stays unambiguous.
 */
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
  options?: LoadActivatedConnectionToolsOptions,
): Promise<ToolSet> {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active" && connection.activated_tools.length > 0,
  );

  if (activeConnections.length === 0) {
    return {};
  }

  const composio = getComposio();

  const toolSets = await Promise.all(activeConnections.map(async (connection) => {
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

        if (options?.supabase && options.clientId) {
          try {
            await updateConnection(options.supabase, options.clientId, {
              id: connection.id,
              tool_schemas: schemas,
            });
          } catch (error) {
            console.warn(
              `[composio] Failed to persist cached schemas for connection ${connection.id}:`,
              error,
            );
          }
        }
      }

      const connectionTools: ToolSet = {};
      for (const slug of connection.activated_tools) {
        const schema = schemas[slug];
        if (!schema) {
          console.warn(`[composio] No cached schema for ${slug} on connection ${connection.id}, skipping`);
          continue;
        }

        connectionTools[`${connection.id}__${slug}`] = tool({
          description: schema.description ?? slug,
          inputSchema: jsonSchema(
            schema.inputParameters ?? EMPTY_TOOL_INPUT_SCHEMA,
          ),
          execute: async (args) => {
            let resolvedArgs = args as Record<string, unknown>;
            const uploadTempPaths: string[] = [];

            // Upload direction: resolve /agent/ paths to local temp files
            if (options?.fileClient) {
              for (const [key, value] of Object.entries(resolvedArgs)) {
                if (typeof value === "string" && value.startsWith(AGENT_ROOT)) {
                  const tempPath = await resolveAgentPathForUpload({
                    agentPath: value,
                    fileClient: options.fileClient,
                  });
                  uploadTempPaths.push(tempPath);
                  resolvedArgs = { ...resolvedArgs, [key]: tempPath };
                }
              }
            }

            try {
              const result = await composio.tools.execute(slug, {
                connectedAccountId: connection.composio_connected_account_id,
                arguments: resolvedArgs,
                dangerouslySkipVersionCheck: true,
              });

              // Download direction: persist files to agent storage
              const fileData = findDownloadedFile(result?.data);
              if (options?.fileClient && fileData?.file_downloaded && fileData.uri) {
                const agentPath = await bridgeDownloadedFile({
                  fileData,
                  fileClient: options.fileClient,
                  getSandbox: options.getSandbox ?? (() => null),
                });

                return {
                  ...result,
                  data: {
                    ...(typeof result?.data === "object" ? result.data : {}),
                    uri: agentPath,
                    message: `File downloaded and saved to ${agentPath}`,
                  },
                };
              }

              return result;
            } finally {
              // Clean up upload temp files
              await Promise.all(
                uploadTempPaths.map((p) => unlink(p).catch(() => {})),
              );
            }
          },
        });
      }

      return connectionTools;
    } catch (error) {
      console.error(`[composio] Failed to load tools for connection ${connection.id}:`, error);
      return {};
    }
  }));

  return Object.assign({}, ...toolSets) as ToolSet;
}
