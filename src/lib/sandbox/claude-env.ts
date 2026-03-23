/**
 * Shared Claude CLI environment builder for Sprite execution.
 * @module lib/sandbox/claude-env
 */

/**
 * Builds the per-command environment map for Claude Code CLI execution.
 */
export function buildSandboxClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Sprite Claude CLI");
  }

  return {
    ANTHROPIC_API_KEY: anthropicApiKey,
    PATH: env.PATH?.trim() ?? "",
    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL?.trim() ?? "",
  };
}
