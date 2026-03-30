/**
 * Singleton Composio client configured for Vercel AI SDK tools.
 * @module lib/composio/client
 */
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

/**
 * Default limit for getRawComposioTools() toolkit queries.
 * The Composio API defaults to 20, which truncates toolkits with >20 tools
 * (e.g., Google Drive has 89). 200 provides headroom for large toolkits.
 * Not needed for slug-based queries (activated-tools.ts) — the SDK forces 9999 internally.
 */
export const COMPOSIO_TOOL_FETCH_LIMIT = 200;

let composioClient: Composio<VercelProvider> | null = null;

/** Returns the shared Composio client for server-side tool loading. */
export function getComposio(): Composio<VercelProvider> {
  if (!composioClient) {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("Missing COMPOSIO_API_KEY.");
    }

    composioClient = new Composio({
      apiKey,
      provider: new VercelProvider(),
      allowTracking: false,
    });
  }

  return composioClient;
}
