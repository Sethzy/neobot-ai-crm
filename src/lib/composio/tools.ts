/**
 * Direct Composio tool loading for one runner invocation.
 * @module lib/composio/tools
 */
import type { ToolSet } from "ai";

import { getComposio } from "./client";

/** Loads Composio tools for the active toolkits of one client. */
export async function loadComposioTools(
  composioUserId: string,
  activeToolkits: string[],
): Promise<ToolSet> {
  if (!process.env.COMPOSIO_API_KEY?.trim() || activeToolkits.length === 0) {
    return {};
  }

  try {
    const composio = getComposio();
    return await composio.tools.get(composioUserId, {
      toolkits: activeToolkits,
    });
  } catch (error) {
    console.error("[composio] Failed to load tools:", error);
    return {};
  }
}
