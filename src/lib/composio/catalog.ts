/**
 * Composio catalog search and toolkit capability helpers.
 * @module lib/composio/catalog
 */
import { unstable_cache } from "next/cache";
import { getSupportedProviderDisplayName } from "@/lib/managed-agents/tools/supported-providers";

import {
  COMPOSIO_TOOL_FETCH_LIMIT,
  getComposio,
  getVersionedRawComposioTools,
} from "./client";

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

export interface ToolkitDisplayInfo {
  integrationId: string;
  displayName: string;
  description: string;
  logoUrl: string | null;
}

const toolkitDisplayInfoCacheTtlSeconds = 60 * 60;

interface RawComposioTool {
  description?: string | null;
  toolkit?: {
    description?: string | null;
    logo?: string | null;
    name?: string | null;
    slug?: string | null;
  } | null;
}

function normalizeDisplayIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function getPreferredToolkitDisplayName(
  toolkitSlug: string,
  rawDisplayName?: string | null,
): string {
  const fallbackDisplayName = getSupportedProviderDisplayName(toolkitSlug);
  const trimmedDisplayName = rawDisplayName?.trim() ?? "";

  if (trimmedDisplayName.length === 0) {
    return fallbackDisplayName;
  }

  if (normalizeDisplayIdentifier(trimmedDisplayName) === normalizeDisplayIdentifier(toolkitSlug)) {
    return fallbackDisplayName;
  }

  return trimmedDisplayName;
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

  return Promise.all(toolkitSlugs.map(async (toolkitSlug) => {
    const tools = await getVersionedRawComposioTools({
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

/**
 * Loads lightweight display metadata for one toolkit slug.
 */
export async function getToolkitDisplayInfo(
  toolkitSlug: string,
): Promise<ToolkitDisplayInfo> {
  try {
    const [toolkitTool] = await getVersionedRawComposioTools({
      toolkits: [toolkitSlug],
      limit: 1,
    }) as RawComposioTool[];

    return {
      integrationId: toolkitSlug,
      displayName: getPreferredToolkitDisplayName(
        toolkitSlug,
        toolkitTool?.toolkit?.name,
      ),
      description: toolkitTool?.toolkit?.description
        ?? toolkitTool?.description
        ?? "",
      logoUrl: toolkitTool?.toolkit?.logo ?? null,
    };
  } catch {
    return {
      integrationId: toolkitSlug,
      displayName: getPreferredToolkitDisplayName(toolkitSlug),
      description: "",
      logoUrl: null,
    };
  }
}

/**
 * Loads lightweight display metadata for one toolkit slug with a short-lived
 * server cache so repeated auth-card hydration does not fan out to Composio.
 */
export async function getCachedToolkitDisplayInfo(
  toolkitSlug: string,
): Promise<ToolkitDisplayInfo> {
  const normalizedToolkitSlug = toolkitSlug.trim().toLowerCase();

  return unstable_cache(
    async () => getToolkitDisplayInfo(normalizedToolkitSlug),
    ["composio-toolkit-display-info", normalizedToolkitSlug],
    { revalidate: toolkitDisplayInfoCacheTtlSeconds },
  )();
}
