# General Sandbox Escape Hatch Implementation Plan

**PR:** PR 55 (out-of-plan — general sandbox escape hatch)
**Decisions:** EXEC-04 (deferred Vercel Sandbox → Sprites), plus design doc decisions 1-15
**Goal:** Replace two hardcoded sandbox tools with one general `execute_in_sandbox` tool, per-client persistent Sprites, auto-queuing, and 7 new sandbox skills.

**Architecture:** Refactors the PR 52/53/54/54a sandbox stack from two domain-specific tools (`analyze_spreadsheet`, `publish_artifact`) into one skill-driven general tool. Per-client persistent Sprites (not per-thread). Auto-queue for concurrent jobs with CAS promotion. Skills declare their own dependencies — no pre-install. Two-tier skill model: primary sandbox skills (direct entry points) and companion skills (domain context, passed via `skills` array). Delivery path globs output dir instead of branching on job type.

**Tech Stack:** Vitest, Zod, Supabase (RLS, Storage, Realtime), Fly.io Sprites SDK (`@fly/sprites`), Vercel AI SDK v6 `tool()`, here.now publishing API

**Design doc:** `docs/plans/2026-03-25-general-sandbox-escape-hatch-design.md`

---

## Task 1: Unify SpriteHandle type and clean up types.ts

**Files:**
- Modify: `src/lib/sandbox/types.ts`
- Test: `src/lib/sandbox/__tests__/sprite-jobs.test.ts` (verify imports still work)

**Step 1: Write the failing test — unified SpriteHandle has the right shape**

In `src/lib/sandbox/__tests__/types.test.ts` (create):

```typescript
import { describe, expect, it } from "vitest";
import type { SpriteHandle } from "../types";

describe("SpriteHandle type", () => {
  it("requires execFile, spawn, and filesystem", () => {
    const handle: SpriteHandle = {
      name: "test-sprite",
      execFile: async () => ({ stdout: "", stderr: "" }),
      spawn: () => {},
      filesystem: () => ({
        writeFile: async () => {},
        readFile: async () => Buffer.from(""),
      }),
    };
    expect(handle.name).toBe("test-sprite");
    expect(typeof handle.execFile).toBe("function");
    expect(typeof handle.spawn).toBe("function");
    expect(typeof handle.filesystem).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/types.test.ts
```

Expected: FAIL — `SpriteHandle` is not exported from `types.ts` (currently only `SpriteSessionRow`, `SpriteSkillFile`, `SpriteOutputFile`, `SpriteResult` are exported)

**Step 3: Add unified SpriteHandle to types.ts**

Add to `src/lib/sandbox/types.ts`:

```typescript
/** Unified Sprite handle for all sandbox operations. */
export interface SpriteHandle {
  name: string;
  execFile: (
    command: string,
    args?: string[],
    options?: { env?: Record<string, string> },
  ) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer; exitCode?: number }>;
  spawn: (
    command: string,
    args?: string[],
    options?: { detachable?: boolean; env?: Record<string, string> },
  ) => void;
  filesystem: (basePath?: string) => {
    writeFile: (path: string, content: string | Buffer) => Promise<void>;
    readFile: (path: string) => Promise<string | Buffer>;
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/types.test.ts
```

Expected: PASS

**Step 5: Verify existing tests still pass**

```bash
npx vitest run src/lib/sandbox/__tests__/
```

Expected: all existing tests pass (no imports changed yet)

**Step 6: Commit**

```bash
git add src/lib/sandbox/types.ts src/lib/sandbox/__tests__/types.test.ts
git commit -m "feat(pr55): add unified SpriteHandle type to types.ts"
```

---

## Task 2: General prompt builder — buildSandboxPrompt()

**Files:**
- Modify: `src/lib/sandbox/run-claude-in-sprite.ts`
- Test: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`

**Step 1: Write the failing test — buildSandboxPrompt with primary skill only**

Add to `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`:

```typescript
import { buildSandboxPrompt } from "../run-claude-in-sprite";

