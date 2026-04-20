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
const toolkitVersionCache = new Map<string, string>();
type RawComposioToolsQuery = Parameters<
  Composio<VercelProvider>["tools"]["getRawComposioTools"]
>[0];

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

/**
 * Resolves the latest explicit version string for a toolkit and caches it for
 * the lifetime of the server process.
 */
export async function resolveToolkitVersion(toolkitSlug: string): Promise<string> {
  const cachedVersion = toolkitVersionCache.get(toolkitSlug);

  if (cachedVersion) {
    return cachedVersion;
  }

  // SDK typings are looser than the runtime surface for toolkit metadata.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolkit = await (getComposio() as any).toolkits.get(toolkitSlug);
  const availableVersions: string[] | undefined = toolkit.meta?.availableVersions;

  if (!availableVersions?.length) {
    throw new Error(`No available versions found for toolkit "${toolkitSlug}".`);
  }

  const latestVersion = availableVersions[0];
  toolkitVersionCache.set(toolkitSlug, latestVersion);

  return latestVersion;
}

/**
 * Builds the explicit toolkit-version map expected by versioned raw-tool
 * discovery calls.
 */
export async function buildToolkitVersions(
  toolkitSlugs: readonly string[],
): Promise<Record<string, string>> {
  const uniqueToolkitSlugs = [...new Set(toolkitSlugs)];
  const toolkitVersions = await Promise.all(
    uniqueToolkitSlugs.map(async (toolkitSlug) => [
      toolkitSlug,
      await resolveToolkitVersion(toolkitSlug),
    ] as const),
  );

  return Object.fromEntries(toolkitVersions);
}

/**
 * Version-aware wrapper around raw Composio tool discovery so discovery and
 * execution operate on the same explicit toolkit versions.
 */
export async function getVersionedRawComposioTools(
  query: Record<string, unknown> & {
    toolkits?: string[];
    toolkit_slug?: string;
  },
) {
  const toolkitSlugs = Array.isArray(query.toolkits)
    ? query.toolkits.filter((value): value is string => typeof value === "string")
    : typeof query.toolkit_slug === "string"
      ? [query.toolkit_slug]
      : [];

  const toolkitVersions = toolkitSlugs.length > 0
    ? await buildToolkitVersions(toolkitSlugs)
    : undefined;

  return getComposio().tools.getRawComposioTools({
    ...query,
    ...(toolkitVersions ? { toolkit_versions: toolkitVersions } : {}),
  } as RawComposioToolsQuery);
}

/** @internal Exposed for test isolation. */
export function _resetComposioToolkitVersionCache(): void {
  toolkitVersionCache.clear();
}
