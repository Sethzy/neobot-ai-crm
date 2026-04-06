/**
 * User-scoped Composio tool loading for active connections.
 * @module lib/composio/activated-tools
 */
import type { ToolSet } from "ai";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { getComposio } from "./client";

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
