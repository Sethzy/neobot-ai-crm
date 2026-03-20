# Sandbox: Excel Analysis (`analyze_spreadsheet`)

**PR:** PR 52: Sandbox Excel Analysis
**Decisions:** EXEC-04 (sandbox), design doc `docs/product/designs/sandbox-skill-execution.md`
**Goal:** Users upload spreadsheets or describe deals → agent produces professional Excel financial models with live formulas, color coding, and sensitivity tables — all running inside an ephemeral Vercel Sandbox with Claude Code CLI.

**Architecture:** Gemini Flash (existing runner) routes to the `analyze_spreadsheet` tool when user uploads xlsx/csv or asks for financial analysis. The tool spins up a Vercel Sandbox from a pre-built snapshot (`snap_excel`) containing Python, pandas, openpyxl, LibreOffice, Claude Code CLI, and Anthropic's xlsx skill. User's custom `re-analyst/SKILL.md` preferences are downloaded from Supabase Storage and loaded into the sandbox at runtime. Claude Code CLI runs autonomously inside, writes Python code, creates the Excel model, runs `recalc.py` to evaluate formulas, fixes errors, and outputs the final `.xlsx`. The tool uploads the result to Supabase Storage and returns a download URL.

**Tech Stack:** `@vercel/sandbox`, Claude Code CLI (`@anthropic-ai/claude-code`), Anthropic xlsx skill, Vercel AI SDK `tool()`, Supabase Storage, Vitest

**Depends on:** PR 51/51a (skill system — `discoverUserSkills()`, `getSkillContent()`, `createAgentFileClient()`, storage paths)

**Design doc:** `docs/product/designs/sandbox-skill-execution.md` (sections 1-5, 7-9)
**Handover:** `docs/product/handovers/2026-03-20-pr51-51a-skills-handover-to-sandbox.md`
**Reference repos:**
- [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) — `@vercel/sandbox` API, snapshot workflow, agent CLI inside sandbox
- [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) — DCF model skill structure
- Anthropic xlsx skill source: `/Users/sethlim/Downloads/xlsx/`

---

## Relevant Files

### Create
- `src/lib/sandbox/types.ts` — SandboxConfig, SandboxResult, SandboxSkillFiles types
- `src/lib/sandbox/create-sandbox.ts` — `createSandbox()` wrapper around `Sandbox.create()` with snapshot selection
- `src/lib/sandbox/run-claude-in-sandbox.ts` — `runClaudeInSandbox()` — writes API key config, runs Claude CLI, captures output
- `src/lib/sandbox/skill-loader.ts` — `loadSkillFilesForSandbox()` — downloads user skill files from Supabase Storage, returns as map
- `src/lib/sandbox/__tests__/create-sandbox.test.ts`
- `src/lib/sandbox/__tests__/run-claude-in-sandbox.test.ts`
- `src/lib/sandbox/__tests__/skill-loader.test.ts`
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` — `createAnalyzeSpreadsheetTool()` factory
- `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- `scripts/build-snapshot-excel.ts` — Snapshot build script (reads xlsx skill files from `/Users/sethlim/Downloads/xlsx/`, installs deps, bakes everything into snapshot)

### Modify
- `src/lib/runner/tool-registry.ts` — add `analyze_spreadsheet` to `createRunnerTools()`
- `src/lib/ai/system-prompt.ts` — add `analyze_spreadsheet` tool guidance
- `.env.local` / `.env.example` — add `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID`, `SANDBOX_VERCEL_TOKEN`, `SANDBOX_SNAPSHOT_EXCEL_ID`

### Reference (read, don't modify)
- `src/lib/runner/skills/skill-templates.ts` — pattern for inlining skill content as string constants
- `src/lib/runner/skills/discover-skills.ts` — `getSkillContent()` for loading user skills from Storage
- `src/lib/storage/agent-files.ts` — `createAgentFileClient()` for uploading output files
- `src/lib/storage/agent-paths.ts` — `toStoragePath()` / `toModelPath()` path conventions
- `/Users/sethlim/Downloads/xlsx/SKILL.md` — Anthropic xlsx skill definition
- `/Users/sethlim/Downloads/xlsx/scripts/recalc.py` — Formula recalculation script
- `/Users/sethlim/Downloads/xlsx/scripts/office/soffice.py` — LibreOffice sandbox helper
- `docs/product/designs/sandbox-skill-execution.md` — full design doc