describe("buildSandboxPrompt", () => {
  it("generates prompt with primary skill and input files", () => {
    const prompt = buildSandboxPrompt({
      task: "Generate a PDF report for 123 Main St",
      skillSlugs: ["pdf_creation"],
      inputFilenames: ["comps.xlsx"],
      outputDir: "/workspace/jobs/job-123",
    });
    expect(prompt).toContain("Read /skills/pdf_creation/SKILL.md before starting.");
    expect(prompt).toContain("Task: Generate a PDF report for 123 Main St");
    expect(prompt).toContain("comps.xlsx");
    expect(prompt).toContain("/workspace/jobs/job-123/");
    expect(prompt).toContain("summary.txt");
  });

  it("includes companion skill references", () => {
    const prompt = buildSandboxPrompt({
      task: "Build a comparison spreadsheet",
      skillSlugs: ["excel_editing", "re-analyst"],
      inputFilenames: [],
      outputDir: "/workspace/jobs/job-456",
    });
    expect(prompt).toContain("Read /skills/excel_editing/SKILL.md before starting.");
    expect(prompt).toContain("Also read /skills/re-analyst/SKILL.md");
    expect(prompt).not.toContain("comps.xlsx");
  });

  it("handles no input files", () => {
    const prompt = buildSandboxPrompt({
      task: "Write a thank-you letter",
      skillSlugs: ["docx_editing"],
      inputFilenames: [],
      outputDir: "/workspace/jobs/job-789",
    });
    expect(prompt).toContain("No input files.");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts -t "buildSandboxPrompt"
```

Expected: FAIL — `buildSandboxPrompt` is not exported

**Step 3: Implement buildSandboxPrompt**

Add to `src/lib/sandbox/run-claude-in-sprite.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts -t "buildSandboxPrompt"
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/sandbox/run-claude-in-sprite.ts src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
git commit -m "feat(pr55): add buildSandboxPrompt() general prompt builder"
```

---

## Task 3: Generic delivery path — sandbox-delivery.ts

**Files:**
- Create: `src/lib/sandbox/sandbox-delivery.ts`
- Test: `src/lib/sandbox/__tests__/sandbox-delivery.test.ts`

**Reference:** Current `deliverResult()` in `src/lib/sandbox/sprite-jobs.ts:143-249`. The new module extracts the generic glob+upload logic.

**Step 1: Write failing tests — content type inference**

Create `src/lib/sandbox/__tests__/sandbox-delivery.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { inferContentType } from "../sandbox-delivery";

describe("inferContentType", () => {
  it("infers PDF content type", () => {
    expect(inferContentType("report.pdf")).toBe("application/pdf");
  });

  it("infers Excel content type", () => {
    expect(inferContentType("result.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("infers Word content type", () => {
    expect(inferContentType("letter.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("infers PNG content type", () => {
    expect(inferContentType("chart.png")).toBe("image/png");
  });

  it("infers HTML content type", () => {
    expect(inferContentType("showcase.html")).toBe("text/html; charset=utf-8");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(inferContentType("data.weird")).toBe("application/octet-stream");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sandbox-delivery.test.ts
```

Expected: FAIL — module does not exist

**Step 3: Implement inferContentType**

Create `src/lib/sandbox/sandbox-delivery.ts`:

```typescript
/** Generic sandbox delivery — glob output dir, upload artifacts, format chat message. */

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

const SKIP_FILES = new Set([
  "stream.jsonl",
  ".done",
  ".error",
  "summary.txt",
  "input",
]);

/** Infer MIME content type from filename extension. */
export function inferContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

/** Filter output directory listing to uploadable files only. */
export function filterOutputFiles(filenames: string[]): string[] {
  return filenames.filter((f) => !SKIP_FILES.has(f) && f.trim().length > 0);
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sandbox-delivery.test.ts
```

Expected: PASS

**Step 5: Write failing test — filterOutputFiles**

Add to the test file:

```typescript
import { filterOutputFiles } from "../sandbox-delivery";

describe("filterOutputFiles", () => {
  it("filters out marker and log files", () => {
    const files = ["stream.jsonl", ".done", ".error", "summary.txt", "input", "report.pdf", "chart.png"];
    expect(filterOutputFiles(files)).toEqual(["report.pdf", "chart.png"]);
  });

  it("returns empty array when no output files", () => {
    expect(filterOutputFiles(["stream.jsonl", ".done", "summary.txt"])).toEqual([]);
  });

  it("filters empty strings", () => {
    expect(filterOutputFiles(["", "  ", "report.pdf"])).toEqual(["report.pdf"]);
  });
});
```

**Step 6: Run test to verify it passes (already implemented)**

```bash
npx vitest run src/lib/sandbox/__tests__/sandbox-delivery.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/sandbox/sandbox-delivery.ts src/lib/sandbox/__tests__/sandbox-delivery.test.ts
git commit -m "feat(pr55): add sandbox-delivery.ts with content type inference and file filtering"
```

---

## Task 4: Per-client Sprite session lookup

**Files:**
- Modify: `src/lib/sandbox/sprite-session.ts`
- Test: `src/lib/sandbox/__tests__/sprite-session.test.ts`

**Reference:** Current `findActiveSpriteSession()` uses `.eq("thread_id", threadId)`. Change to `.eq("client_id", clientId).order("last_active_at", { ascending: false }).limit(1)`.

**Step 1: Write failing test — find by client_id**

Add to `src/lib/sandbox/__tests__/sprite-session.test.ts`:

```typescript
describe("findActiveSpriteSessionByClient", () => {
  it("queries by client_id with ORDER BY last_active_at DESC LIMIT 1", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "session-1",
        client_id: "client-abc",
        thread_id: "thread-xyz",
        sprite_name: "sprite-abc",
        status: "running",
        preview_url: null,
        created_at: "2026-01-01T00:00:00Z",
        last_active_at: "2026-03-25T00:00:00Z",
        destroyed_at: null,
      },
      error: null,
    });
    const mockLimit = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
    const mockOrder = vi.fn(() => ({ limit: mockLimit }));
    const mockNeq = vi.fn(() => ({ order: mockOrder }));
    const mockEq = vi.fn(() => ({ neq: mockNeq }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    const supabase = { from: mockFrom } as unknown as SupabaseClient<Database>;

    const result = await findActiveSpriteSessionByClient(supabase, "client-abc");

    expect(mockFrom).toHaveBeenCalledWith("sprite_sessions");
    expect(mockEq).toHaveBeenCalledWith("client_id", "client-abc");
    expect(mockNeq).toHaveBeenCalledWith("status", "destroyed");
    expect(mockOrder).toHaveBeenCalledWith("last_active_at", { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(result?.sprite_name).toBe("sprite-abc");
  });

  it("returns null when no session exists", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockLimit = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
    const mockOrder = vi.fn(() => ({ limit: mockLimit }));
    const mockNeq = vi.fn(() => ({ order: mockOrder }));
    const mockEq = vi.fn(() => ({ neq: mockNeq }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    const supabase = { from: mockFrom } as unknown as SupabaseClient<Database>;

    const result = await findActiveSpriteSessionByClient(supabase, "client-abc");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-session.test.ts -t "findActiveSpriteSessionByClient"
```

Expected: FAIL — function not exported

**Step 3: Implement findActiveSpriteSessionByClient**

Add to `src/lib/sandbox/sprite-session.ts`:

```typescript
/**
 * Returns the most recently active non-destroyed Sprite session for a client.
 * Phase A lookup: ORDER BY last_active_at DESC LIMIT 1 (no unique index required).
 */
export async function findActiveSpriteSessionByClient(
  supabase: SandboxSupabaseClient,
  clientId: string,
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .select("*")
    .eq("client_id", clientId)
    .neq("status", "destroyed")
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read sprite session for client "${clientId}": ${error.message}`);
  }

  return data ? toSpriteSessionRow(data) : null;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-session.test.ts -t "findActiveSpriteSessionByClient"
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/sandbox/sprite-session.ts src/lib/sandbox/__tests__/sprite-session.test.ts
git commit -m "feat(pr55): add per-client Sprite session lookup (Phase A, no unique index)"
```

---

## Task 5: execute_in_sandbox tool handler

**Files:**
- Create: `src/lib/runner/tools/sandbox/execute-in-sandbox.ts`
- Test: `src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts`
- Modify: `src/lib/runner/tools/sandbox/index.ts`

**Reference:** Current `analyze-spreadsheet.ts` for the async flow pattern. New tool uses generic schema.

**Step 1: Write failing test — tool schema validation**

Create `src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindActiveSpriteSessionByClient = vi.hoisted(() => vi.fn());
const mockUpsertSpriteSession = vi.hoisted(() => vi.fn());
const mockTouchSpriteSession = vi.hoisted(() => vi.fn());
const mockGetOrCreateSprite = vi.hoisted(() => vi.fn());
const mockFindRunningJob = vi.hoisted(() => vi.fn());
const mockInsertSpriteJob = vi.hoisted(() => vi.fn());
const mockUpdateJobStatus = vi.hoisted(() => vi.fn());
const mockLaunchBackgroundJob = vi.hoisted(() => vi.fn());
const mockBuildSandboxPrompt = vi.hoisted(() => vi.fn());
const mockLoadSkillFilesForSandbox = vi.hoisted(() => vi.fn());
const mockWriteSkillFiles = vi.hoisted(() => vi.fn());
const mockFetchSafeExternalResource = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sandbox/sprite-session", () => ({
  findActiveSpriteSessionByClient: mockFindActiveSpriteSessionByClient,
  upsertSpriteSession: mockUpsertSpriteSession,
  touchSpriteSession: mockTouchSpriteSession,
}));
vi.mock("@/lib/sandbox/sprites-client", () => ({
  getOrCreateSprite: mockGetOrCreateSprite,
}));
vi.mock("@/lib/sandbox/sprite-jobs", () => ({
  findRunningJob: mockFindRunningJob,
  insertSpriteJob: mockInsertSpriteJob,
  updateJobStatus: mockUpdateJobStatus,
  deriveJobToken: vi.fn(() => "mock-token"),
}));
vi.mock("@/lib/sandbox/run-claude-in-sprite", () => ({
  launchBackgroundJob: mockLaunchBackgroundJob,
  buildSandboxPrompt: mockBuildSandboxPrompt,
  writeSkillFiles: mockWriteSkillFiles,
  buildClaudeEnv: vi.fn(() => ({ ANTHROPIC_API_KEY: "test" })),
}));
vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: mockLoadSkillFilesForSandbox,
}));
vi.mock("@/lib/sandbox/external-url", () => ({
  fetchSafeExternalResource: mockFetchSafeExternalResource,
}));

import { createExecuteInSandboxTool } from "../execute-in-sandbox";

describe("execute_in_sandbox tool", () => {
  const mockSupabase = { from: vi.fn(), storage: { from: vi.fn() } } as unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindActiveSpriteSessionByClient.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite: {
        name: "sprite-abc",
        execFile: vi.fn().mockResolvedValue({ stdout: "" }),
        spawn: vi.fn(),
        filesystem: vi.fn(() => ({
          writeFile: vi.fn(),
          readFile: vi.fn(),
        })),
      },
      spriteName: "sprite-abc",
      isNew: true,
    });
    mockFindRunningJob.mockResolvedValue(null);
    mockInsertSpriteJob.mockResolvedValue(undefined);
    mockUpdateJobStatus.mockResolvedValue(undefined);
    mockLaunchBackgroundJob.mockResolvedValue(undefined);
    mockBuildSandboxPrompt.mockReturnValue("mock prompt");
    mockLoadSkillFilesForSandbox.mockResolvedValue([
      { path: "pdf_creation/SKILL.md", content: "# PDF Creation\n..." },
    ]);
    mockWriteSkillFiles.mockResolvedValue(undefined);
    mockUpsertSpriteSession.mockResolvedValue({ sprite_name: "sprite-abc" });
    mockTouchSpriteSession.mockResolvedValue(undefined);
  });

  it("returns started status for a valid request", async () => {
    const tools = createExecuteInSandboxTool(mockSupabase as any, "client-abc", "thread-123");
    const execute = tools.execute_in_sandbox.execute;

    const result = await execute({
      task: "Generate a PDF",
      skills: ["pdf_creation"],
    }, { toolCallId: "tc-1", messages: [], abortSignal: undefined as any });

    expect(result).toMatchObject({
      success: true,
      status: "started",
    });
    expect(mockLaunchBackgroundJob).toHaveBeenCalled();
  });

  it("queues job when another is running", async () => {
    mockFindRunningJob.mockResolvedValue({ id: "existing-job" });

    const tools = createExecuteInSandboxTool(mockSupabase as any, "client-abc", "thread-123");
    const result = await tools.execute_in_sandbox.execute({
      task: "Generate a PDF",
      skills: ["pdf_creation"],
    }, { toolCallId: "tc-1", messages: [], abortSignal: undefined as any });

    expect(result).toMatchObject({
      success: true,
      status: "queued",
    });
    expect(mockLaunchBackgroundJob).not.toHaveBeenCalled();
    expect(mockInsertSpriteJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "queued" }),
    );
  });

  it("syncs all skills in the array", async () => {
    const tools = createExecuteInSandboxTool(mockSupabase as any, "client-abc", "thread-123");
    await tools.execute_in_sandbox.execute({
      task: "Build a comparison",
      skills: ["excel_editing", "re-analyst"],
    }, { toolCallId: "tc-1", messages: [], abortSignal: undefined as any });

    expect(mockLoadSkillFilesForSandbox).toHaveBeenCalledTimes(2);
    expect(mockLoadSkillFilesForSandbox).toHaveBeenCalledWith(expect.anything(), "client-abc", "excel_editing");
    expect(mockLoadSkillFilesForSandbox).toHaveBeenCalledWith(expect.anything(), "client-abc", "re-analyst");
  });

  it("downloads URL-based inputFiles via fetchSafeExternalResource", async () => {
    mockFetchSafeExternalResource.mockResolvedValue({
      buffer: Buffer.from("photo-data"),
      contentType: "image/jpeg",
    });

    const tools = createExecuteInSandboxTool(mockSupabase as any, "client-abc", "thread-123");
    await tools.execute_in_sandbox.execute({
      task: "Build a showcase",
      skills: ["publish_website"],
      inputFiles: ["https://example.com/photo-1.jpg"],
    }, { toolCallId: "tc-1", messages: [], abortSignal: undefined as any });

    expect(mockFetchSafeExternalResource).toHaveBeenCalledWith("https://example.com/photo-1.jpg");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts
```

Expected: FAIL — module does not exist

**Step 3: Implement execute-in-sandbox.ts**

Create `src/lib/runner/tools/sandbox/execute-in-sandbox.ts`:

```typescript
/**
 * General sandbox execution tool — skill-driven code execution in a persistent Sprite.
 * @module lib/runner/tools/sandbox/execute-in-sandbox
 */
import crypto from "crypto";

import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fetchSafeExternalResource } from "@/lib/sandbox/external-url";
import {
  buildSandboxPrompt,
  launchBackgroundJob,
  writeSkillFiles,
} from "@/lib/sandbox/run-claude-in-sprite";
import { jobOutputDir } from "@/lib/sandbox/sandbox-paths";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import {
  findRunningJob,
  insertSpriteJob,
  updateJobStatus,
} from "@/lib/sandbox/sprite-jobs";
import {
  findActiveSpriteSessionByClient,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import type { SpriteSkillFile } from "@/lib/sandbox/types";
import type { Database } from "@/types/database";

const executeInSandboxSchema = z.object({
  task: z.string().min(1).describe("What to do in the sandbox."),
  skills: z.array(z.string().min(1)).min(1).describe(
    "Skill slugs. First is primary, rest are companions.",
  ),
  inputFiles: z.array(z.string().min(1)).optional().describe(
    "Supabase Storage paths or URLs to download into the sandbox.",
  ),
});

function isUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function extractFilename(value: string): string {
  const parts = value.split("/");
  return parts[parts.length - 1] || `file-${Date.now()}`;
}

/**
 * Creates the general sandbox execution tool for one runner invocation.
 */
export function createExecuteInSandboxTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    execute_in_sandbox: tool({
      description:
        "Execute a task in a persistent sandbox computer with Python, bash, and package installation. " +
        "Use when a skill's description says 'execute_in_sandbox'. " +
        "Pass the skill slug(s) and a task description. Input files are downloaded into the sandbox.",
      parameters: executeInSandboxSchema,
      execute: async ({ task, skills, inputFiles }) => {
        const token = process.env.SPRITES_TOKEN?.trim();
        if (!token) {
          return { success: false, error: "Sandbox is not configured." };
        }

        // 1. Get or create per-client Sprite
        const existingSession = await findActiveSpriteSessionByClient(supabase, clientId);
        const { sprite, spriteName, isNew } = await getOrCreateSprite({
          token,
          existingSpriteName: existingSession?.sprite_name,
          spriteName: `client-${clientId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`,
        });

        await upsertSpriteSession(supabase, {
          client_id: clientId,
          thread_id: threadId,
          sprite_name: spriteName,
          status: "running",
        });

        // 2. Check for running job — queue if busy
        const runningJob = await findRunningJob(supabase, spriteName);
        const jobId = crypto.randomUUID();
        const outputDir = jobOutputDir(jobId);

        const jobMeta = {
          skills,
          task,
          inputFiles: inputFiles ?? [],
          outputDir,
        };

        if (runningJob) {
          await insertSpriteJob(supabase, {
            id: jobId,
            client_id: clientId,
            thread_id: threadId,
            sprite_name: spriteName,
            job_type: "sandbox",
            job_meta: jobMeta,
            status: "queued",
          });
          return {
            success: true,
            status: "queued",
            message: "Queued — I'll start once the current job finishes.",
          };
        }

        // 3. Sync skills to Sprite
        const allSkillFiles: SpriteSkillFile[] = [];
        for (const slug of skills) {
          const files = await loadSkillFilesForSandbox(supabase, clientId, slug);
          allSkillFiles.push(...files);
        }
        const filesystem = sprite.filesystem();
        await writeSkillFiles(sprite, filesystem, allSkillFiles);

        // 4. Download input files to job-scoped input dir
        const inputDir = `${outputDir}/input`;
        await sprite.execFile("mkdir", ["-p", inputDir]);
        const inputFilenames: string[] = [];

        for (const fileRef of inputFiles ?? []) {
          const filename = extractFilename(fileRef);
          inputFilenames.push(filename);

          if (isUrl(fileRef)) {
            const { buffer } = await fetchSafeExternalResource(fileRef);
            const inputFs = sprite.filesystem(inputDir);
            await inputFs.writeFile(filename, buffer);
          } else {
            // Storage-relative path — download via Supabase Storage
            const storagePath = `${clientId}/${fileRef}`;
            const bucket = supabase.storage.from("memory");
            const { data, error } = await bucket.download(storagePath);
            if (error || !data) {
              return { success: false, error: `Failed to download ${fileRef}: ${error?.message}` };
            }
            const buffer = Buffer.from(await data.arrayBuffer());
            const inputFs = sprite.filesystem(inputDir);
            await inputFs.writeFile(filename, buffer);
          }
        }

        // 5. Insert job row and launch
        await insertSpriteJob(supabase, {
          id: jobId,
          client_id: clientId,
          thread_id: threadId,
          sprite_name: spriteName,
          job_type: "sandbox",
          job_meta: jobMeta,
          status: "starting",
        });

        const prompt = buildSandboxPrompt({
          task,
          skillSlugs: skills,
          inputFilenames,
          outputDir,
        });

        await launchBackgroundJob(sprite, jobId, { prompt, maxTurns: 20 });
        await updateJobStatus(supabase, jobId, "running");
        await touchSpriteSession(supabase, spriteName);

        return {
          success: true,
          status: "started",
          message: "Working on it — I'll share the result when it's ready.",
        };
      },
    }),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts
```

Expected: PASS

**Step 5: Update barrel export in index.ts**

Modify `src/lib/runner/tools/sandbox/index.ts`:

```typescript
/**
 * Sandbox tool factory barrel.
 * @module lib/runner/tools/sandbox
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createExecuteInSandboxTool } from "./execute-in-sandbox";

/**
 * Creates all sandbox-backed tools for a specific client/thread context.
 */
export function createSandboxTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  return {
    ...createExecuteInSandboxTool(supabase, clientId, threadId),
  };
}
```

**Step 6: Run all sandbox tests**

```bash
npx vitest run src/lib/sandbox/__tests__/ src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts
```

Expected: new tests pass. Old `analyze-spreadsheet.test.ts` and `publish-artifact.test.ts` may fail (expected — they import deleted tools). We'll clean those up in Task 8.

**Step 7: Commit**

```bash
git add src/lib/runner/tools/sandbox/execute-in-sandbox.ts src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts src/lib/runner/tools/sandbox/index.ts
git commit -m "feat(pr55): add execute_in_sandbox general tool with queue support"
```

---

## Task 6: Refactor deliverResult() for generic glob-based delivery + queue chaining

**Files:**
- Modify: `src/lib/sandbox/sprite-jobs.ts`
- Test: `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts`

**Reference:** Current `deliverResult()` at `src/lib/sandbox/sprite-jobs.ts:143-249`. Replace job_type branching with generic glob.

**Step 1: Write failing test — generic delivery globs output dir**

Add to or rewrite in `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts`:

```typescript
describe("deliverResult (generic sandbox)", () => {
  it("uploads all non-marker files from output dir", async () => {
    // Mock sprite that returns file listing and file contents
    const mockExecFile = vi.fn()
      .mockResolvedValueOnce({ stdout: "stream.jsonl\n.done\nsummary.txt\ninput\nreport.pdf\nchart.png\n" }) // ls
    ;
    const mockReadFile = vi.fn()
      .mockResolvedValueOnce("Market report for 123 Main St.") // summary.txt
      .mockResolvedValueOnce(Buffer.from("pdf-content"))        // report.pdf
      .mockResolvedValueOnce(Buffer.from("png-content"))        // chart.png
    ;
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn((basePath?: string) => ({
        readFile: mockReadFile,
      })),
    };

    const job = makeJobRow({
      job_type: "sandbox",
      job_meta: { skills: ["pdf_creation"], task: "test", inputFiles: [], outputDir: "/workspace/jobs/job-1" },
    });

    await deliverResult(job, sprite as any, mockSupabase as any);

    // Should have uploaded 2 files (report.pdf and chart.png)
    expect(mockUploadArtifact).toHaveBeenCalledTimes(2);
    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("handles QUESTION: prefix in summary", async () => {
    const mockExecFile = vi.fn()
      .mockResolvedValueOnce({ stdout: "stream.jsonl\n.done\nsummary.txt\n" });
    const mockReadFile = vi.fn()
      .mockResolvedValueOnce("QUESTION: Should I use a 6% or 7% cap rate?");
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn(() => ({ readFile: mockReadFile })),
    };

    const job = makeJobRow({ job_type: "sandbox", result_meta: null });
    await deliverResult(job, sprite as any, mockSupabase as any);

    // Should not upload any artifacts
    expect(mockUploadArtifact).not.toHaveBeenCalled();
    // Should insert message with the question
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining("cap rate") }),
        ]),
      }),
    );
  });

  it("chains to next queued job after delivery", async () => {
    // First job completes, second is queued
    const mockExecFile = vi.fn()
      .mockResolvedValueOnce({ stdout: "stream.jsonl\n.done\nsummary.txt\nresult.pdf\n" });
    const mockReadFile = vi.fn()
      .mockResolvedValueOnce("Done.")
      .mockResolvedValueOnce(Buffer.from("pdf"));
    const sprite = {
      name: "sprite-abc",
      execFile: mockExecFile,
      spawn: vi.fn(),
      filesystem: vi.fn(() => ({
        readFile: mockReadFile,
        writeFile: vi.fn(),
      })),
    };

    // Mock: after completing job 1, find queued job 2
    mockSupabaseSelectQueuedJob.mockResolvedValueOnce({
      data: {
        id: "job-2",
        thread_id: "thread-456",
        client_id: "client-abc",
        sprite_name: "sprite-abc",
        job_meta: { skills: ["docx_editing"], task: "Write letter", inputFiles: [], outputDir: "/workspace/jobs/job-2" },
        status: "queued",
      },
      error: null,
    });
    // Mock: CAS claim succeeds
    mockSupabaseCASUpdate.mockResolvedValueOnce({ count: 1 });

    const job = makeJobRow({ job_type: "sandbox" });
    await deliverResult(job, sprite as any, mockSupabase as any);

    // Should have inserted a "starting" notification message
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining("Starting your docx_editing task") }),
        ]),
      }),
    );
  });
});
```

> **Note:** The exact mock shapes above are illustrative. When implementing, match the mock patterns from the existing `sprite-jobs-delivery.test.ts` file (hoisted mocks, `makeJobRow()` factory, etc.). The test intent is what matters.

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts -t "generic sandbox"
```

Expected: FAIL — delivery still branches on job_type

**Step 3: Implement generic delivery in sprite-jobs.ts**

Refactor `deliverResult()` in `src/lib/sandbox/sprite-jobs.ts`. Key changes:

1. Remove the `import { ensureDevServerService }` from `artifact-runner.ts`
2. Replace the `if (job.job_type === "analyze") ... else if (job.job_type === "artifact")` block with:
   - `ls` the output dir
   - `filterOutputFiles()` from `sandbox-delivery.ts`
   - Upload each file with `inferContentType()`
3. Add backward compat: if `job.job_type === "analyze" || job.job_type === "artifact"`, fall through to legacy logic (keep old code in a separate function)
4. Add queue chaining after marking completed
5. Replace `"Analysis failed..."` with `"Sandbox job failed. Want me to try again?"`
6. Update `cleanupStaleSprites()` constant from 7 to 30 days

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts
```

Expected: PASS (both old legacy tests via compat path and new generic tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/sprite-jobs.ts src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts
git commit -m "feat(pr55): refactor deliverResult() to generic glob delivery + queue chaining"
```

---

## Task 7: System prompt, context assembly, and HERENOW_API_KEY

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/sandbox/claude-env.ts`
- Test: `src/lib/ai/__tests__/system-prompt.test.ts`
- Test: `src/lib/runner/__tests__/context.test.ts`

**Step 1: Write failing test — SANDBOX_PROMPT updated**

Update in `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
it("SANDBOX_PROMPT mentions execute_in_sandbox, not analyze_spreadsheet", () => {
  expect(SANDBOX_PROMPT).toContain("execute_in_sandbox");
  expect(SANDBOX_PROMPT).not.toContain("analyze_spreadsheet");
  expect(SANDBOX_PROMPT).not.toContain("publish_artifact");
  expect(SANDBOX_PROMPT).toContain("Skills declare their own package dependencies");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — current SANDBOX_PROMPT still says `analyze_spreadsheet`

**Step 3: Update SANDBOX_PROMPT in system-prompt.ts**

Replace the `SANDBOX_PROMPT` export in `src/lib/ai/system-prompt.ts`:

```typescript
export const SANDBOX_PROMPT = `<sandbox-tools>
You have access to a persistent sandbox computer via execute_in_sandbox.
The sandbox has Python and bash. Skills declare their own package
dependencies — packages are cached after first install.

Skills whose description says "execute_in_sandbox" are sandbox skills —
invoke execute_in_sandbox with that skill's slug.

All other skills: read the SKILL.md via read_file and follow its
workflow using your structured tools (which may include calling
execute_in_sandbox with additional companion skills as one step).

Gather first, then hand off:
The sandbox runs an isolated coding agent that CANNOT access CRM, memory, web search, or any other platform tools. ALWAYS gather all needed data before calling execute_in_sandbox:
1. Search CRM for relevant data (search_crm, get_deal, etc.)
2. Read SOUL.md for agent context (read_file)
3. Web search for market data (web_search)
4. THEN call execute_in_sandbox with everything gathered in the task description

After the sandbox returns, present the result and offer to iterate.
</sandbox-tools>`;
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: PASS

**Step 5: Write failing test — formatAvailableSkills emits tool hint for sandbox skills**

Add to `src/lib/runner/__tests__/context.test.ts`:

```typescript
it("emits execute_in_sandbox hint for sandbox skills", () => {
  const skills = [
    { name: "pdf_creation", slug: "pdf_creation", description: "Create PDF reports. Use execute_in_sandbox when asked to generate PDFs." },
    { name: "call-prep", slug: "call-prep", description: "Prepare for meetings." },
  ];
  const result = formatAvailableSkills(skills);
  expect(result).toContain('execute_in_sandbox("pdf_creation")');
  expect(result).toContain("read_file");
  expect(result).not.toContain('execute_in_sandbox("call-prep")');
});
```

**Step 6: Run test to verify it fails**

Expected: FAIL — `formatAvailableSkills` doesn't emit `execute_in_sandbox` hint

**Step 7: Update formatAvailableSkills in context.ts**

Modify `formatAvailableSkills()` in `src/lib/runner/context.ts` to check for `execute_in_sandbox` in the skill description:

```typescript
function formatAvailableSkills(userSkills?: SkillMetadata[]): string | null {
  if (!userSkills || userSkills.length === 0) return null;

  const listing = userSkills
    .map((skill) => {
      const isSandboxSkill = skill.description?.includes("execute_in_sandbox");
      const hint = isSandboxSkill
        ? `→ execute_in_sandbox("${skill.slug}")`
        : `→ read_file("skills/${skill.slug}/SKILL.md")`;
      return `- ${skill.slug}: ${skill.description ?? ""}\n  ${hint}`;
    })
    .join("\n");

  return `<available-skills>\n${listing}\n</available-skills>`;
}
```

**Step 8: Update active job injection copy**

In `src/lib/runner/context.ts`, find the active job injection block (~line 477-488) and update:

```typescript
jobsContext += `- sandbox job running for ${elapsed} min${progress}\n`;
// ...
jobsContext += "\nYou can queue another sandbox job — it will start when the current one finishes.\n";
```

**Step 9: Add HERENOW_API_KEY to claude-env.ts**

Add to `buildSandboxClaudeEnv()` in `src/lib/sandbox/claude-env.ts`, at the end of both the OpenRouter and Anthropic branches:

```typescript
const herenowApiKey = env.HERENOW_API_KEY?.trim();
if (herenowApiKey) {
  result.HERENOW_API_KEY = herenowApiKey;
}
```

**Step 10: Run all modified tests**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts src/lib/runner/__tests__/context.test.ts src/lib/sandbox/__tests__/
```

Expected: PASS

**Step 11: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/runner/context.ts src/lib/sandbox/claude-env.ts src/lib/ai/__tests__/system-prompt.test.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(pr55): update system prompt, context assembly, and claude env for general sandbox"
```

---

## Task 8: Add new sandbox skill templates + rewrite existing skill bodies + migration

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`
- Modify: `src/lib/runner/skills/skill-bootstrap.ts`
- Test: `src/lib/runner/skills/__tests__/skill-templates.test.ts`

**Reference:** Viktor skills at `roadmap docs/Sunder - Source of Truth/references/viktor-ai/11-skills-verbatim.md`. Design doc Section 5.2 and 5.3.

**Step 1: Write failing test — new skill slugs exist**

Update `src/lib/runner/skills/__tests__/skill-templates.test.ts`:

```typescript
it("includes all 20 default skill slugs", () => {
  expect(DEFAULT_SKILL_SLUGS).toHaveLength(20);
  expect(DEFAULT_SKILL_SLUGS).toContain("pdf_creation");
  expect(DEFAULT_SKILL_SLUGS).toContain("excel_editing");
  expect(DEFAULT_SKILL_SLUGS).toContain("docx_editing");
  expect(DEFAULT_SKILL_SLUGS).toContain("pptx_editing");
  expect(DEFAULT_SKILL_SLUGS).toContain("pdf_form_filling");
  expect(DEFAULT_SKILL_SLUGS).toContain("pdf_signing");
  expect(DEFAULT_SKILL_SLUGS).toContain("publish_website");
});

it("sandbox skills include execute_in_sandbox in their descriptions", () => {
  const sandboxSlugs = ["pdf_creation", "excel_editing", "docx_editing", "pptx_editing", "pdf_form_filling", "pdf_signing", "publish_website"];
  for (const slug of sandboxSlugs) {
    const content = DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
    expect(content).toContain("execute_in_sandbox");
  }
});

it("companion skills do NOT include execute_in_sandbox", () => {
  const companionSlugs = ["re-analyst", "frontend-design"];
  for (const slug of companionSlugs) {
    const content = DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
    expect(content).not.toContain("execute_in_sandbox");
  }
});

it("outer workflow skills reference execute_in_sandbox in their body, not analyze_spreadsheet", () => {
  const workflowSlugs = ["deal-comparison", "property-showcase", "market-report"];
  for (const slug of workflowSlugs) {
    const content = DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
    expect(content).toContain("execute_in_sandbox");
    expect(content).not.toContain("analyze_spreadsheet");
    expect(content).not.toContain("publish_artifact");
  }
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-templates.test.ts
```

Expected: FAIL — only 13 slugs, no `execute_in_sandbox` references

**Step 3: Add 7 new skill content strings to skill-templates.ts**

Add to `DEFAULT_SKILL_SLUGS` and `DEFAULT_SKILL_CONTENT` in `src/lib/runner/skills/skill-templates.ts`. Use the Viktor skill content from `roadmap docs/Sunder - Source of Truth/references/viktor-ai/11-skills-verbatim.md` as a base, adapted for Sunder. Each must include `execute_in_sandbox` in the YAML frontmatter description. Each should include a `## Setup` section declaring its pip dependencies.

Also rewrite the bodies of `deal-comparison`, `property-showcase`, and `market-report` to use `execute_in_sandbox({ skills: [...], ... })` instead of `analyze_spreadsheet`/`publish_artifact`.

Also update `re-analyst` and `frontend-design` to remove any references to `analyze_spreadsheet`/`publish_artifact` from their bodies (but do NOT add `execute_in_sandbox` to their descriptions — they're companions).

> **Implementation note:** The actual skill content strings are long (50-200 lines each). Use the Viktor verbatim docs as a starting point and adapt. This step is content-heavy, not logic-heavy.

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-templates.test.ts
```

Expected: PASS

**Step 5: Write failing test — migrateSkillBodies**

Add to `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`:

```typescript
describe("migrateSkillBodies", () => {
  it("force-overwrites the 5 changed skills for existing clients", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      storage: { from: vi.fn(() => ({ upload: mockUpload })) },
    } as unknown;

    await migrateSkillBodies(supabase as any, "client-abc");

    // Should have uploaded 5 skills with upsert: true
    expect(mockUpload).toHaveBeenCalledTimes(5);
    const slugsUpdated = mockUpload.mock.calls.map(
      (call: unknown[]) => (call[0] as string).split("/")[2],
    );
    expect(slugsUpdated).toContain("deal-comparison");
    expect(slugsUpdated).toContain("property-showcase");
    expect(slugsUpdated).toContain("market-report");
    expect(slugsUpdated).toContain("re-analyst");
    expect(slugsUpdated).toContain("frontend-design");

    // All calls should use upsert: true (force overwrite)
    for (const call of mockUpload.mock.calls) {
      expect(call[2]).toMatchObject({ upsert: true });
    }
  });
});
```

**Step 6: Implement migrateSkillBodies**

Add to `src/lib/runner/skills/skill-bootstrap.ts`:

```typescript
const MIGRATED_SKILL_SLUGS: DefaultSkillSlug[] = [
  "deal-comparison",
  "property-showcase",
  "market-report",
  "re-analyst",
  "frontend-design",
];

/**
 * Force-overwrites skill bodies that changed in the sandbox generalization.
 * Uses upsert: true (unlike bootstrapSkills which uses upsert: false).
 */
export async function migrateSkillBodies(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  for (const slug of MIGRATED_SKILL_SLUGS) {
    const content = DEFAULT_SKILL_CONTENT[slug];
    const storagePath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`;
    const { error } = await supabase.storage
      .from(MEMORY_BUCKET_ID)
      .upload(storagePath, content, {
        upsert: true,
        contentType: MEMORY_TEXT_CONTENT_TYPE,
      });

    if (error) {
      throw new Error(`Failed to migrate skill ${slug}: ${getStorageErrorMessage(error)}`);
    }
  }
}
```

**Step 7: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-bootstrap.test.ts -t "migrateSkillBodies"
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/lib/runner/skills/skill-templates.ts src/lib/runner/skills/skill-bootstrap.ts src/lib/runner/skills/__tests__/skill-templates.test.ts src/lib/runner/skills/__tests__/skill-bootstrap.test.ts
git commit -m "feat(pr55): add 7 sandbox skills, rewrite 5 existing skill bodies, add migration"
```

---

## Task 9: Delete old files and clean up imports

**Files to delete:**
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`
- `src/lib/runner/tools/sandbox/publish-artifact.ts`
- `src/lib/sandbox/artifact-runner.ts`
- `src/lib/sandbox/artifact-prompt.ts`
- `src/lib/sandbox/templates/` (entire directory)
- `src/lib/sandbox/skills/xlsx/` (entire directory)
- `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`
- `src/lib/sandbox/__tests__/artifact-prompt.test.ts`
- `src/lib/sandbox/__tests__/artifact-runner.test.ts`

**Files to clean up:**
- `src/lib/sandbox/run-claude-in-sprite.ts` — delete `runClaudeInSprite()`, `buildAnalysisPrompt()`, `ensureSpreadsheetDependencies()`, `ensureBundledXlsxSkillFiles()`, `clearSpreadsheetOutputs()`, `getBundledXlsxSkillFiles()`, `loadBundledXlsxSkillFiles()`, and the `bundledXlsxSkillFilesPromise` variable. Keep `launchBackgroundJob()`, `buildClaudeCliArgs()`, `buildClaudeEnv()`, `writeSkillFiles()`, and the new `buildSandboxPrompt()`.
- `src/lib/sandbox/sprite-jobs.ts` — remove import of `ensureDevServerService` from `artifact-runner.ts`. Remove `SpriteHandle` interface (use unified one from `types.ts`).
- `src/lib/runner/tool-registry.ts` — no changes needed (already imports from `index.ts` barrel which now exports `execute_in_sandbox`).
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` — remove tests for deleted functions.

**Step 1: Delete files**

```bash
rm src/lib/runner/tools/sandbox/analyze-spreadsheet.ts
rm src/lib/runner/tools/sandbox/publish-artifact.ts
rm src/lib/sandbox/artifact-runner.ts
rm src/lib/sandbox/artifact-prompt.ts
rm -rf src/lib/sandbox/templates/
rm -rf src/lib/sandbox/skills/xlsx/
rm src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts
rm src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts
rm src/lib/sandbox/__tests__/artifact-prompt.test.ts
rm src/lib/sandbox/__tests__/artifact-runner.test.ts
```

**Step 2: Clean up run-claude-in-sprite.ts**

Remove the deleted functions and the `bundledXlsxSkillFilesPromise` variable. Remove the `import { readFile }` and `import { dirname, resolve }` if no longer used (they were only for `loadBundledXlsxSkillFiles`). Update the local `SpriteHandle` type to import from `types.ts` instead:

```typescript
import type { SpriteHandle } from "./types";
```

Remove the local `type SpriteHandle = { ... }` definition.

**Step 3: Clean up sprite-jobs.ts**

Remove `import { ensureDevServerService, type SpriteHandle as FullSpriteHandle } from "./artifact-runner"`. Replace the local `SpriteHandle` interface with import from `types.ts`. Remove `url`, `listServices`, `createService`, `startService`, `updateURLSettings` from the handle requirements.

**Step 4: Run all tests**

```bash
npx vitest run src/lib/sandbox/__tests__/ src/lib/runner/tools/sandbox/__tests__/ src/lib/runner/__tests__/ src/lib/ai/__tests__/
```

Expected: all remaining tests pass. Deleted test files are gone.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(pr55): delete old sandbox tools, artifact runner, templates, and bundled xlsx skill"
```

---

## Task 10: DB migration — sprite_sessions Phase A + sprite_jobs queue support + 30-day cleanup

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_sandbox_generalization.sql`

**Step 1: Write the migration**

```sql
-- Phase A: Per-client Sprite sessions (no unique index yet)
-- Dedupe: keep most recent active session per client, mark orphans as destroyed.
-- Skips clients with active (starting/running) jobs on any session.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT client_id, sprite_name, last_active_at,
           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY last_active_at DESC) AS rn
    FROM sprite_sessions
    WHERE status != 'destroyed'
  )
  LOOP
    IF r.rn > 1 THEN
      -- Only mark as destroyed if no active jobs
      IF NOT EXISTS (
        SELECT 1 FROM sprite_jobs
        WHERE sprite_name = r.sprite_name
        AND status IN ('starting', 'running')
      ) THEN
        UPDATE sprite_sessions
        SET status = 'destroyed', destroyed_at = NOW()
        WHERE sprite_name = r.sprite_name;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Allow queued jobs: update the partial unique index to exclude queued status
-- Current: one active (starting OR running) job per sprite
-- After: same constraint, queued rows exempt
-- (If the current index already only covers starting/running, this is a no-op)

-- Add job_type = 'sandbox' as a valid job_type (no enum — just a string column)
-- No schema change needed — job_type is already a text column.

COMMENT ON TABLE sprite_sessions IS 'Per-client persistent Sprite sessions. Phase A: lookup by client_id ORDER BY last_active_at DESC LIMIT 1. Phase B (follow-up): add unique index on client_id.';
```

**Step 2: Apply migration locally**

```bash
npx supabase db push --local
```

**Step 3: Verify migration**

```bash
npx supabase db diff
```

Expected: no unexpected changes

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(pr55): Phase A migration — dedupe sprite_sessions, allow queued jobs"
```

---

## Relevant Files (Full List)

### Created
- `src/lib/runner/tools/sandbox/execute-in-sandbox.ts`
- `src/lib/sandbox/sandbox-delivery.ts`
- `src/lib/sandbox/__tests__/types.test.ts`
- `src/lib/sandbox/__tests__/sandbox-delivery.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts`
- `supabase/migrations/YYYYMMDDHHMMSS_sandbox_generalization.sql`

### Modified
- `src/lib/sandbox/types.ts` — unified SpriteHandle
- `src/lib/sandbox/run-claude-in-sprite.ts` — add buildSandboxPrompt, delete old functions, import SpriteHandle from types
- `src/lib/sandbox/sprite-jobs.ts` — generic delivery, queue chaining, 30-day cleanup, generic failure copy
- `src/lib/sandbox/sprite-session.ts` — findActiveSpriteSessionByClient
- `src/lib/sandbox/claude-env.ts` — HERENOW_API_KEY
- `src/lib/runner/tools/sandbox/index.ts` — new barrel
- `src/lib/ai/system-prompt.ts` — SANDBOX_PROMPT
- `src/lib/runner/context.ts` — formatAvailableSkills, active job injection
- `src/lib/runner/skills/skill-templates.ts` — 7 new skills, 5 body rewrites
- `src/lib/runner/skills/skill-bootstrap.ts` — migrateSkillBodies

### Deleted
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`
- `src/lib/runner/tools/sandbox/publish-artifact.ts`
- `src/lib/sandbox/artifact-runner.ts`
- `src/lib/sandbox/artifact-prompt.ts`
- `src/lib/sandbox/templates/` (entire directory)
- `src/lib/sandbox/skills/xlsx/` (entire directory)
- `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`
- `src/lib/sandbox/__tests__/artifact-prompt.test.ts`
- `src/lib/sandbox/__tests__/artifact-runner.test.ts`

### Test Files (Modified)
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`
- `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts`
- `src/lib/sandbox/__tests__/sprite-session.test.ts`
- `src/lib/sandbox/__tests__/cleanup-sprites.test.ts`
- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/ai/__tests__/system-prompt.test.ts`
- `src/lib/runner/skills/__tests__/skill-templates.test.ts`
- `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`

---

## Notes

- **Phase B migration** (add `client_id`-only unique index on `sprite_sessions`) is a follow-up deploy after all old per-thread sessions have drained.
- **Backward-compatible delivery** for in-flight `"analyze"`/`"artifact"` jobs is included in Task 6. Remove in a follow-up PR once all old jobs have completed.
- **Skill content writing** (Task 8) is the most time-consuming step — 7 new skill bodies + 5 rewrites. Use Viktor verbatim docs as a starting point.
- **here.now API key** (`HERENOW_API_KEY`) must be added to `.env.local` and Vercel environment variables before the `publish_website` skill can work.
- Run `npx vitest run` after each task to catch regressions early.
