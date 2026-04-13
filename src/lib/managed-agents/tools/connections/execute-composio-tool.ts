/**
 * execute_composio_tool tool for managed agents.
 *
 * Resolves the required toolkit version dynamically via `composio.toolkits.get()`
 * and caches it per-app for the lifetime of the process.
 *
 * @module lib/managed-agents/tools/connections/execute-composio-tool
 */
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";

import type { ManagedAgentTool } from "../types";

/**
 * Module-level cache: toolkit slug → pinned version string.
 * Survives across requests within the same serverless invocation.
 */
const toolkitVersionCache = new Map<string, string>();

/**
 * Resolves the current version for a Composio toolkit.
 * Results are cached per-app to avoid repeated API calls.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveToolkitVersion(composio: any, app: string): Promise<string> {
  const cached = toolkitVersionCache.get(app);
  if (cached) return cached;

  const toolkit = await composio.toolkits.get(app);
  const versions: string[] | undefined = toolkit.meta?.availableVersions;

  if (!versions?.length) {
    throw new Error(`No available versions found for toolkit "${app}".`);
  }

  // availableVersions is newest-first — pin to the latest
  const version = versions[0];
  toolkitVersionCache.set(app, version);
  return version;
}

/** @internal Exposed for test isolation — clears the cached toolkit versions. */
export function _resetToolkitVersionCache(): void {
  toolkitVersionCache.clear();
}

const inputSchema = z.object({
  app: z.string().min(1),
  action: z.string().min(1).describe("The action slug returned by list_composio_tools (e.g., 'GMAIL_SEND_EMAIL')."),
  input: z.record(z.string(), z.unknown()).describe("Action-specific parameters as a JSON object."),
});

type ExecuteComposioToolInput = z.infer<typeof inputSchema>;

export const executeComposioToolTool: ManagedAgentTool<ExecuteComposioToolInput> = {
  name: "execute_composio_tool",
  description:
    "Executes a Composio action on behalf of the current user. Call list_composio_tools first to discover available actions for the app. Returns the action's raw output on success, or an error message on failure.",
  inputSchema,
  execute: async ({ app, action, input }, context) => {
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
      // SDK typings in @composio/core are looser than the runtime shape here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const composio = getComposio() as any;
      const version = await resolveToolkitVersion(composio, app);
      const result = await composio.tools.execute(action, {
        userId: context.clientId,
        arguments: input,
        version,
      });

      return { success: true as const, app, action, result };
    } catch (executeError) {
      return {
        success: false as const,
        error: executeError instanceof Error ? executeError.message : "Failed to execute Composio tool.",
      };
    }
  },
};
