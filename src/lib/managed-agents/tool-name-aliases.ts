/**
 * Publish/runtime name translation for managed-agent custom tools.
 *
 * Anthropic reserves some managed-agent tool names globally, so Sunder
 * publishes a small subset under workspace-specific aliases while keeping the
 * internal registry, UI, QA scenarios, and persisted transcripts stable.
 *
 * @module lib/managed-agents/tool-name-aliases
 */
const INTERNAL_TO_PUBLISHED_TOOL_NAME = {
  web_search: "sunder_web_search",
} as const satisfies Record<string, string>;
const INTERNAL_TO_PUBLISHED_TOOL_NAME_MAP = INTERNAL_TO_PUBLISHED_TOOL_NAME as Record<
  string,
  string
>;

const PUBLISHED_TO_INTERNAL_TOOL_NAME = Object.fromEntries(
  Object.entries(INTERNAL_TO_PUBLISHED_TOOL_NAME).map(
    ([internalName, publishedName]) => [publishedName, internalName],
  ),
) as Record<string, string>;

export function toPublishedManagedAgentToolName(name: string): string {
  return INTERNAL_TO_PUBLISHED_TOOL_NAME_MAP[name] ?? name;
}

export function toInternalManagedAgentToolName(name: string): string {
  return PUBLISHED_TO_INTERNAL_TOOL_NAME[name] ?? name;
}
