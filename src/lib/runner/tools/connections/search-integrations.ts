/**
 * search_for_integrations tool for catalog discovery.
 * @module lib/runner/tools/connections/search-integrations
 */
import { tool } from "ai";
import { z } from "zod";

import { searchIntegrations } from "@/lib/composio/catalog";

/**
 * Creates a read-only tool that searches the Composio toolkit catalog by keyword.
 */
export function createSearchIntegrationsTool() {
  return {
    search_for_integrations: tool({
      description:
        "Lists integrations that match one or more given keywords. Keywords are single words like email, billing, tasks, Gmail, or Slack. Returns integration ID, name, description, quality score, builder, and context. NEVER mention quality or builder unless the user specifically asks.",
      inputSchema: z.object({
        keywords: z
          .array(z.string().min(1))
          .describe("The list of single-word search keywords."),
      }),
      execute: async ({ keywords }) => {
        if (keywords.length === 0) {
          return {
            success: true,
            integrations: [],
          };
        }

        const dedupedIntegrations = new Map<
          string,
          Awaited<ReturnType<typeof searchIntegrations>>[number]
        >();

        for (const keyword of keywords) {
          const integrations = await searchIntegrations(keyword);

          for (const integration of integrations) {
            if (!dedupedIntegrations.has(integration.integrationId)) {
              dedupedIntegrations.set(integration.integrationId, integration);
            }
          }
        }

        return {
          success: true,
          integrations: Array.from(dedupedIntegrations.values()),
        };
      },
    }),
  };
}
