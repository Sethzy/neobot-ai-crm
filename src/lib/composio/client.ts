/**
 * Singleton Composio client configured for Vercel AI SDK tools.
 * @module lib/composio/client
 */
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

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
