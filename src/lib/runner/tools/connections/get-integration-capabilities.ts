/**
 * get_integrations_capabilities tool for catalog capability lookup.
 * @module lib/runner/tools/connections/get-integration-capabilities
 */
import { tool } from "ai";
import { z } from "zod";

import { getToolkitCapabilities } from "@/lib/composio/catalog";

/**
 * Creates a read-only tool that expands integration IDs into tool capability metadata.
 */
export function createGetIntegrationCapabilitiesTool() {
  return {
    get_integrations_capabilities: tool({
      description:
        "Lists the capabilities available via the given integrations, including tools, quality information, and notes.",
      inputSchema: z.object({
        integrationIds: z
          .array(z.string().min(1))
          .describe("The integration IDs to inspect."),
      }),
      execute: async ({ integrationIds }) => {
        const integrations = await getToolkitCapabilities(integrationIds);

        return {
          success: true,
          integrations,
        };
      },
    }),
  };
}