---

## Task 1: Install `@vercel/sandbox` + define types

**Files:**
- Modify: `package.json`
- Create: `src/lib/sandbox/types.ts`

**Step 1: Install the Vercel Sandbox SDK**

```bash
npm install @vercel/sandbox
```

Expected: package added to `dependencies` in `package.json`.

**Step 2: Create sandbox types**

```typescript
// src/lib/sandbox/types.ts
/**
 * Types for Vercel Sandbox integration.
 * @module lib/sandbox/types
 */
import type { Sandbox } from "@vercel/sandbox";

/** Configuration for creating a sandbox from a snapshot. */
export interface SandboxConfig {
  /** Snapshot ID to restore from (pre-built image with all deps). */
  snapshotId: string;
  /** Max sandbox lifetime in ms. Default: 180_000 (3 min). */
  timeout?: number;
}

/** Result from running Claude Code CLI inside a sandbox. */
export interface SandboxResult {
  success: boolean;
  /** Human-readable summary from /tmp/summary.txt. */
  summary: string;
  /** Output file paths uploaded to Supabase Storage (e.g. output.xlsx). */
  outputFiles: SandboxOutputFile[];
  /** Raw stdout from the Claude CLI process (for debugging). */
  cliOutput?: string;
  /** Error message if success=false. */
  error?: string;
}

/** A file produced by the sandbox and uploaded to Supabase Storage. */
export interface SandboxOutputFile {
  /** Original filename inside sandbox (e.g. "output.xlsx"). */
  filename: string;
  /** Supabase Storage path after upload. */
  storagePath: string;
  /** Signed download URL (time-limited). */
  downloadUrl: string;
}

/** User skill files downloaded from Supabase Storage for injection into sandbox. */
export interface SandboxSkillFile {
  /** Relative path inside the sandbox (e.g. "re-analyst/SKILL.md"). */
  path: string;
  /** File content as string. */
  content: string;
}
```

Run: `npx tsc --noEmit` — should compile with no errors.

---

## Task 2: Build `createSandbox()` wrapper

**Files:**
- Create: `src/lib/sandbox/create-sandbox.ts`
- Create: `src/lib/sandbox/__tests__/create-sandbox.test.ts`

**Step 1: Write failing test for createSandbox**

```typescript
// src/lib/sandbox/__tests__/create-sandbox.test.ts
import { describe, expect, it, vi } from "vitest";

// We can't spin up real sandboxes in unit tests — mock the SDK
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue({
      sandboxId: "sbx_test_123",
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: () => Promise.resolve(""), stderr: () => Promise.resolve("") }),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { createSandbox, validateSandboxEnv } from "../create-sandbox";

describe("validateSandboxEnv", () => {
  it("throws if SANDBOX_VERCEL_TEAM_ID is missing", () => {
    expect(() => validateSandboxEnv({})).toThrow("SANDBOX_VERCEL_TEAM_ID");
  });

  it("passes with all required vars", () => {
    expect(() =>
      validateSandboxEnv({
        SANDBOX_VERCEL_TEAM_ID: "team_abc",
        SANDBOX_VERCEL_PROJECT_ID: "proj_abc",
        SANDBOX_VERCEL_TOKEN: "tok_abc",
      }),
    ).not.toThrow();
  });
});

describe("createSandbox", () => {
  it("calls Sandbox.create with snapshot source", async () => {
    const { Sandbox } = await import("@vercel/sandbox");
    const sandbox = await createSandbox({ snapshotId: "snap_test" });

    expect(Sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { type: "snapshot", snapshotId: "snap_test" },
      }),
    );
    expect(sandbox.sandboxId).toBe("sbx_test_123");
  });
});
```

Run: `npx vitest run src/lib/sandbox/__tests__/create-sandbox.test.ts` — should fail (module not found).

**Step 2: Implement createSandbox**

