/**
 * Resolves user-facing model IDs (e.g. `"anthropic/claude-sonnet-4-6"`)
 * to the Anthropic agent + version pair stored in environment variables.
 *
 * Each model maps to a separate Managed Agent on Anthropic (same tools,
 * same system prompt, different `model` field). The agent ID and version
 * are set by running `scripts/managed-agents/create-agent.ts --model <id>`
 * once per model per environment.
 *
 * Sonnet falls back to the legacy `ANTHROPIC_AGENT_ID` / `_VERSION` vars
 * when the `_SONNET`-suffixed vars are absent, for backward compatibility.
 *
 * @module lib/managed-agents/agent-config
 */

/** Reference to a specific Anthropic agent version. */
export interface AgentRef {
  agentId: string;
  agentVersion: number;
  /** Anthropic model ID (e.g. `"claude-sonnet-4-6"`) for telemetry labels. */
  anthropicModelId: string;
}

/**
 * Maps a user-facing model ID from the `chatModels` catalog to the
 * corresponding Anthropic agent + version from environment variables.
 *
 * Throws if the required env vars are not configured for the requested model.
 */
export function resolveAgentRef(userModelId: string): AgentRef {
  switch (userModelId) {
    case "anthropic/claude-sonnet-4-6":
      return buildRef(
        process.env.ANTHROPIC_AGENT_ID_SONNET?.trim() ||
          process.env.ANTHROPIC_AGENT_ID?.trim(),
        process.env.ANTHROPIC_AGENT_VERSION_SONNET?.trim() ||
          process.env.ANTHROPIC_AGENT_VERSION?.trim(),
        "claude-sonnet-4-6",
        "SONNET (or legacy ANTHROPIC_AGENT_ID)",
      );

    case "anthropic/claude-haiku-4-5":
      return buildRef(
        process.env.ANTHROPIC_AGENT_ID_HAIKU?.trim(),
        process.env.ANTHROPIC_AGENT_VERSION_HAIKU?.trim(),
        "claude-haiku-4-5",
        "HAIKU",
      );

    case "anthropic/claude-opus-4-6":
      return buildRef(
        process.env.ANTHROPIC_AGENT_ID_OPUS?.trim(),
        process.env.ANTHROPIC_AGENT_VERSION_OPUS?.trim(),
        "claude-opus-4-6",
        "OPUS",
      );

    default:
      throw new Error(
        `Unknown model ID for agent resolution: "${userModelId}". ` +
          `Expected one of: anthropic/claude-sonnet-4-6, anthropic/claude-haiku-4-5, anthropic/claude-opus-4-6`,
      );
  }
}

function buildRef(
  agentId: string | undefined,
  agentVersion: string | undefined,
  anthropicModelId: string,
  envLabel: string,
): AgentRef {
  if (!agentId || !agentVersion || !Number.isFinite(Number(agentVersion))) {
    throw new Error(
      `Managed agent env vars missing for ${envLabel}. ` +
        `Run: pnpm tsx scripts/managed-agents/create-agent.ts --model ${anthropicModelId}`,
    );
  }

  return {
    agentId,
    agentVersion: Number(agentVersion),
    anthropicModelId,
  };
}
