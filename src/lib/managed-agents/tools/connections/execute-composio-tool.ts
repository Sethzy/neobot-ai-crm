/**
 * execute_composio_tool tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/execute-composio-tool
 */
import { z } from "zod";

import {
  _resetComposioToolkitVersionCache,
  getComposio,
  resolveToolkitVersion,
} from "@/lib/composio/client";

import { normalizeSupportedProviderSlug } from "../supported-providers";
import type { ManagedAgentTool } from "../types";

interface RawComposioTool {
  toolkit?: {
    slug?: string | null;
  } | null;
}

/** @internal Exposed for test isolation — clears the cached toolkit versions. */
export function _resetToolkitVersionCache(): void {
  _resetComposioToolkitVersionCache();
}

function normalizeComposioAppSlug(app: string): string {
  return normalizeSupportedProviderSlug(app) ?? app.trim().toLowerCase();
}

const inputSchema = z.object({
  app: z.string().trim().min(1).describe(
    "The toolkitSlug returned by list_connections or used with list_composio_tools.",
  ),
  action: z.string().min(1).describe("The action slug returned by list_composio_tools (e.g., 'GMAIL_SEND_EMAIL')."),
  input: z.record(z.string(), z.unknown()).describe("Top-level input object containing action-specific arguments."),
});

type ExecuteComposioToolInput = z.infer<typeof inputSchema>;

export const executeComposioToolTool: ManagedAgentTool<ExecuteComposioToolInput> = {
  name: "execute_composio_tool",
  description:
    "Executes a Composio action on behalf of the current user. " +
    "Top-level shape: { app, action, input }. Put the selected action's arguments inside input. " +
    "DO NOT wrap the whole call in a payload, params, body, request, or arguments object. " +
    "Pass app as the toolkitSlug from list_connections. Call list_composio_tools first to discover available actions, and call it again with app + action when you need that action's input schema before execution. Returns the action's raw output on success, or an error message on failure.",
  inputSchema,
  execute: async ({ app, action, input }, context) => {
    const toolkitSlug = normalizeComposioAppSlug(app);
    const { data: connection, error } = await context.supabase
      .from("connections")
      .select("id, toolkit_slug, status")
      .eq("client_id", context.clientId)
      .eq("toolkit_slug", toolkitSlug)
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
        error: `No active ${toolkitSlug} connection found. Create or re-authorize the connection first.`,
      };
    }

    try {
      // SDK typings in @composio/core are looser than the runtime shape here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const composio = getComposio() as any;
      const version = await resolveToolkitVersion(toolkitSlug);
      const rawTool = await composio.tools.getRawComposioToolBySlug(
        action,
        { version },
      ) as RawComposioTool;

      if (rawTool.toolkit?.slug && rawTool.toolkit.slug !== toolkitSlug) {
        return {
          success: false as const,
          error: `Action ${action} does not belong to toolkit ${toolkitSlug}.`,
        };
      }

      const result = await composio.tools.execute(action, {
        userId: context.clientId,
        arguments: input,
        version,
      });

      return { success: true as const, app: toolkitSlug, action, result };
    } catch (executeError) {
      return {
        success: false as const,
        error: executeError instanceof Error ? executeError.message : "Failed to execute Composio tool.",
      };
    }
  },
};