```typescript
// src/lib/sandbox/create-sandbox.ts
/**
 * Creates a Vercel Sandbox from a pre-built snapshot.
 * @module lib/sandbox/create-sandbox
 */
import { Sandbox } from "@vercel/sandbox";

import type { SandboxConfig } from "./types";

const REQUIRED_ENV_VARS = [
  "SANDBOX_VERCEL_TEAM_ID",
  "SANDBOX_VERCEL_PROJECT_ID",
  "SANDBOX_VERCEL_TOKEN",
] as const;

/** Throws if any required sandbox env vars are missing. */
export function validateSandboxEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const key of REQUIRED_ENV_VARS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

/** Creates a Vercel Sandbox restored from a snapshot. */
export async function createSandbox(config: SandboxConfig) {
  validateSandboxEnv();

  return Sandbox.create({
    source: { type: "snapshot", snapshotId: config.snapshotId },
    teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
    projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
    token: process.env.SANDBOX_VERCEL_TOKEN!,
    timeout: config.timeout ?? 180_000,
  });
}
```

Run: `npx vitest run src/lib/sandbox/__tests__/create-sandbox.test.ts` — should pass.

---

## Task 3: Build `loadSkillFilesForSandbox()`

Downloads a user's custom skill files from Supabase Storage and returns them as a flat map (path → content) ready to be written into the sandbox filesystem.

**Files:**
- Create: `src/lib/sandbox/skill-loader.ts`
- Create: `src/lib/sandbox/__tests__/skill-loader.test.ts`

**Step 1: Write failing test**

```typescript
// src/lib/sandbox/__tests__/skill-loader.test.ts
import { describe, expect, it, vi } from "vitest";

import { loadSkillFilesForSandbox } from "../skill-loader";
import type { SandboxSkillFile } from "../types";

// Mock Supabase client
const mockDownload = vi.fn();
const mockList = vi.fn();
const mockSupabase = {
  storage: {
    from: () => ({
      download: mockDownload,
      list: mockList,
    }),
  },
} as any;

describe("loadSkillFilesForSandbox", () => {
  it("returns empty array when skill directory doesn't exist", async () => {
    mockList.mockResolvedValue({ data: null, error: { message: "not found" } });

    const files = await loadSkillFilesForSandbox(mockSupabase, "client_1", "re-analyst");
    expect(files).toEqual([]);
  });

  it("downloads SKILL.md and reference files", async () => {
    mockList.mockResolvedValue({
      data: [{ name: "SKILL.md" }, { name: "references" }],
      error: null,
    });
    mockDownload.mockResolvedValue({
      data: new Blob(["# My Analysis Prefs"]),
      error: null,
    });

    const files = await loadSkillFilesForSandbox(mockSupabase, "client_1", "re-analyst");
    expect(files.length).toBeGreaterThan(0);
    expect(files[0].path).toContain("re-analyst");
  });
});
```

Run: `npx vitest run src/lib/sandbox/__tests__/skill-loader.test.ts` — should fail.

**Step 2: Implement skill-loader**

```typescript
// src/lib/sandbox/skill-loader.ts
/**
 * Downloads user skill files from Supabase Storage for injection into a sandbox.
 * Reuses the existing agent-files storage patterns (same bucket, same path conventions).
 * @module lib/sandbox/skill-loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import type { SandboxSkillFile } from "./types";

/**
 * Downloads all files in a user's skill directory from Supabase Storage.
 * Returns a flat array of { path, content } ready to write into the sandbox.
 *
 * @param supabase - Authenticated Supabase client
 * @param clientId - Client ID for storage path scoping
 * @param skillSlug - Skill directory name (e.g. "re-analyst")
 * @returns Array of skill files with relative paths and string content
 */
export async function loadSkillFilesForSandbox(
  supabase: SupabaseClient,
  clientId: string,
  skillSlug: string,
): Promise<SandboxSkillFile[]> {
  const basePath = `${clientId}/skills/${skillSlug}`;
  const files: SandboxSkillFile[] = [];

  // List all files in the skill directory (non-recursive first level)
  const { data: entries, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .list(basePath);

  if (error || !entries) {
    console.warn(`[sandbox] No skill files found at ${basePath}:`, error?.message);
    return [];
  }

  for (const entry of entries) {
    if (entry.name === ".emptyFolderPlaceholder") continue;

    const fullPath = `${basePath}/${entry.name}`;

    // If it's a directory (like "references/"), list its contents recursively
    if (!entry.name.includes(".")) {
      const { data: subEntries } = await supabase.storage
        .from(MEMORY_BUCKET_ID)
        .list(fullPath);

      if (subEntries) {
        for (const subEntry of subEntries) {
          if (subEntry.name === ".emptyFolderPlaceholder") continue;
          const subPath = `${fullPath}/${subEntry.name}`;
          const content = await downloadFileAsString(supabase, subPath);
          if (content !== null) {
            files.push({ path: `${skillSlug}/${entry.name}/${subEntry.name}`, content });
          }
        }
      }
      continue;
    }

    // Regular file
    const content = await downloadFileAsString(supabase, fullPath);
    if (content !== null) {
      files.push({ path: `${skillSlug}/${entry.name}`, content });
    }
  }

  return files;
}

async function downloadFileAsString(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .download(path);

  if (error || !data) {
    console.warn(`[sandbox] Failed to download ${path}:`, error?.message);
    return null;
  }

  return data.text();
}
```

