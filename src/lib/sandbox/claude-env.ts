/**
 * Shared Claude CLI environment builder for Sprite execution.
 *
 * Supports two auth modes:
 * - **Anthropic direct:** `ANTHROPIC_API_KEY` set → routes to api.anthropic.com (or custom base URL)
 * - **OpenRouter:** `OPENROUTER_API_KEY` set → routes to openrouter.ai/api with correct auth contract
 *
 * @module lib/sandbox/claude-env
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * Builds the per-command environment map for Claude Code CLI execution.
 *
 * When `OPENROUTER_API_KEY` is present, uses the OpenRouter auth contract:
 * - `ANTHROPIC_BASE_URL` → `https://openrouter.ai/api`
 * - `ANTHROPIC_AUTH_TOKEN` → the OpenRouter key
 * - `ANTHROPIC_API_KEY` → `""` (must be explicitly empty per OpenRouter docs)
 * - All model tier vars → optional override via `SANDBOX_MODEL_ID` (covers sonnet, opus, haiku, subagent)
 */
export function buildSandboxClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim();
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();

  if (openrouterApiKey) {
    const result: Record<string, string> = {
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_AUTH_TOKEN: openrouterApiKey,
      ANTHROPIC_BASE_URL: OPENROUTER_BASE_URL,
      PATH: env.PATH?.trim() ?? "",
    };

    const modelId = env.SANDBOX_MODEL_ID?.trim();
    if (modelId) {
      result.ANTHROPIC_DEFAULT_SONNET_MODEL = modelId;
      result.ANTHROPIC_DEFAULT_OPUS_MODEL = modelId;
      result.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelId;
      result.CLAUDE_CODE_SUBAGENT_MODEL = modelId;
    }

    appendOptionalKeys(result, env);
    return result;
  }

  if (!anthropicApiKey) {
    throw new Error(
      "Either ANTHROPIC_API_KEY or OPENROUTER_API_KEY is required for Sprite Claude CLI",
    );
  }

  const result: Record<string, string> = {
    ANTHROPIC_API_KEY: anthropicApiKey,
    PATH: env.PATH?.trim() ?? "",
    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL?.trim() ?? "",
  };

  appendOptionalKeys(result, env);
  return result;
}

/** Appends optional API keys used by sandbox skills (e.g. here.now publishing). */
function appendOptionalKeys(
  result: Record<string, string>,
  env: NodeJS.ProcessEnv,
): void {
  const herenowApiKey = env.HERENOW_API_KEY?.trim();
  if (herenowApiKey) {
    result.HERENOW_API_KEY = herenowApiKey;
  }
}
