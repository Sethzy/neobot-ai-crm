/**
 * get_integration_capabilities tool for managed agents.
 *
 * @module lib/managed-agents/tools/connections/get-integration-capabilities
 */
import { z } from "zod";

import { getToolkitCapabilities } from "@/lib/composio/catalog";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  integrationIds: z.array(z.string().min(1)).describe("The integration IDs to inspect."),
});

type GetIntegrationCapabilitiesInput = z.infer<typeof inputSchema>;

export const getIntegrationCapabilitiesTool: ManagedAgentTool<GetIntegrationCapabilitiesInput> = {
  name: "get_integration_capabilities",
  description:
    "Lists the capabilities available via the given integrations, including tools (if available), quality information (GREAT, GOOD, OK, LIMITED, and UNKNOWN), and notes.",
  inputSchema,
  execute: async ({ integrationIds }) => {
    const integrations = await getToolkitCapabilities(integrationIds);
    return { success: true as const, integrations };
  },
};