Run: `npx vitest run src/lib/sandbox/__tests__/skill-loader.test.ts` — should pass.

---

## Task 4: Build `runClaudeInSandbox()`

The core function that writes config + skill files + user files into the sandbox, runs Claude Code CLI, and reads the output.

**Files:**
- Create: `src/lib/sandbox/run-claude-in-sandbox.ts`
- Create: `src/lib/sandbox/__tests__/run-claude-in-sandbox.test.ts`

**Step 1: Write failing test**

```typescript
// src/lib/sandbox/__tests__/run-claude-in-sandbox.test.ts
import { describe, expect, it, vi } from "vitest";

import { buildClaudeCliArgs, buildAnalysisPrompt } from "../run-claude-in-sandbox";

describe("buildClaudeCliArgs", () => {
  it("includes --print flag for non-interactive mode", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    expect(args).toContain("--print");
  });

  it("includes --dangerously-skip-permissions", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    expect(args.join(" ")).toContain("--dangerously-skip-permissions");
  });

  it("includes --max-turns", () => {
    const args = buildClaudeCliArgs("analyze this data", 15);
    expect(args).toContain("15");
  });

  it("includes allowed tools", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    const joined = args.join(" ");
    expect(joined).toContain("Read");
    expect(joined).toContain("Write");
    expect(joined).toContain("Bash");
  });
});

describe("buildAnalysisPrompt", () => {
  it("includes xlsx skill read instruction", () => {
    const prompt = buildAnalysisPrompt("compare deals", ["deals.xlsx"], "re-analyst");
    expect(prompt).toContain("/skills/xlsx/SKILL.md");
  });

  it("includes user skill read instruction", () => {
    const prompt = buildAnalysisPrompt("compare deals", ["deals.xlsx"], "re-analyst");
    expect(prompt).toContain("/skills/re-analyst/SKILL.md");
  });

  it("includes output path instructions", () => {
    const prompt = buildAnalysisPrompt("compare deals", ["deals.xlsx"], "re-analyst");
    expect(prompt).toContain("/tmp/output.xlsx");
    expect(prompt).toContain("/tmp/summary.txt");
  });

  it("includes recalc.py instruction", () => {
    const prompt = buildAnalysisPrompt("compare deals", ["deals.xlsx"], "re-analyst");
    expect(prompt).toContain("recalc.py");
  });

  it("lists input files", () => {
    const prompt = buildAnalysisPrompt("compare", ["a.xlsx", "b.csv"], "re-analyst");
    expect(prompt).toContain("a.xlsx");
    expect(prompt).toContain("b.csv");
  });
});
```

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-in-sandbox.test.ts` — should fail.

**Step 2: Implement run-claude-in-sandbox**

```typescript
// src/lib/sandbox/run-claude-in-sandbox.ts
/**
 * Runs Claude Code CLI inside a Vercel Sandbox.
 * Handles: API key config, skill file injection, file upload, CLI execution, output collection.
 * @module lib/sandbox/run-claude-in-sandbox
 */
import type { Sandbox } from "@vercel/sandbox";

import type { SandboxResult, SandboxSkillFile } from "./types";

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;

/** Builds the Claude CLI argument array. Exported for testing. */
export function buildClaudeCliArgs(prompt: string, maxTurns: number): string[] {
  return [
    "--print",
    "--allowedTools", ALLOWED_TOOLS.join(","),
    "--dangerously-skip-permissions",
    "--max-turns", String(maxTurns),
    "-p", prompt,
  ];
}

