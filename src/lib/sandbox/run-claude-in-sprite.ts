/**
 * Claude Code CLI execution and prompt building for Sprite sandbox.
 * @module lib/sandbox/run-claude-in-sprite
 */
import { dirname } from "node:path";

import { buildSandboxClaudeEnv } from "./claude-env";
import { jobOutputDir } from "./sandbox-paths";
import { deriveJobToken } from "./sprite-jobs";
import type { SpriteHandle, SpriteSkillFile } from "./types";

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep", "Task"];
export const DEFAULT_MAX_TURNS = 100;

/**
 * Builds the Claude CLI argument array for `sprite.execFile()`.
 */
export function buildClaudeCliArgs(prompt: string, maxTurns: number): string[] {
  return [
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
    "--allowedTools",
    ALLOWED_TOOLS.join(","),
    "--max-turns",
    String(maxTurns),
    "-p",
    prompt,
  ];
}

/**
 * Builds the generic task prompt for Claude Code inside a Sprite.
 * First skill slug is primary (read first), rest are companions.
 */
export function buildSandboxPrompt({
  task,
  skillSlugs,
  inputFilenames,
  outputDir,
}: {
  task: string;
  skillSlugs: string[];
  inputFilenames: string[];
  outputDir: string;
}): string {
  const [primary, ...companions] = skillSlugs;
  const lines = [
    `Read /skills/${primary}/SKILL.md before starting.`,
    `If the skill references additional files under /skills/${primary}/, read those too.`,
  ];

  for (const companion of companions) {
    lines.push(`Also read /skills/${companion}/SKILL.md for additional context.`);
  }

  lines.push(
    "",
    `Task: ${task}`,
    "",
    inputFilenames.length > 0
      ? `Input files: ${outputDir}/input/ (${inputFilenames.join(", ")})`
      : "No input files.",
    `Write all output to ${outputDir}/`,
    `Write a concise human-readable summary to ${outputDir}/summary.txt.`,
    "",
    "If the task is ambiguous, state your assumptions in summary.txt and produce your best-guess output.",
    'If you are uncertain about something critical, write your question to summary.txt starting with "QUESTION:" instead of producing output.',
  );

  return lines.join("\n");
}

/**
 * Returns the per-command environment map for Claude CLI execution.
 */
export function buildClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return buildSandboxClaudeEnv(env);
}

/**
 * Launch Claude Code in a detachable tmux session.
 * Returns immediately. Process runs at full speed, survives disconnect.
 * Reuses buildClaudeCliArgs() and buildClaudeEnv() from PR 52/53.
 */
export async function launchBackgroundJob(
  sprite: SpriteHandle,
  jobId: string,
  options: { prompt: string; maxTurns: number },
): Promise<void> {
  const { prompt, maxTurns } = options;
  const outputDir = jobOutputDir(jobId);
  const claudeEnv = buildClaudeEnv();
  const cliArgs = buildClaudeCliArgs(prompt, maxTurns);

  await sprite.execFile("mkdir", ["-p", outputDir]);

  const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const claudeCmd = ["claude", ...cliArgs].map(shellEscape).join(" ");

  const wrapperScript = [
    `cd ${outputDir}`,
    `${claudeCmd} > stream.jsonl 2>&1`,
    `EXIT_CODE=$?`,
    `[ $EXIT_CODE -eq 0 ] && touch .done || echo $EXIT_CODE > .error`,
    `curl -s -X POST "$CALLBACK_URL" \\`,
    `  -H "Authorization: Bearer $CALLBACK_TOKEN" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d "{\\"jobId\\":\\"$JOB_ID\\",\\"status\\":\\"$([ -f .done ] && echo done || echo error)\\"}" \\`,
    `  --max-time 10 || true`,
  ].join("\n");

  sprite.spawn("bash", ["-c", wrapperScript], {
    detachable: true,
    env: {
      ...claudeEnv,
      CALLBACK_URL: `${process.env.NEXT_PUBLIC_APP_URL}/api/sandbox/callback`,
      CALLBACK_TOKEN: deriveJobToken(jobId),
      JOB_ID: jobId,
    },
  });
}

export async function writeSkillFiles(
  sprite: SpriteHandle,
  filesystem: ReturnType<SpriteHandle["filesystem"]>,
  skillFiles: SpriteSkillFile[],
): Promise<void> {
  for (const file of skillFiles) {
    const fullPath = `/skills/${file.path}`;
    await sprite.execFile("mkdir", ["-p", dirname(fullPath)]);
    await filesystem.writeFile(fullPath, file.content);
  }
}

