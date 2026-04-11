/**
 * search_integrations tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/search-integrations
 */
import { z } from "zod";

import { searchIntegrations } from "@/lib/composio/catalog";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  keywords: z.array(z.string().min(1)).describe("The list of single-word search keywords."),
});

type SearchIntegrationsInput = z.infer<typeof inputSchema>;

export const searchIntegrationsTool: ManagedAgentTool<SearchIntegrationsInput> = {
  name: "search_integrations",
  description:
    "Lists integrations that match one or more given keywords. Keywords are single words.\nSearches integrations built by the Sunder team as well as integrations from Composio (over 3000 total).\n\nNEVER mention integration quality scores or who built the integrations unless the user specifically asks.\n\nOnce you have the integration ID you can get more info using get_integration_capabilities.",
  inputSchema,
  execute: async ({ keywords }) => {
    if (keywords.length === 0) {
      return { success: true as const, integrations: [] };
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
      success: true as const,
      integrations: Array.from(dedupedIntegrations.values()),
    };
  },
};