/** Builds the analysis prompt for Excel tasks. Exported for testing. */
export function buildAnalysisPrompt(
  task: string,
  inputFilenames: string[],
  userSkillSlug?: string,
): string {
  const lines: string[] = [];

  lines.push("Read /skills/xlsx/SKILL.md for Excel best practices (formulas, color coding, verification).");

  if (userSkillSlug) {
    lines.push(
      `Read /skills/${userSkillSlug}/SKILL.md and all files in /skills/${userSkillSlug}/references/ for the user's analysis preferences and domain knowledge. Follow them.`,
    );
  }

  lines.push("");
  lines.push(`Task: ${task}`);
  lines.push("");
  lines.push(`Input files are in /tmp/. Available files: ${inputFilenames.join(", ")}`);
  lines.push("");
  lines.push("Create an Excel financial model at /tmp/output.xlsx:");
  lines.push("- Use Excel FORMULAS, not hardcoded Python calculations");
  lines.push("- Blue text for editable inputs, black for formulas (per xlsx skill)");
  lines.push("- Run: python3 /skills/xlsx/scripts/recalc.py /tmp/output.xlsx");
  lines.push("- If errors found, fix formulas and recalculate until clean");
  lines.push("- Write a human-readable summary to /tmp/summary.txt");

  return lines.join("\n");
}

/** Writes the Anthropic API key config so the Claude CLI can authenticate. */
async function writeApiKeyConfig(sandbox: Sandbox): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for sandbox Claude CLI");

  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `mkdir -p /root/.config/claude && echo '{"apiKey":"${apiKey}"}' > /root/.config/claude/config.json`],
  });
}

// NOTE: xlsx skill files (/skills/xlsx/*) are already in the snapshot.
// No need to write them at runtime. Only user's custom skill files are written.

/** Writes user's custom skill files into the sandbox filesystem. */
async function writeUserSkillFiles(
  sandbox: Sandbox,
  skillFiles: SandboxSkillFile[],
): Promise<void> {
  for (const file of skillFiles) {
    const fullPath = `/skills/${file.path}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `cat > '${fullPath}'`],
      stdin: file.content,
    });
  }
}

/** Downloads a file from a signed URL into the sandbox. */
async function downloadFileIntoSandbox(
  sandbox: Sandbox,
  signedUrl: string,
  filename: string,
): Promise<void> {
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `curl -sL -o '/tmp/${filename}' '${signedUrl}'`],
  });
}

/**
 * Runs Claude Code CLI inside a sandbox for spreadsheet analysis.
 *
 * @param sandbox - An already-created Vercel Sandbox instance
 * @param task - The user's analysis request
 * @param inputFiles - Array of { signedUrl, filename } for files to download into sandbox
 * @param userSkillFiles - User's custom skill files from Supabase Storage
 * @param userSkillSlug - Skill slug for prompt assembly (e.g. "re-analyst")
 * @param maxTurns - Max Claude CLI iterations (default 20)
 */
export async function runClaudeForExcel(
  sandbox: Sandbox,
  task: string,
  inputFiles: Array<{ signedUrl: string; filename: string }>,
  userSkillFiles: SandboxSkillFile[],
  userSkillSlug?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Promise<{ success: boolean; summary: string; cliOutput: string }> {
  // 1. Write API key config
  await writeApiKeyConfig(sandbox);

  // 2. Write user's custom skill files (xlsx skill is already in snapshot)
  if (userSkillFiles.length > 0) {
    await writeUserSkillFiles(sandbox, userSkillFiles);
  }

  // 4. Download input files into sandbox
  const filenames: string[] = [];
  for (const file of inputFiles) {
    await downloadFileIntoSandbox(sandbox, file.signedUrl, file.filename);
    filenames.push(file.filename);
  }

  // 5. Build prompt and run Claude CLI
  const prompt = buildAnalysisPrompt(task, filenames, userSkillSlug);
  const args = buildClaudeCliArgs(prompt, maxTurns);

  const result = await sandbox.runCommand({
    cmd: "claude",
    args,
    timeout: 150_000, // 2.5 min for the CLI itself (sandbox has its own 3 min timeout)
  });

  const cliOutput = (await result.stdout?.()) ?? "";

  // 6. Read output files
  let summary = "";
  try {
    const summaryResult = await sandbox.runCommand({ cmd: "cat", args: ["/tmp/summary.txt"] });
    summary = (await summaryResult.stdout?.()) ?? "";
  } catch {
    summary = "Analysis complete. Check the Excel file for details.";
  }

  const exitCode = result.exitCode ?? 1;

  return {
    success: exitCode === 0,
    summary: summary.trim(),
    cliOutput,
  };
}
```

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-in-sandbox.test.ts` — should pass.

**Note:** The `stdin` parameter for `sandbox.runCommand()` needs to be verified against the actual `@vercel/sandbox` SDK API. If `stdin` is not supported, fall back to `echo '...' | cat > file` or base64-encoding the content. Check the [Vercel Sandbox SDK reference](https://vercel.com/docs/vercel-sandbox/sdk-reference) for the exact `runCommand` signature.

---

## Task 5: Build `analyze_spreadsheet` tool

The Vercel AI SDK tool that the runner calls. Orchestrates the full flow: create sandbox → load skills → load files → run Claude → collect output → upload → destroy.

**Files:**
- Create: `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`

**Step 1: Write failing test for tool factory**

```typescript
// src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue({
      sandboxId: "sbx_test",
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: () => Promise.resolve("Analysis complete"),
        stderr: () => Promise.resolve(""),
      }),
      stop: vi.fn(),
    }),
  },
}));

