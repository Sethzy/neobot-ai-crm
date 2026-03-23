/**
 * Runs Claude Code CLI inside a persistent Sprite for spreadsheet work.
 * @module lib/sandbox/run-claude-in-sprite
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SpriteResult, SpriteSkillFile } from "./types";

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;

type SpriteHandle = {
  name: string;
  execFile: (
    command: string,
    args?: string[],
    options?: { env?: Record<string, string> },
  ) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer; exitCode?: number }>;
  filesystem: (basePath?: string) => {
    writeFile: (path: string, content: string | Buffer) => Promise<void>;
    readFile: (path: string) => Promise<string | Buffer>;
  };
};

interface RunClaudeInSpriteOptions {
  task: string;
  inputFilenames: string[];
  userSkillFiles: SpriteSkillFile[];
  userSkillSlug?: string;
  maxTurns?: number;
}

let bundledXlsxSkillFilesPromise: Promise<SpriteSkillFile[]> | null = null;

/**
 * Builds the Claude CLI argument array for `sprite.execFile()`.
 */
export function buildClaudeCliArgs(prompt: string, maxTurns: number): string[] {
  return [
    "--print",
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
 * Builds the task prompt for Claude's spreadsheet analysis run.
 */
export function buildAnalysisPrompt(
  task: string,
  inputFilenames: string[],
  userSkillSlug?: string,
): string {
  const lines = [
    "Read /skills/xlsx/SKILL.md before making spreadsheet changes.",
    "Use the xlsx skill's guidance for formulas, formatting, validation, and verification.",
  ];

  if (userSkillSlug) {
    lines.push(
      `Read /skills/${userSkillSlug}/SKILL.md and any files under /skills/${userSkillSlug}/references/ before starting.`,
    );
  }

  lines.push(
    "",
    `Task: ${task}`,
    "",
    `Input files are available in /workspace/input/: ${inputFilenames.join(", ") || "(none)"}`,
    "Write the finished workbook to /workspace/output/result.xlsx.",
    "Write a concise human-readable summary to /workspace/output/summary.txt.",
    "Run python3 /skills/xlsx/scripts/recalc.py /workspace/output/result.xlsx before finishing.",
    "Fix any spreadsheet errors before you stop.",
  );

  return lines.join("\n");
}

/**
 * Returns the per-command environment map for Claude CLI execution.
 */
export function buildClaudeEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Sprite Claude CLI");
  }

  return { ANTHROPIC_API_KEY: anthropicApiKey };
}

/**
 * Runs the spreadsheet analysis workflow inside the provided Sprite.
 */
export async function runClaudeInSprite(
  sprite: SpriteHandle,
  {
    task,
    inputFilenames,
    userSkillFiles,
    userSkillSlug,
    maxTurns = DEFAULT_MAX_TURNS,
  }: RunClaudeInSpriteOptions,
): Promise<SpriteResult> {
  const claudeEnv = buildClaudeEnv();
  const filesystem = sprite.filesystem();

  await ensureBundledXlsxSkillFiles(sprite, filesystem);
  await writeSkillFiles(sprite, filesystem, userSkillFiles);
  await sprite.execFile("mkdir", ["-p", "/workspace/output"]);

  const prompt = buildAnalysisPrompt(task, inputFilenames, userSkillSlug);
  const cliArgs = buildClaudeCliArgs(prompt, maxTurns);
  const executionResult = await sprite.execFile("claude", cliArgs, { env: claudeEnv });

  const summary = await readSummaryOrFallback(filesystem);
  const success = await didResultWorkbookExist(sprite);

  return {
    success,
    summary,
    spriteName: sprite.name,
    outputFiles: [],
    cliOutput: toUtf8String(executionResult.stdout),
  };
}

async function ensureBundledXlsxSkillFiles(
  sprite: SpriteHandle,
  filesystem: ReturnType<SpriteHandle["filesystem"]>,
): Promise<void> {
  try {
    await filesystem.readFile("/skills/xlsx/SKILL.md");
    return;
  } catch {
    // First-run path: the xlsx skill bundle is not present in this Sprite yet.
  }

  const bundledFiles = await getBundledXlsxSkillFiles();

  for (const file of bundledFiles) {
    const fullPath = `/skills/${file.path}`;
    await sprite.execFile("mkdir", ["-p", dirname(fullPath)]);
    await filesystem.writeFile(fullPath, file.content);
  }
}

async function writeSkillFiles(
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

async function readSummaryOrFallback(
  filesystem: ReturnType<SpriteHandle["filesystem"]>,
): Promise<string> {
  try {
    const summaryBuffer = await filesystem.readFile("/workspace/output/summary.txt");
    const summary = toUtf8String(summaryBuffer).trim();

    return summary.length > 0 ? summary : "Analysis complete. Check the spreadsheet for details.";
  } catch {
    return "Analysis complete. Check the spreadsheet for details.";
  }
}

function toUtf8String(value: string | Buffer | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return "";
}

async function didResultWorkbookExist(sprite: SpriteHandle): Promise<boolean> {
  try {
    await sprite.execFile("test", ["-f", "/workspace/output/result.xlsx"]);
    return true;
  } catch {
    return false;
  }
}

async function getBundledXlsxSkillFiles(): Promise<SpriteSkillFile[]> {
  if (!bundledXlsxSkillFilesPromise) {
    bundledXlsxSkillFilesPromise = loadBundledXlsxSkillFiles();
  }

  return bundledXlsxSkillFilesPromise;
}

async function loadBundledXlsxSkillFiles(): Promise<SpriteSkillFile[]> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const xlsxDirectory = resolve(moduleDirectory, "skills/xlsx");

  const files: Array<{ path: string; absolutePath: string }> = [
    {
      path: "xlsx/SKILL.md",
      absolutePath: resolve(xlsxDirectory, "SKILL.md"),
    },
    {
      path: "xlsx/scripts/recalc.py",
      absolutePath: resolve(xlsxDirectory, "scripts/recalc.py"),
    },
    {
      path: "xlsx/scripts/office/soffice.py",
      absolutePath: resolve(xlsxDirectory, "scripts/office/soffice.py"),
    },
  ];

  const bundledFiles = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      content: await readFile(file.absolutePath, "utf8"),
    })),
  );

  return bundledFiles;
}
