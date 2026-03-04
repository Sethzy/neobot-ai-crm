#!/usr/bin/env node
/** @file Runs a repeatable refactor audit and writes a prioritized maintenance report. */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
type StepStatus = "passed" | "action-needed" | "failed" | "skipped" | "dry-run";

interface CliOptions {
  repoRoot: string;
  outputRoot: string;
  includeTestProfiling: boolean;
  largeFileLineThreshold: number;
  largeFileLimit: number;
  dryRun: boolean;
  help: boolean;
}

interface PackageJsonData {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface CommandSpec {
  command: string;
  args: string[];
}

interface RawCommandResult {
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface StepResult {
  id: string;
  title: string;
  status: StepStatus;
  durationMs: number;
  exitCode: number | null;
  command?: string;
  reason?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

interface LargeFileInfo {
  filePath: string;
  lineCount: number;
}

interface SlowTestInfo {
  testPath: string;
  durationMs: number;
}

interface ExecutionContext {
  options: CliOptions;
  repoRoot: string;
  runRoot: string;
  packageManager: PackageManager;
  scripts: Record<string, string>;
  dependencySet: Set<string>;
  toolAvailability: Map<string, boolean>;
}

interface StepDefinition {
  id: string;
  title: string;
  findingExitCodes?: number[];
  getCommand: (ctx: ExecutionContext) => Promise<CommandSpec | null>;
  skipReason?: (ctx: ExecutionContext) => Promise<string | null>;
}

const DEFAULT_SCAN_ROOTS = ["src", "app", "pages", "components", "packages", "apps", "lib"];
const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "storybook-static",
  ".turbo",
  ".vercel",
]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const DOC_EXTENSIONS = new Set([".md", ".mdx"]);

/**
 * Parses CLI arguments.
 *
 * Supported options:
 * --repo <path>
 * --out <path>
 * --include-test-profiling
 * --large-file-threshold <lineCount>
 * --large-file-limit <count>
 * --dry-run
 * --help
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    repoRoot: ".",
    outputRoot: path.join(".agents", "skills", "react-refactor-maintenance", "runtime"),
    includeTestProfiling: false,
    largeFileLineThreshold: 350,
    largeFileLimit: 25,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--repo" && args[index + 1]) {
      options.repoRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (current === "--out" && args[index + 1]) {
      options.outputRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (current === "--include-test-profiling") {
      options.includeTestProfiling = true;
      continue;
    }

    if (current === "--large-file-threshold" && args[index + 1]) {
      options.largeFileLineThreshold = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (current === "--large-file-limit" && args[index + 1]) {
      options.largeFileLimit = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (current === "--help" || current === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!Number.isFinite(options.largeFileLineThreshold) || options.largeFileLineThreshold <= 0) {
    throw new Error("--large-file-threshold must be a positive number.");
  }

  if (!Number.isFinite(options.largeFileLimit) || options.largeFileLimit <= 0) {
    throw new Error("--large-file-limit must be a positive number.");
  }

  return options;
}

/** Prints CLI help text. */
function printHelp(): void {
  const lines = [
    "run-refactor-audit.ts",
    "",
    "Usage:",
    "  node --experimental-strip-types scripts/run-refactor-audit.ts [options]",
    "",
    "Options:",
    "  --repo <path>                   Repository root to audit (default: .)",
    "  --out <path>                    Output directory root",
    "  --include-test-profiling        Run vitest/jest timing pass",
    "  --large-file-threshold <lines>  Flag files over this line count (default: 350)",
    "  --large-file-limit <count>      Keep top N large files (default: 25)",
    "  --dry-run                       Print planned commands without running them",
    "  --help, -h                      Show this help",
  ];

  console.log(lines.join("\n"));
}

/** Resolves package manager from lockfiles. */
async function detectPackageManager(repoRoot: string): Promise<PackageManager> {
  if (await exists(path.join(repoRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await exists(path.join(repoRoot, "bun.lockb")) || (await exists(path.join(repoRoot, "bun.lock")))) {
    return "bun";
  }

  if (await exists(path.join(repoRoot, "yarn.lock"))) {
    return "yarn";
  }

  return "npm";
}

/** Returns true when a path exists. */
async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** Reads package.json when present. */
async function readPackageJson(repoRoot: string): Promise<PackageJsonData | null> {
  const packageJsonPath = path.join(repoRoot, "package.json");

  if (!(await exists(packageJsonPath))) {
    return null;
  }

  const raw = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(raw) as PackageJsonData;
}

/** Collects dependency names from dependencies and devDependencies. */
function collectDependencySet(packageJson: PackageJsonData | null): Set<string> {
  const result = new Set<string>();

  for (const source of [packageJson?.dependencies, packageJson?.devDependencies]) {
    if (!source) {
      continue;
    }

    for (const name of Object.keys(source)) {
      result.add(name);
    }
  }

  return result;
}

/** Formats command for report readability. */
function formatCommand(spec: CommandSpec): string {
  const quotedArgs = spec.args.map((value) => (value.includes(" ") ? `"${value}"` : value));
  return [spec.command, ...quotedArgs].join(" ");
}

/** Builds a package-manager-aware executable command for local binaries. */
function packageManagerExecCommand(pm: PackageManager, binary: string, args: string[]): CommandSpec {
  if (pm === "pnpm") {
    return { command: "pnpm", args: ["exec", binary, ...args] };
  }

  if (pm === "npm") {
    return { command: "npx", args: ["--no-install", binary, ...args] };
  }

  if (pm === "yarn") {
    return { command: "yarn", args: [binary, ...args] };
  }

  return { command: "bunx", args: [binary, ...args] };
}

/** Builds a package-manager-aware script runner command. */
function packageManagerRunScriptCommand(pm: PackageManager, scriptName: string, passthroughArgs: string[] = []): CommandSpec {
  if (pm === "pnpm") {
    return {
      command: "pnpm",
      args: ["run", scriptName, ...(passthroughArgs.length > 0 ? ["--", ...passthroughArgs] : [])],
    };
  }

  if (pm === "npm") {
    return {
      command: "npm",
      args: ["run", scriptName, ...(passthroughArgs.length > 0 ? ["--", ...passthroughArgs] : [])],
    };
  }

  if (pm === "yarn") {
    return { command: "yarn", args: [scriptName, ...passthroughArgs] };
  }

  return { command: "bun", args: ["run", scriptName, ...passthroughArgs] };
}

/** Builds package manager command to inspect outdated dependencies. */
function packageManagerOutdatedCommand(pm: PackageManager): CommandSpec {
  if (pm === "pnpm") {
    return { command: "pnpm", args: ["outdated", "--format", "json"] };
  }

  if (pm === "npm") {
    return { command: "npm", args: ["outdated", "--json"] };
  }

  if (pm === "yarn") {
    return { command: "yarn", args: ["outdated", "--json"] };
  }

  return { command: "bun", args: ["outdated", "--json"] };
}

/** Runs a command and collects stdout/stderr for reporting. */
async function runCommand(spec: CommandSpec, cwd: string, timeoutMs: number): Promise<RawCommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(spec.command, spec.args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        timedOut,
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

/** Persists command output into step-specific log files. */
async function writeStepLogs(runRoot: string, stepId: string, result: RawCommandResult): Promise<{ stdoutPath: string; stderrPath: string }> {
  const stepDir = path.join(runRoot, "logs", stepId);
  await fs.mkdir(stepDir, { recursive: true });

  const stdoutPath = path.join(stepDir, "stdout.log");
  const stderrPath = path.join(stepDir, "stderr.log");

  await fs.writeFile(stdoutPath, result.stdout, "utf8");
  await fs.writeFile(stderrPath, result.stderr, "utf8");

  return { stdoutPath, stderrPath };
}

/**
 * Probes if a tool can be executed through the local package manager.
 * Results are cached per tool to keep the audit fast.
 */
async function isToolAvailable(ctx: ExecutionContext, tool: string): Promise<boolean> {
  if (ctx.toolAvailability.has(tool)) {
    return ctx.toolAvailability.get(tool) ?? false;
  }

  const probeCommand = packageManagerExecCommand(ctx.packageManager, tool, ["--version"]);
  const probeResult = await runCommand(probeCommand, ctx.repoRoot, 20_000);
  const available = probeResult.exitCode === 0;

  ctx.toolAvailability.set(tool, available);
  return available;
}

/** Executes one audit step and writes logs when needed. */
async function runStep(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
  if (step.skipReason) {
    const reason = await step.skipReason(ctx);
    if (reason) {
      return {
        id: step.id,
        title: step.title,
        status: "skipped",
        durationMs: 0,
        exitCode: null,
        reason,
      };
    }
  }

  const spec = await step.getCommand(ctx);
  if (!spec) {
    return {
      id: step.id,
      title: step.title,
      status: "skipped",
      durationMs: 0,
      exitCode: null,
      reason: "Required command unavailable in this repository.",
    };
  }

  const formatted = formatCommand(spec);

  if (ctx.options.dryRun) {
    return {
      id: step.id,
      title: step.title,
      status: "dry-run",
      durationMs: 0,
      exitCode: null,
      command: formatted,
      reason: "Dry run enabled.",
    };
  }

  const raw = await runCommand(spec, ctx.repoRoot, 15 * 60_000);
  const logs = await writeStepLogs(ctx.runRoot, step.id, raw);

  let status: StepStatus = "passed";
  let reason: string | undefined;

  if (raw.timedOut) {
    status = "failed";
    reason = "Command timed out.";
  } else if (raw.exitCode !== 0) {
    const findingExitCodes = new Set(step.findingExitCodes ?? []);
    if (raw.exitCode !== null && findingExitCodes.has(raw.exitCode)) {
      status = "action-needed";
      reason = `Exit code ${raw.exitCode} indicates findings to review.`;
    } else {
      status = "failed";
      reason = `Exit code ${raw.exitCode ?? "null"}.`;
    }
  }

  return {
    id: step.id,
    title: step.title,
    status,
    durationMs: raw.durationMs,
    exitCode: raw.exitCode,
    command: formatted,
    reason,
    stdoutPath: path.relative(ctx.repoRoot, logs.stdoutPath),
    stderrPath: path.relative(ctx.repoRoot, logs.stderrPath),
  };
}

/** Returns existing code roots for focused scanning. */
async function resolveScanRoots(repoRoot: string): Promise<string[]> {
  const result: string[] = [];

  for (const relativeRoot of DEFAULT_SCAN_ROOTS) {
    const absoluteRoot = path.join(repoRoot, relativeRoot);
    if (await exists(absoluteRoot)) {
      result.push(relativeRoot);
    }
  }

  return result.length > 0 ? result : ["."];
}

/** Recursively walks directories under selected roots and invokes onFile for each file. */
async function walkFiles(
  repoRoot: string,
  selectedRoots: string[],
  onFile: (absoluteFilePath: string, relativeFilePath: string) => Promise<void>
): Promise<void> {
  const queue = selectedRoots.map((root) => path.resolve(repoRoot, root));

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(repoRoot, absolutePath);

      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORE_DIRS.has(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (entry.isFile()) {
        await onFile(absolutePath, relativePath);
      }
    }
  }
}

/** Collects large code files by line count. */
async function collectLargeFiles(
  repoRoot: string,
  scanRoots: string[],
  lineThreshold: number,
  limit: number
): Promise<LargeFileInfo[]> {
  const files: LargeFileInfo[] = [];

  await walkFiles(repoRoot, scanRoots, async (absoluteFilePath, relativeFilePath) => {
    const extension = path.extname(relativeFilePath);
    if (!CODE_EXTENSIONS.has(extension)) {
      return;
    }

    let contents: string;
    try {
      contents = await fs.readFile(absoluteFilePath, "utf8");
    } catch {
      return;
    }

    const lineCount = contents.length === 0 ? 0 : contents.split(/\r?\n/).length;
    if (lineCount >= lineThreshold) {
      files.push({ filePath: relativeFilePath, lineCount });
    }
  });

  return files.sort((left, right) => right.lineCount - left.lineCount).slice(0, limit);
}

/** Collects API route files to support consolidation analysis. */
async function collectApiRouteFiles(repoRoot: string, scanRoots: string[]): Promise<string[]> {
  const routeFiles: string[] = [];

  await walkFiles(repoRoot, scanRoots, async (_absolutePath, relativePath) => {
    const normalized = relativePath.replaceAll(path.sep, "/");
    const hasCodeExtension = /\.(ts|tsx|js|jsx)$/.test(normalized);

    if (!hasCodeExtension) {
      return;
    }

    const isNextAppRoute = normalized.includes("/app/api/") && /\/route\.(ts|tsx|js|jsx)$/.test(normalized);
    const isNextPagesRoute = normalized.includes("/pages/api/");
    const isTopLevelApiRoute = normalized.startsWith("api/");

    if (isNextAppRoute || isNextPagesRoute || isTopLevelApiRoute) {
      routeFiles.push(normalized);
    }
  });

  return routeFiles.sort((left, right) => left.localeCompare(right));
}

/** Counts markdown docs to flag stale documentation coverage. */
async function countDocs(repoRoot: string, scanRoots: string[]): Promise<number> {
  let count = 0;

  await walkFiles(repoRoot, scanRoots, async (_absolutePath, relativePath) => {
    const extension = path.extname(relativePath);
    if (DOC_EXTENSIONS.has(extension)) {
      count += 1;
    }
  });

  if (await exists(path.join(repoRoot, "README.md"))) {
    count += 1;
  }

  return count;
}

/** Extracts the slowest tests from Jest/Vitest JSON output when available. */
async function parseSlowTests(reportPath: string, limit: number): Promise<SlowTestInfo[]> {
  if (!(await exists(reportPath))) {
    return [];
  }

  const raw = await fs.readFile(reportPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const testResults = Array.isArray(parsed.testResults) ? parsed.testResults : [];

  const entries: SlowTestInfo[] = [];

  for (const testResult of testResults) {
    if (!testResult || typeof testResult !== "object") {
      continue;
    }

    const item = testResult as Record<string, unknown>;
    const testPathValue = item.name ?? item.testFilePath ?? item.file;
    const durationFromPerfStats =
      typeof item.perfStats === "object" &&
      item.perfStats !== null &&
      typeof (item.perfStats as Record<string, unknown>).runtime === "number"
        ? ((item.perfStats as Record<string, number>).runtime ?? 0)
        : null;

    const durationFromRange =
      typeof item.startTime === "number" && typeof item.endTime === "number"
        ? item.endTime - item.startTime
        : null;

    const durationFromField = typeof item.duration === "number" ? item.duration : null;
    const durationMs = durationFromPerfStats ?? durationFromField ?? durationFromRange;

    if (typeof testPathValue !== "string" || typeof durationMs !== "number") {
      continue;
    }

    entries.push({
      testPath: testPathValue,
      durationMs,
    });
  }

  return entries.sort((left, right) => right.durationMs - left.durationMs).slice(0, limit);
}

/** Builds prioritized recommendations from collected findings. */
function buildPriorityQueue(
  stepResults: StepResult[],
  largeFiles: LargeFileInfo[],
  apiRouteFiles: string[],
  slowTests: SlowTestInfo[],
  docsCount: number
): string[] {
  const queue: string[] = [];
  const byId = new Map(stepResults.map((step) => [step.id, step]));

  if (byId.get("lint")?.status === "failed" || byId.get("eslint-modern-rules")?.status === "failed") {
    queue.push("[High] Fix lint, react-compiler, and deprecation findings before structural refactors.");
  }

  if (byId.get("jscpd")?.status === "action-needed") {
    queue.push("[High] Remove duplicate blocks identified by jscpd and consolidate shared logic.");
  }

  if (byId.get("knip")?.status === "action-needed") {
    queue.push("[High] Remove unused exports, files, and dependencies reported by knip.");
  }

  if (largeFiles.length > 0) {
    queue.push("[Medium] Split oversized files into smaller modules to improve maintainability and testability.");
  }

  if (apiRouteFiles.length >= 8) {
    queue.push("[Medium] Review API routes for overlapping handlers and shared validation that can be consolidated.");
  }

  if (slowTests.length > 0) {
    queue.push("[Medium] Optimize the slowest tests first (mock expensive setup, remove full-app renders, isolate integration cases).");
  }

  if (byId.get("outdated")?.status === "action-needed") {
    queue.push("[Low] Update dependencies in small batches and rerun lint/typecheck/tests after each batch.");
  }

  if (docsCount <= 2) {
    queue.push("[Low] Expand docs for changed modules and keep API/contracts documented alongside code changes.");
  } else {
    queue.push("[Low] Update existing docs to reflect refactor decisions and route consolidations.");
  }

  if (queue.length === 0) {
    queue.push("[Low] No major issues detected; run a small modernization pass (remove unnecessary useEffect and tighten tests). ");
  }

  return queue;
}

/** Serializes step results into a markdown table. */
function stepResultsToMarkdown(stepResults: StepResult[]): string {
  const header = "| Step | Status | Duration | Command |\n| --- | --- | ---: | --- |";
  const rows = stepResults.map((step) => {
    const durationText = `${Math.round(step.durationMs / 100) / 10}s`;
    const commandText = step.command ? `\`${step.command}\`` : "-";
    return `| ${step.title} | ${step.status} | ${durationText} | ${commandText} |`;
  });

  return [header, ...rows].join("\n");
}

/** Formats list items for markdown output. */
function listToMarkdown(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

/** Creates markdown summary content. */
function buildSummaryMarkdown(input: {
  repoRoot: string;
  runRoot: string;
  packageManager: PackageManager;
  stepResults: StepResult[];
  largeFiles: LargeFileInfo[];
  apiRouteFiles: string[];
  slowTests: SlowTestInfo[];
  docsCount: number;
  priorityQueue: string[];
  includeTestProfiling: boolean;
}): string {
  const largeFileLines = input.largeFiles.map((item) => `${item.filePath} (${item.lineCount} lines)`);
  const slowTestLines = input.slowTests.map((item) => `${item.testPath} (${item.durationMs}ms)`);

  const logLines = input.stepResults
    .filter((step) => step.stdoutPath || step.stderrPath)
    .map((step) => {
      const paths = [step.stdoutPath, step.stderrPath].filter(Boolean).join(", ");
      return `${step.id}: ${paths}`;
    });

  const lines = [
    "# Refactor Audit Summary",
    "",
    `- Repository: ${input.repoRoot}`,
    `- Package manager: ${input.packageManager}`,
    `- Output folder: ${input.runRoot}`,
    `- Test profiling: ${input.includeTestProfiling ? "enabled" : "disabled"}`,
    "",
    "## Automated Checks",
    stepResultsToMarkdown(input.stepResults),
    "",
    "## Prioritized Queue",
    listToMarkdown(input.priorityQueue),
    "",
    "## Large Files",
    listToMarkdown(largeFileLines),
    "",
    "## API Route Inventory",
    `- Total routes detected: ${input.apiRouteFiles.length}`,
    listToMarkdown(input.apiRouteFiles.slice(0, 50)),
    "",
    "## Slow Tests",
    listToMarkdown(slowTestLines),
    "",
    "## Docs Coverage",
    `- Markdown docs discovered in scanned roots: ${input.docsCount}`,
    "",
    "## Log Files",
    listToMarkdown(logLines),
  ];

  return `${lines.join("\n")}\n`;
}

/** Main execution entrypoint. */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(options.repoRoot);
  const packageManager = await detectPackageManager(repoRoot);
  const packageJson = await readPackageJson(repoRoot);
  const scripts = packageJson?.scripts ?? {};
  const dependencySet = collectDependencySet(packageJson);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const runRoot = path.resolve(options.outputRoot, `audit-${timestamp}`);

  await fs.mkdir(runRoot, { recursive: true });

  const context: ExecutionContext = {
    options,
    repoRoot,
    runRoot,
    packageManager,
    scripts,
    dependencySet,
    toolAvailability: new Map<string, boolean>(),
  };

  const scanRoots = await resolveScanRoots(repoRoot);
  const apiRouteScanRoots = Array.from(new Set([...scanRoots, "api"]));

  const hasReactCompilerPlugin = dependencySet.has("eslint-plugin-react-compiler");
  const hasDeprecationPlugin = dependencySet.has("eslint-plugin-deprecation");

  const eslintRuleArgs: string[] = [];
  if (hasReactCompilerPlugin) {
    eslintRuleArgs.push("--rule", "react-compiler/react-compiler:error");
  }
  if (hasDeprecationPlugin) {
    eslintRuleArgs.push("--rule", "deprecation/deprecation:error");
  }

  const testReportPath = path.join(runRoot, "test-profile.json");

  const steps: StepDefinition[] = [
    {
      id: "jscpd",
      title: "jscpd duplication scan",
      findingExitCodes: [1],
      skipReason: async (ctx) => ((await isToolAvailable(ctx, "jscpd")) ? null : "jscpd not installed in this repo."),
      getCommand: async (ctx) => {
        const jscpdOutputRoot = path.join(ctx.runRoot, "jscpd");
        await fs.mkdir(jscpdOutputRoot, { recursive: true });
        return packageManagerExecCommand(ctx.packageManager, "jscpd", [
          ...scanRoots,
          "--min-lines",
          "5",
          "--min-tokens",
          "50",
          "--reporters",
          "json,console",
          "--output",
          jscpdOutputRoot,
        ]);
      },
    },
    {
      id: "knip",
      title: "knip dead-code scan",
      findingExitCodes: [1],
      skipReason: async (ctx) => ((await isToolAvailable(ctx, "knip")) ? null : "knip not installed in this repo."),
      getCommand: async (ctx) => packageManagerExecCommand(ctx.packageManager, "knip", ["--reporter", "json"]),
    },
    {
      id: "lint",
      title: "project lint script",
      skipReason: async (ctx) => (ctx.scripts.lint ? null : "No lint script in package.json."),
      getCommand: async (ctx) => packageManagerRunScriptCommand(ctx.packageManager, "lint"),
    },
    {
      id: "eslint-modern-rules",
      title: "eslint react-compiler + deprecation",
      findingExitCodes: [1],
      skipReason: async (ctx) => {
        if (eslintRuleArgs.length === 0) {
          return "Neither eslint-plugin-react-compiler nor eslint-plugin-deprecation found.";
        }

        if (!(await isToolAvailable(ctx, "eslint"))) {
          return "eslint not installed in this repo.";
        }

        return null;
      },
      getCommand: async (ctx) =>
        packageManagerExecCommand(ctx.packageManager, "eslint", [
          ".",
          "--ext",
          ".ts,.tsx,.js,.jsx",
          "--max-warnings",
          "0",
          ...eslintRuleArgs,
        ]),
    },
    {
      id: "outdated",
      title: "dependency outdated report",
      findingExitCodes: [1],
      getCommand: async (ctx) => packageManagerOutdatedCommand(ctx.packageManager),
    },
    {
      id: "test-profile",
      title: "slow test profiling",
      findingExitCodes: [1],
      skipReason: async (ctx) => {
        if (!ctx.options.includeTestProfiling) {
          return "Test profiling disabled. Use --include-test-profiling to enable.";
        }

        if (await isToolAvailable(ctx, "vitest")) {
          return null;
        }

        if (await isToolAvailable(ctx, "jest")) {
          return null;
        }

        return "Neither vitest nor jest is available in this repo.";
      },
      getCommand: async (ctx) => {
        if (await isToolAvailable(ctx, "vitest")) {
          return packageManagerExecCommand(ctx.packageManager, "vitest", [
            "run",
            "--reporter=json",
            "--outputFile",
            testReportPath,
          ]);
        }

        if (await isToolAvailable(ctx, "jest")) {
          return packageManagerExecCommand(ctx.packageManager, "jest", [
            "--runInBand",
            "--json",
            "--outputFile",
            testReportPath,
          ]);
        }

        return null;
      },
    },
  ];

  const stepResults: StepResult[] = [];
  for (const step of steps) {
    const result = await runStep(step, context);
    stepResults.push(result);
  }

  const [largeFiles, apiRouteFiles, docsCount] = await Promise.all([
    collectLargeFiles(repoRoot, scanRoots, options.largeFileLineThreshold, options.largeFileLimit),
    collectApiRouteFiles(repoRoot, apiRouteScanRoots),
    countDocs(repoRoot, [...scanRoots, "docs"]),
  ]);

  const slowTests = options.includeTestProfiling ? await parseSlowTests(testReportPath, 10) : [];

  const priorityQueue = buildPriorityQueue(stepResults, largeFiles, apiRouteFiles, slowTests, docsCount);
  const summaryMarkdown = buildSummaryMarkdown({
    repoRoot,
    runRoot,
    packageManager,
    stepResults,
    largeFiles,
    apiRouteFiles,
    slowTests,
    docsCount,
    priorityQueue,
    includeTestProfiling: options.includeTestProfiling,
  });

  const summaryPath = path.join(runRoot, "summary.md");
  await fs.writeFile(summaryPath, summaryMarkdown, "utf8");

  console.log(`Refactor audit complete. Summary: ${summaryPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Refactor audit failed: ${message}`);
  process.exit(1);
});