import { createAnalyzeSpreadsheetTool } from "../analyze-spreadsheet";

describe("createAnalyzeSpreadsheetTool", () => {
  it("returns a tool with correct description", () => {
    const tool = createAnalyzeSpreadsheetTool({} as any, "client_1");
    expect(tool.description).toContain("spreadsheet");
    expect(tool.description).toContain("Excel");
  });

  it("has task and fileUrls parameters", () => {
    const tool = createAnalyzeSpreadsheetTool({} as any, "client_1");
    // Verify the tool's parameter schema has the expected shape
    expect(tool.parameters).toBeDefined();
  });
});
```

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts` — should fail.

**Step 2: Implement the tool**

```typescript
// src/lib/runner/tools/sandbox/analyze-spreadsheet.ts
/**
 * analyze_spreadsheet tool — runs spreadsheet analysis in a Vercel Sandbox.
 * Uses Claude Code CLI with Anthropic's xlsx skill + user's custom RE analysis skill.
 * @module lib/runner/tools/sandbox/analyze-spreadsheet
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import { createSandbox } from "@/lib/sandbox/create-sandbox";
import { runClaudeForExcel } from "@/lib/sandbox/run-claude-in-sandbox";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import type { SandboxOutputFile } from "@/lib/sandbox/types";

const SNAPSHOT_ENV_KEY = "SANDBOX_SNAPSHOT_EXCEL_ID";
const USER_SKILL_SLUG = "re-analyst";

/**
 * Creates the analyze_spreadsheet tool scoped to a client.
 * Added to createRunnerTools() in tool-registry.ts.
 */
export function createAnalyzeSpreadsheetTool(
  supabase: SupabaseClient,
  clientId: string,
) {
  return {
    analyze_spreadsheet: tool({
      description:
        "Analyze spreadsheet data and produce an Excel financial model. " +
        "Use when the user uploads an xlsx/csv file or asks for financial analysis, " +
        "deal comparison, ROI calculation, or any spreadsheet-based analysis. " +
        "Output is a downloadable .xlsx file with proper Excel formulas.",
      parameters: z.object({
        task: z.string().describe("What analysis to perform"),
        fileUrls: z.array(z.string()).describe("Supabase Storage URLs of xlsx/csv files to analyze"),
      }),
      execute: async ({ task, fileUrls }) => {
        const snapshotId = process.env[SNAPSHOT_ENV_KEY];
        if (!snapshotId) {
          return { success: false, error: `Missing ${SNAPSHOT_ENV_KEY} environment variable` };
        }

        let sandbox: Awaited<ReturnType<typeof createSandbox>> | null = null;

        try {
          // 1. Create sandbox from snapshot
          sandbox = await createSandbox({ snapshotId });

          // 2. Load user's custom skill files
          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase, clientId, USER_SKILL_SLUG,
          );

          // 3. Generate signed URLs for the input files
          const inputFiles = await Promise.all(
            fileUrls.map(async (url) => {
              // Extract filename from the URL or storage path
              const filename = url.split("/").pop() ?? "input.xlsx";
              // Generate a short-lived signed URL for the sandbox to download
              const storagePath = url.replace(/^\/agent\//, `${clientId}/`);
              const { data: signedData } = await supabase.storage
                .from(MEMORY_BUCKET_ID)
                .createSignedUrl(storagePath, 300); // 5 min expiry
              return {
                signedUrl: signedData?.signedUrl ?? url,
                filename,
              };
            }),
          );

          // 4. Run Claude Code CLI
          const result = await runClaudeForExcel(
            sandbox, task, inputFiles, userSkillFiles, USER_SKILL_SLUG,
          );

          if (!result.success) {
            return { success: false, error: result.cliOutput || "Analysis failed" };
          }

          // 5. Read output.xlsx from sandbox and upload to Supabase Storage
          const outputFiles: SandboxOutputFile[] = [];

          try {
            // Read the binary file as base64
            const readResult = await sandbox.runCommand({
              cmd: "sh",
              args: ["-c", "base64 /tmp/output.xlsx"],
            });
            const base64Content = (await readResult.stdout?.()) ?? "";

            if (base64Content.trim().length > 0) {
              const buffer = Buffer.from(base64Content.trim(), "base64");
              const outputPath = `${clientId}/artifacts/output-${Date.now()}.xlsx`;

              const { error: uploadError } = await supabase.storage
                .from(MEMORY_BUCKET_ID)
                .upload(outputPath, buffer, {
                  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  upsert: true,
                });

              if (!uploadError) {
                const { data: downloadData } = await supabase.storage
                  .from(MEMORY_BUCKET_ID)
                  .createSignedUrl(outputPath, 60 * 60 * 24 * 7); // 7 day expiry

                outputFiles.push({
                  filename: "output.xlsx",
                  storagePath: outputPath,
                  downloadUrl: downloadData?.signedUrl ?? "",
                });
              }
            }
          } catch (e) {
            console.error("[sandbox] Failed to extract output.xlsx:", e);
          }

          return {
            success: true,
            summary: result.summary,
            outputFiles,
          };
        } catch (error) {
          console.error("[sandbox] analyze_spreadsheet error:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Sandbox execution failed",
          };
        } finally {
          if (sandbox) {
            try {
              await sandbox.stop();
            } catch {
              // Sandbox may already be stopped/destroyed
            }
          }
        }
      },
    }),
  };
}
```

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts` — should pass.

---

## Task 6: Register tool in runner + update system prompt

**Files:**
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add to tool registry**

In `src/lib/runner/tool-registry.ts`, import and add the sandbox tool. Find where `createRunnerTools()` assembles tools and add:

```typescript
import { createAnalyzeSpreadsheetTool } from "./tools/sandbox/analyze-spreadsheet";

