/**
 * list_composio_tools tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/list-composio-tools
 */
import { z } from "zod";

import {
  COMPOSIO_TOOL_FETCH_LIMIT,
  getComposio,
  getVersionedRawComposioTools,
  resolveToolkitVersion,
} from "@/lib/composio/client";

import {
  getSupportedProviderDisplayName,
  normalizeSupportedProviderSlug,
} from "../supported-providers";
import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  app: z.string().trim().min(1).describe(
    "The Composio app slug from list_connections.toolkitSlug (for example 'gmail', 'googledrive', 'googlecalendar', or 'notion').",
  ),
  action: z.string().trim().min(1).optional().describe(
    "Optional action slug to inspect before execution. When provided, the result includes that action's input schema.",
  ),
});

type ListComposioToolsInput = z.infer<typeof inputSchema>;

interface RawComposioTool {
  slug: string;
  name: string;
  description?: string | null;
  version?: string | null;
  inputParameters?: Record<string, unknown> | null;
  outputParameters?: Record<string, unknown> | null;
  toolkit?: {
    slug?: string | null;
  } | null;
}

function normalizeComposioAppSlug(app: string): string {
  return normalizeSupportedProviderSlug(app) ?? app.trim().toLowerCase();
}

function getRequiredInputFields(inputSchema: unknown): string[] {
  if (
    typeof inputSchema !== "object"
    || inputSchema === null
    || !Array.isArray((inputSchema as { required?: unknown }).required)
  ) {
    return [];
  }

  return (inputSchema as { required: unknown[] }).required.filter(
    (field): field is string => typeof field === "string",
  );
}

export const listComposioToolsTool: ManagedAgentTool<ListComposioToolsInput> = {
  name: "list_composio_tools",
  description:
    "Returns the Composio actions available for a connected app. Pass app as the toolkitSlug from list_connections, not the human display name. Call this before execute_composio_tool so you know which action slug to use. If you pass action as well, this also returns that action's input schema so you can construct execute_composio_tool.input correctly.",
  inputSchema,
  execute: async ({ app, action }, context) => {
    const toolkitSlug = normalizeComposioAppSlug(app);
    const { data: connection, error } = await context.supabase
      .from("connections")
      .select("id, toolkit_slug, display_name, status")
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
      const tools = await getVersionedRawComposioTools({
        toolkits: [toolkitSlug],
        limit: COMPOSIO_TOOL_FETCH_LIMIT,
      }) as RawComposioTool[];
      const displayName =
        connection.display_name ?? getSupportedProviderDisplayName(toolkitSlug);
      let selectedTool: {
        slug: string;
        name: string;
        description: string;
        version: string;
        inputSchema: Record<string, unknown> | null;
        outputSchema: Record<string, unknown> | null;
        requiredInputFields: string[];
      } | undefined;

      if (action) {
        const version = await resolveToolkitVersion(toolkitSlug);
        const rawTool = await getComposio().tools.getRawComposioToolBySlug(
          action,
          { version },
        ) as RawComposioTool;

        if (rawTool.toolkit?.slug && rawTool.toolkit.slug !== toolkitSlug) {
          return {
            success: false as const,
            error: `Action ${action} does not belong to toolkit ${toolkitSlug}.`,
          };
        }

        selectedTool = {
          slug: rawTool.slug,
          name: rawTool.name,
          description: rawTool.description ?? "",
          version: rawTool.version ?? version,
          inputSchema: rawTool.inputParameters ?? null,
          outputSchema: rawTool.outputParameters ?? null,
          requiredInputFields: getRequiredInputFields(rawTool.inputParameters),
        };
      }

      return {
        success: true as const,
        app: toolkitSlug,
        toolkitSlug,
        displayName,
        tools: tools.map((tool) => ({
          slug: tool.slug,
          name: tool.name,
          description: tool.description ?? "",
        })),
        ...(selectedTool ? { selectedTool } : {}),
      };
    } catch (loadError) {
      return {
        success: false as const,
        error: loadError instanceof Error ? loadError.message : "Failed to load Composio tools.",
      };
    }
  },
};
