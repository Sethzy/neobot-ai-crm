/**
 * User-scoped Composio tool loading for active connections.
 * @module lib/composio/activated-tools
 */
import type { ToolSet } from "ai";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "./client";

/**
 * Loads all activated tool slugs for the user's active connections.
 * Composio routes execution by user ID, so tool names stay as plain slugs.
 */
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<ToolSet> {
  const activatedToolSlugs = connections
    .filter((connection) => connection.status === "active" && connection.activated_tools.length > 0)
    .flatMap((connection) => connection.activated_tools);

  if (activatedToolSlugs.length === 0) {
    return {};
  }

  const composio = getComposio();
  return await composio.tools.get(composioUserId, {
    tools: activatedToolSlugs,
  });
}

/**
 * Loads all tool definitions for active connections and returns the current
 * activated slug set separately.
 *
 * This supports same-run approval flows: inactive connection tools stay hidden
 * from the model until `prepareStep.activeTools` includes them, but the tool
 * definitions must exist in the base `tools` object from run start.
 */
export async function loadAllConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<{ tools: ToolSet; activatedSlugs: Set<string> }> {
  const activeConnections = connections.filter((connection) => connection.status === "active");
  const activatedSlugs = new Set(activeConnections.flatMap((connection) => connection.activated_tools));

  if (activeConnections.length === 0) {
    return { tools: {}, activatedSlugs };
  }

  const toolkitSlugs = [...new Set(activeConnections.map((connection) => connection.toolkit_slug))];
  const composio = getComposio();
  const toolkitTools = await Promise.all(
    toolkitSlugs.map(async (toolkitSlug) => {
      const rawTools = await composio.tools.getRawComposioTools({
        toolkits: [toolkitSlug],
        limit: COMPOSIO_TOOL_FETCH_LIMIT,
      });

      return rawTools.map((rawTool) => rawTool.slug);
    }),
  );

  const allToolSlugs = [...new Set(toolkitTools.flat())];
  if (allToolSlugs.length === 0) {
    return { tools: {}, activatedSlugs };
  }

  const tools = await composio.tools.get(composioUserId, {
    tools: allToolSlugs,
  });

  return { tools, activatedSlugs };
}