// Inside createRunnerTools(), after other tool creation:
const sandboxTools = createAnalyzeSpreadsheetTool(supabase, clientId);
```

And merge `sandboxTools` into the returned tools object (same pattern as CRM tools, storage tools, etc.).

**Step 2: Add system prompt guidance**

In `src/lib/ai/system-prompt.ts`, add guidance for the sandbox tool in the tools instruction section. Add near the other tool descriptions:

```
## analyze_spreadsheet
Use this tool when the user uploads a spreadsheet (.xlsx, .csv) or asks for financial analysis, deal comparison, ROI calculation, or any task requiring an Excel model as output. The tool runs in an isolated sandbox with full code execution — it can read spreadsheets, write Python, create professional Excel models with live formulas, and verify them. Output is a downloadable .xlsx file. Do NOT use this for simple questions about deals — use the opportunity-analysis skill instead. Reserve this tool for when the user explicitly wants an Excel deliverable or complex financial modeling.
```

Run: `npx tsc --noEmit` — should compile.

---

## Task 7: Add environment variables

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (if exists, add locally)

**Step 1: Update .env.example**

Add to `.env.example`:

```bash
# Vercel Sandbox (for analyze_spreadsheet and publish_artifact tools)
SANDBOX_VERCEL_TEAM_ID=
SANDBOX_VERCEL_PROJECT_ID=
SANDBOX_VERCEL_TOKEN=
SANDBOX_SNAPSHOT_EXCEL_ID=
# SANDBOX_SNAPSHOT_ARTIFACT_ID=  # PR 53
```

**Step 2: Set up local env**

The actual values need to come from Vercel dashboard. The snapshot ID won't exist until the snapshot build script is run (Task 9).

---

## Task 8: Build the snapshot

This task creates the `snap_excel` snapshot. It requires a Vercel account with Sandbox access and real credentials.

**Files:**
- Create: `scripts/build-snapshot-excel.ts`

**Step 1: Write the snapshot build script**

See the design doc (section 7, "Build Scripts") for the exact script. The script:

1. Creates a fresh sandbox with `runtime: "node22"`
2. Installs Python 3.13 via `dnf`
3. Installs pandas, openpyxl, xlsxwriter, matplotlib via `pip`
4. Installs LibreOffice Calc via `dnf`
5. Installs gcc via `dnf` (for soffice.py socket shim)
6. Installs Claude Code CLI via `npm install -g`
7. Writes all xlsx skill files from `XLSX_SKILL_FILES` constants into `/skills/xlsx/`
8. Creates `/skills/` and `/tmp/output/` directories
9. Takes a snapshot
10. Prints the snapshot ID

**Step 2: Run it**

```bash
npx tsx scripts/build-snapshot-excel.ts
```

Expected output: `SANDBOX_SNAPSHOT_EXCEL_ID=snap_xxxxxx`

Save this value to `.env.local`.

**Important:** This script takes 5-15 minutes to run (installing LibreOffice is slow). It only needs to run once, or when dependencies change. The snapshot is reused for every `analyze_spreadsheet` invocation.

---

## Task 9: End-to-end integration test (manual)

This is a manual smoke test — the sandbox requires real Vercel credentials and API keys.

**Step 1: Verify env vars are set**

```bash
echo $SANDBOX_VERCEL_TEAM_ID
echo $SANDBOX_SNAPSHOT_EXCEL_ID
echo $ANTHROPIC_API_KEY
```

All should be non-empty.

**Step 2: Test via chat UI**

1. Start the dev server: `npm run dev`
2. Upload a simple `.xlsx` file with 2-3 property deals (price, rent, sqft, tenure)
3. Type: "Build me a comparison model for these deals"
4. Verify:
   - [ ] Chat shows "Analyzing your deals..." or similar
   - [ ] After 30-90s, chat shows a download link
   - [ ] Downloaded .xlsx opens in Excel/Google Sheets
   - [ ] Formulas are live (change an input → calculations update)
   - [ ] Color coding is correct (blue inputs, black formulas)
   - [ ] Summary text in chat accurately describes the analysis

**Step 3: Test without user skill**

If the user hasn't set up a `re-analyst/SKILL.md`, the tool should still work — it falls back to just the xlsx skill without custom preferences.

**Step 4: Test with user skill**

1. In chat: "Set up my property analysis preferences. Net yield must beat 2.5%, mortgage rate 3.8%, focus on D9-D11 freehold."
2. Verify a `re-analyst/SKILL.md` is created in Supabase Storage
3. Upload a spreadsheet again
4. Verify the analysis follows the user's preferences (mentions 2.5% benchmark, 3.8% rate, etc.)

---

## Summary

| Task | What | Depends On |
|---|---|---|
| 1 | Install SDK + types | — |
| 2 | `createSandbox()` wrapper | 1 |
| 3 | `loadSkillFilesForSandbox()` | 1 |
| 4 | `runClaudeInSandbox()` | 2 |
| 5 | `analyze_spreadsheet` tool | 2, 3, 4 |
| 6 | Register in runner + system prompt | 5 |
| 7 | Environment variables | — |
| 8 | Build snapshot (bakes xlsx skill from disk) | 7 |
| 9 | E2E manual test | 6, 8 |

Tasks 1 and 7 can run in parallel. Tasks 2-3 can run in parallel after 1. Task 8 can start after 7 (independent of tool code — just needs env vars and the xlsx skill files on disk at `/Users/sethlim/Downloads/xlsx/`).

**Note on xlsx skill files:** The xlsx skill files are NOT inlined as TypeScript string constants. They're baked into the snapshot during the build step (Task 8). The `skill-templates.ts` inlining pattern was needed for instruction skills because webpack breaks filesystem reads on Vercel Functions. But sandbox skills run inside the sandbox VM, which has a real filesystem — no bundling issue. The snapshot build script reads the files from `/Users/sethlim/Downloads/xlsx/` and writes them into the sandbox before snapshotting.
