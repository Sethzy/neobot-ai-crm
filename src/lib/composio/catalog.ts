/**
 * Composio catalog search and toolkit capability helpers.
 * @module lib/composio/catalog
 */
import { getComposio } from "./client";

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
  const tools = await composio.tools.getRawComposioTools({ search: keyword });
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
  const capabilities: ToolkitCapability[] = [];

  for (const toolkitSlug of toolkitSlugs) {
    const tools = await composio.tools.getRawComposioTools({
      toolkits: [toolkitSlug],
    });

    capabilities.push({
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
    });
  }

  return capabilities;
}
