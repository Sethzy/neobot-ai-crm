/**
 * Composio catalog search and toolkit capability helpers.
 * @module lib/composio/catalog
 */
import { COMPOSIO_TOOL_FETCH_LIMIT, getComposio } from "./client";

export interface CatalogIntegration {
  integrationId: string;
  name: string;
  description: string;
  quality: string;
  builder: string;
  context: string;
}

export interface ToolkitCapabilityTool {
  slug: string;
  name: string;
  description: string;
  tags: string[];
}

export interface ToolkitCapability {
  integrationId: string;
  name: string;
  description: string;
  quality: string;
  notes: string;
  tools: ToolkitCapabilityTool[];
}

/**
 * Searches the Composio catalog and deduplicates results by toolkit slug.
 */
export async function searchIntegrations(
  keyword: string,
): Promise<CatalogIntegration[]> {
  const composio = getComposio();
  // SDK types don't include `limit` on SearchOnlyParams, but the API supports it
  const tools = await composio.tools.getRawComposioTools({
    search: keyword,
    limit: COMPOSIO_TOOL_FETCH_LIMIT,
  } as Parameters<typeof composio.tools.getRawComposioTools>[0]);
  const seenIntegrations = new Map<string, CatalogIntegration>();

  for (const tool of tools) {
    const toolkitSlug = tool.toolkit?.slug;

    if (!toolkitSlug || seenIntegrations.has(toolkitSlug)) {
      continue;
    }

    seenIntegrations.set(toolkitSlug, {
      integrationId: toolkitSlug,
      name: tool.toolkit?.name ?? toolkitSlug,
      description: tool.description ?? "",
      quality: "UNKNOWN",
      builder: "Composio",
      context: "",
    });
  }

  return Array.from(seenIntegrations.values());
}

/**
 * Loads the available tool metadata for each requested toolkit slug.
 */
export async function getToolkitCapabilities(
  toolkitSlugs: string[],
): Promise<ToolkitCapability[]> {
  if (toolkitSlugs.length === 0) {
    return [];
  }

  const composio = getComposio();

  return Promise.all(toolkitSlugs.map(async (toolkitSlug) => {
    const tools = await composio.tools.getRawComposioTools({
      toolkits: [toolkitSlug],
      limit: COMPOSIO_TOOL_FETCH_LIMIT,
    });

    return {
      integrationId: toolkitSlug,
      name: tools[0]?.toolkit?.name ?? toolkitSlug,
      description: "",
      quality: "UNKNOWN",
      notes: "",
      tools: tools.map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        description: tool.description ?? "",
        tags: tool.tags ?? [],
      })),
    } satisfies ToolkitCapability;
  }));
}
