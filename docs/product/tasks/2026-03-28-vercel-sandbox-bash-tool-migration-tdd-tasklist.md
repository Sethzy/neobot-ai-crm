# Vercel Sandbox + `bash-tool` Migration — TDD Tasklist

**PR:** Out-of-plan architecture migration
**Decisions:** `EXEC-04` (Vercel Sandbox), Tasklet flat-tool pattern, 2026-03-28 design session
**Goal:** Replace Sprites (Fly.io) + nested Claude Code agent with ephemeral Vercel Sandbox using `bash-tool` package.

**Architecture:** The runner keeps its existing `streamText()` loop and flat tool surface. A new `bash` tool is registered at run start but initializes lazily on first call. On first use it creates an ephemeral Vercel Sandbox from a golden snapshot, preloads files via `sandbox.writeFiles()`, constructs the real `bash-tool` bash tool, delegates the command, and syncs output artifacts back to Supabase Storage after each call. Cleanup uses `onFinish`/`onError` stream callbacks.

**Tech Stack:** `ai` v6, `bash-tool` ^1.3.15, `@vercel/sandbox` ^1.9.0, Zod 4, Supabase Storage, Vitest

**Design / review inputs:**
- `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md`
- `roadmap docs/Sunder - Source of Truth/references/vercel-bash/01-vercel-sandbox-reference-repos-analysis.md`
- `docs/product/handovers/2026-03-28-vercel-sandbox-migration-handover.md`

**Local reference repos (clone code from these):**
- `/Users/sethlim/Documents/bash-tool`
- `/Users/sethlim/Documents/call-summary-agent-with-sandbox`
- `/Users/sethlim/Documents/oss-data-analyst`

**Review fixes baked in (override stale parts of design doc):**
1. Workspace path: `/vercel/sandbox/workspace` (bash-tool's Vercel default)
2. SDK versions: `bash-tool@^1.3.15`, `@vercel/sandbox@^1.9.0`
3. Auth: OIDC preferred (automatic on Vercel), `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` fallback for local dev
4. Binary preload: all files via `sandbox.writeFiles()`, not `createBashTool({ files })`
5. Artifact sync: after each `bash` call, not end-of-run
6. Cleanup: `onFinish`/`onError` callbacks, not `finally`
7. Skill preload: all user-authored skills, not just active one
8. Existing `maxDuration = 300` — no change needed
9. Sprite table drop migration already exists — do not duplicate

**Out of scope:**
- Legacy Analyst endpoint (`src/server/api/chat.ts`)
- Subagent access to `bash` tool
- Sandbox preview URLs / published sites
- Old `execute_in_sandbox` API

---

## Relevant Files

### Create
- `src/lib/runner/tools/sandbox/types.ts`
- `src/lib/runner/tools/sandbox/build-context-json.ts`
- `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`
- `src/lib/runner/tools/sandbox/build-preload-files.ts`
- `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`
- `src/lib/runner/tools/sandbox/index.ts`

### Modify
- `package.json`
- `.env.example`
- `src/lib/env.ts`
- `src/lib/__tests__/env.test.ts`
- `src/lib/ai/system-prompt.ts`
- `src/lib/runner/context.ts` — wire `SANDBOX_PROMPT` into `buildSystemPrompt()`
- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/runner/run-agent.ts`
- `src/lib/runner/__tests__/run-agent.test.ts`

### Reference Only
- `src/lib/runner/tool-registry.ts`
- `src/lib/runner/context.ts`
- `src/lib/runner/skills/discover-skills.ts`
- `src/lib/storage/agent-files.ts`
- `src/lib/storage/agent-paths.ts`
- `src/lib/memory/constants.ts`
- `/Users/sethlim/Documents/bash-tool/src/tool.ts`
- `/Users/sethlim/Documents/bash-tool/src/types.ts`
- `/Users/sethlim/Documents/bash-tool/src/tools/bash.ts`
- `/Users/sethlim/Documents/bash-tool/src/sandbox/vercel.ts`
- `/Users/sethlim/Documents/call-summary-agent-with-sandbox/lib/tools.ts`
- `/Users/sethlim/Documents/call-summary-agent-with-sandbox/lib/sandbox-context.ts`
- `/Users/sethlim/Documents/oss-data-analyst/src/lib/tools/sandbox.ts`
- `/Users/sethlim/Documents/oss-data-analyst/src/lib/tools/shell.ts`

---

## Task 1: Add Dependencies and Env Validation

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/__tests__/env.test.ts`

### Step 1: Write failing env tests for sandbox vars

Add to `src/lib/__tests__/env.test.ts`:

```typescript
describe("sandbox env vars", () => {
  it("exposes optional SANDBOX_GOLDEN_SNAPSHOT_ID", () => {
    setMinimalEnv();
    process.env.SANDBOX_GOLDEN_SNAPSHOT_ID = "snap_abc123";
    _resetForTesting();
    const env = getServerEnv();
    expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBe("snap_abc123");
  });

  it("SANDBOX_GOLDEN_SNAPSHOT_ID defaults to undefined", () => {
    setMinimalEnv();
    _resetForTesting();
    const env = getServerEnv();
    expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBeUndefined();
  });

  it("exposes optional VERCEL_OIDC_TOKEN", () => {
    setMinimalEnv();
    process.env.VERCEL_OIDC_TOKEN = "oidc_token_123";
    _resetForTesting();
    const env = getServerEnv();
    expect(env.VERCEL_OIDC_TOKEN).toBe("oidc_token_123");
  });

  it("exposes optional VERCEL_TOKEN", () => {
    setMinimalEnv();
    process.env.VERCEL_TOKEN = "vercel_token_123";
    _resetForTesting();
    const env = getServerEnv();
    expect(env.VERCEL_TOKEN).toBe("vercel_token_123");
  });

  it("exposes optional VERCEL_TEAM_ID and VERCEL_PROJECT_ID", () => {
    setMinimalEnv();
    process.env.VERCEL_TEAM_ID = "team_abc";
    process.env.VERCEL_PROJECT_ID = "prj_xyz";
    _resetForTesting();
    const env = getServerEnv();
    expect(env.VERCEL_TEAM_ID).toBe("team_abc");
    expect(env.VERCEL_PROJECT_ID).toBe("prj_xyz");
  });

  it("trims whitespace from sandbox vars", () => {
    setMinimalEnv();
    process.env.SANDBOX_GOLDEN_SNAPSHOT_ID = "  snap_abc123  ";
    _resetForTesting();
    const env = getServerEnv();
    expect(env.SANDBOX_GOLDEN_SNAPSHOT_ID).toBe("snap_abc123");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
pnpm vitest run src/lib/__tests__/env.test.ts
```

Expected: FAIL — `SANDBOX_GOLDEN_SNAPSHOT_ID` not in schema.

### Step 3: Add sandbox vars to env schema

In `src/lib/env.ts`, add to `serverEnvSchema`:

```typescript
SANDBOX_GOLDEN_SNAPSHOT_ID: z.string().trim().optional(),
VERCEL_OIDC_TOKEN: z.string().trim().optional(),
VERCEL_TOKEN: z.string().trim().optional(),
VERCEL_TEAM_ID: z.string().trim().optional(),
VERCEL_PROJECT_ID: z.string().trim().optional(),
```

### Step 4: Run tests to verify they pass

```bash
pnpm vitest run src/lib/__tests__/env.test.ts
```

Expected: ALL PASS.

### Step 5: Update `.env.example`

Add after the existing sandbox section:

```bash
# ── Vercel Sandbox ──────────────────────────────────────────
# On Vercel: OIDC auth is automatic, no vars needed
# Local dev: set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
VERCEL_OIDC_TOKEN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
# Required only when sandbox features (bash tool) are used
SANDBOX_GOLDEN_SNAPSHOT_ID=
```

### Step 6: Install dependencies

```bash
pnpm add bash-tool@^1.3.15 @vercel/sandbox@^1.9.0
```

### Step 7: Verify everything still builds

```bash
pnpm vitest run src/lib/__tests__/env.test.ts && pnpm exec tsc --noEmit
```

Expected: ALL PASS, no type errors.

### Step 8: Commit

```bash
git add package.json pnpm-lock.yaml .env.example src/lib/env.ts src/lib/__tests__/env.test.ts
git commit -m "feat(sandbox): add Vercel Sandbox deps and env validation"
```

---

## Task 2: Types and `buildContextJson`

**Files:**
- Create: `src/lib/runner/tools/sandbox/types.ts`
- Create: `src/lib/runner/tools/sandbox/build-context-json.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`

### Step 1: Create the types file

Create `src/lib/runner/tools/sandbox/types.ts`:

```typescript
/**
 * Types for Vercel Sandbox integration.
 * @module lib/runner/tools/sandbox/types
 */

/** A file to preload into the sandbox before the first bash command. */
export interface SandboxPreloadFile {
  /** Path relative to /vercel/sandbox/workspace (e.g., "input/deals.xlsx"). */
  path: string;
  /** File content as a Buffer. */
  content: Buffer;
}

/** A captured tool result entry for serialization into context.json. */
export interface SandboxContextEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

/** An artifact synced from sandbox output/ back to Supabase Storage. */
export interface SyncedArtifact {
  /** Path relative to output/ (e.g., "rental-analysis.xlsx"). */
  relativePath: string;
  /** Signed download URL from Supabase Storage. */
  downloadUrl: string;
  /** Inferred MIME type. */
  contentType: string;
  /** File size in bytes. */
  sizeBytes: number;
}
```

### Step 2: Write first failing context test — excludes bash calls

Create `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildContextJson } from "../build-context-json";
import type { SandboxContextEntry } from "../types";

describe("buildContextJson", () => {
  it("excludes bash tool results", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: { entity: "contacts" }, output: { success: true, records: [] } },
      { toolCallId: "2", toolName: "bash", input: { command: "ls" }, output: { stdout: "file.txt" } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].toolName).toBe("search_crm");
  });
});
```

### Step 3: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

Expected: FAIL — `buildContextJson` is not defined.

### Step 4: Write minimal implementation to pass

Create `src/lib/runner/tools/sandbox/build-context-json.ts`:

```typescript
/**
 * Serializes accumulated tool results into context.json for sandbox scripts.
 * @module lib/runner/tools/sandbox/build-context-json
 */
import type { SandboxContextEntry } from "./types";

/** Tools whose results are not useful inside sandbox scripts. */
const EXCLUDED_TOOLS = new Set([
  "bash",
  "write_file",
  "rename_chat",
  "send_message",
  "reply_message",
  "add_contact_method",
  "run_subagent",
  "setup_trigger",
  "manage_active_triggers",
  "create_new_connections",
  "delete_connection",
  "reauthorize_connection",
  "manage_activated_tools_for_connections",
  "ask_user_question",
  "manage_todo",
  "list_todo",
]);

/** Returns true if a read_file output contains binary data (image/PDF) that would bloat context.json. */
function isMultimodalOutput(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  const typed = output as Record<string, unknown>;
  return typed.type === "image" || typed.type === "pdf";
}

/** Maximum serialized size before truncation (500 KB). */
const MAX_CONTEXT_BYTES = 500_000;

/**
 * Builds the JSON string written to /vercel/sandbox/workspace/input/context.json.
 *
 * Cloned from the file-assembly pattern in call-summary-agent's
 * `generateFilesForSandbox()` — adapted for Sunder's dynamic tool results.
 */
export function buildContextJson(entries: SandboxContextEntry[]): string {
  const filtered = entries.filter(
    (e) => !EXCLUDED_TOOLS.has(e.toolName) && !isMultimodalOutput(e.output),
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    tools: filtered.map((e) => ({
      toolCallId: e.toolCallId,
      toolName: e.toolName,
      input: e.input,
      output: e.output,
    })),
  };

  let json = JSON.stringify(payload, null, 2);

  if (Buffer.byteLength(json) > MAX_CONTEXT_BYTES) {
    // Drop oldest entries until under budget
    const trimmed = [...filtered];
    while (trimmed.length > 0 && Buffer.byteLength(json) > MAX_CONTEXT_BYTES) {
      trimmed.shift();
      const reduced = {
        _truncated: true,
        generatedAt: payload.generatedAt,
        tools: trimmed.map((e) => ({
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          input: e.input,
          output: e.output,
        })),
      };
      json = JSON.stringify(reduced, null, 2);
    }
  }

  return json;
}
```

### Step 5: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

Expected: PASS.

### Step 6: Write failing test — excludes operational tools

Add to the test file:

```typescript
  it("excludes multimodal read_file results (image/PDF)", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "read_file", input: { path: "/agent/data.csv" }, output: { success: true, type: "text", content: "a,b\n1,2" } },
      { toolCallId: "2", toolName: "read_file", input: { path: "/agent/photo.png" }, output: { success: true, type: "image", data: "base64...", mediaType: "image/png" } },
      { toolCallId: "3", toolName: "read_file", input: { path: "/agent/report.pdf" }, output: { success: true, type: "pdf", data: "base64...", mediaType: "application/pdf" } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].toolCallId).toBe("1");
  });

  it("excludes operational tools", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: {}, output: { success: true } },
      { toolCallId: "2", toolName: "write_file", input: {}, output: { success: true } },
      { toolCallId: "3", toolName: "rename_chat", input: {}, output: { success: true } },
      { toolCallId: "4", toolName: "send_message", input: {}, output: { success: true } },
      { toolCallId: "5", toolName: "web_search", input: {}, output: { results: [] } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t: { toolName: string }) => t.toolName)).toEqual(["search_crm", "web_search"]);
  });
```

### Step 7: Run test to verify it passes (already implemented)

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

Expected: PASS (the denylist already covers these).

### Step 8: Write failing test — truncation on large payloads

```typescript
  it("truncates when serialized payload exceeds 500KB", () => {
    const entries: SandboxContextEntry[] = Array.from({ length: 100 }, (_, i) => ({
      toolCallId: `call-${i}`,
      toolName: "search_crm",
      input: { query: "x" },
      output: { data: "x".repeat(10_000) },
    }));
    const json = buildContextJson(entries);
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(500_000);
    const parsed = JSON.parse(json);
    expect(parsed._truncated).toBe(true);
    expect(parsed.tools.length).toBeLessThan(100);
  });
```

### Step 9: Run test to verify it passes (already implemented)

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

Expected: PASS.

### Step 10: Write failing test — stable output with generatedAt

```typescript
  it("includes generatedAt timestamp", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: {}, output: {} },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.generatedAt).toBeDefined();
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it("returns empty tools array when no entries", () => {
    const result = JSON.parse(buildContextJson([]));
    expect(result.tools).toEqual([]);
  });
```

### Step 11: Run tests

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

Expected: ALL PASS.

### Step 12: Commit

```bash
git add src/lib/runner/tools/sandbox/types.ts \
  src/lib/runner/tools/sandbox/build-context-json.ts \
  src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
git commit -m "feat(sandbox): add types and buildContextJson"
```

---

## Task 3: `buildPreloadFiles`

**Files:**
- Create: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`

### Step 1: Write failing test — assembles skill files

Create `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import type { SandboxPreloadFile } from "../types";
import { buildPreloadFiles } from "../build-preload-files";

/** Minimal mock for Supabase storage bucket. */
function createMockBucket(files: Record<string, string | null>) {
  return {
    list: vi.fn(async (prefix: string) => {
      const entries = Object.keys(files)
        .filter((p) => p.startsWith(prefix) && p !== prefix)
        .map((p) => {
          const relative = p.slice(prefix.length + 1);
          const parts = relative.split("/");
          return parts.length === 1
            ? { name: parts[0], id: "file-id" }
            : { name: parts[0], id: null };
        })
        .filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i);
      return { data: entries, error: null };
    }),
    download: vi.fn(async (path: string) => {
      const content = files[path];
      if (content === null || content === undefined) {
        return { data: null, error: { message: "Not found" } };
      }
      return {
        data: new Blob([content]),
        error: null,
      };
    }),
  };
}

function createMockSupabase(files: Record<string, string | null>) {
  const bucket = createMockBucket(files);
  return {
    storage: { from: vi.fn(() => bucket) },
    bucket,
  };
}

describe("buildPreloadFiles", () => {
  it("includes skill files under skills/{slug}/", async () => {
    const { storage } = createMockSupabase({
      "client-1/skills/re-analyst/SKILL.md": "---\nname: re-analyst\ndescription: test\n---\n# Analyst",
      "client-1/skills/re-analyst/references/taxes.md": "# Tax Rates\n10%",
    });

    const result = await buildPreloadFiles({
      supabase: storage as any,
      clientId: "client-1",
      fileParts: [],
    });

    const paths = result.map((f) => f.path);
    expect(paths).toContain("skills/re-analyst/SKILL.md");
    expect(paths).toContain("skills/re-analyst/references/taxes.md");
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: FAIL — `buildPreloadFiles` not defined.

### Step 3: Write minimal implementation

Create `src/lib/runner/tools/sandbox/build-preload-files.ts`:

```typescript
/**
 * Assembles all files to preload into the sandbox before the first bash call.
 *
 * Pattern cloned from call-summary-agent's `generateFilesForSandbox()` in
 * `lib/sandbox-context.ts` — adapted for Sunder's Supabase Storage backend.
 *
 * @module lib/runner/tools/sandbox/build-preload-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";

import type { SandboxPreloadFile } from "./types";

const SKILLS_DIRECTORY = "skills";
const EXCLUDED_SKILL_DIRS = new Set(["system", "connections", "superpowers"]);

import type { RunnerFilePart } from "@/lib/runner/schemas";
// RunnerFilePart = { type: "file", filename?: string, mediaType: string, url: string }

export interface BuildPreloadFilesOptions {
  supabase: SupabaseClient;
  clientId: string;
  fileParts: RunnerFilePart[];
  // Note: context.json is NOT included here. It is owned by createLazyBashTool
  // which builds it from getContextEntries() at sandbox init time.
}

/**
 * Downloads all files in a skill directory recursively from Supabase Storage.
 */
async function downloadSkillDirectory(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  clientId: string,
  slug: string,
): Promise<SandboxPreloadFile[]> {
  const prefix = `${clientId}/${SKILLS_DIRECTORY}/${slug}`;
  const files: SandboxPreloadFile[] = [];

  async function walk(currentPrefix: string, relativePath: string): Promise<void> {
    const { data: entries } = await bucket.list(currentPrefix);
    if (!entries) return;

    for (const entry of entries) {
      const fullPath = `${currentPrefix}/${entry.name}`;
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.id === null) {
        // Directory — recurse
        await walk(fullPath, relPath);
      } else {
        // File — download
        const { data } = await bucket.download(fullPath);
        if (data) {
          const buffer = Buffer.from(await data.arrayBuffer());
          files.push({
            path: `${SKILLS_DIRECTORY}/${slug}/${relPath}`,
            content: buffer,
          });
        }
      }
    }
  }

  await walk(prefix, "");
  return files;
}

/**
 * Builds the complete list of files to preload into the sandbox.
 *
 * Two categories:
 * 1. User-authored skill directories → `skills/{slug}/...`
 * 2. Chat attachments → `input/{filename}`
 *
 * Note: context.json is NOT built here. It is owned by createLazyBashTool
 * which has access to the latest tool results via getContextEntries().
 */
export async function buildPreloadFiles(
  options: BuildPreloadFilesOptions,
): Promise<SandboxPreloadFile[]> {
  const { supabase, clientId, fileParts } = options;
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const files: SandboxPreloadFile[] = [];

  // 1. Download all user skill directories
  const { data: skillDirs } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);
  if (skillDirs) {
    const slugs = skillDirs
      .filter((e) => e.id === null)
      .map((e) => e.name)
      .filter((name) => !EXCLUDED_SKILL_DIRS.has(name));

    const skillFiles = await Promise.all(
      slugs.map((slug) => downloadSkillDirectory(bucket, clientId, slug)),
    );
    files.push(...skillFiles.flat());
  }

  // 2. Download chat file attachments (RunnerFilePart from payload.fileParts)
  for (const part of fileParts) {
    try {
      const response = await fetch(part.url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const rawName = part.filename ?? "attachment";
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        files.push({ path: `input/${safeName}`, content: buffer });
      }
    } catch {
      // Skip failed downloads — non-fatal
    }
  }

  return files;
}

/**
 * Generates an ASCII file tree for extraInstructions.
 *
 * Cloned from call-summary-agent's `generateFileTree()` in `lib/sandbox-context.ts`.
 */
export function generateFileTree(files: SandboxPreloadFile[]): string {
  const paths = files.map((f) => f.path).sort();
  if (paths.length === 0) return "(no files)";

  const lines: string[] = [];
  for (const filePath of paths) {
    const depth = filePath.split("/").length - 1;
    const indent = "  ".repeat(depth);
    const name = filePath.split("/").pop()!;
    lines.push(`${indent}${name}`);
  }
  return lines.join("\n");
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: PASS.

### Step 5: Write failing test — includes context.json

```typescript
  it("does not include context.json (owned by createLazyBashTool)", async () => {
    const { storage } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: storage as any,
      clientId: "client-1",
      fileParts: [],
    });

    const contextFile = result.find((f) => f.path === "input/context.json");
    expect(contextFile).toBeUndefined();
  });
```

### Step 6: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: PASS (already implemented).

### Step 7: Write failing test — excludes system/connections skill dirs

```typescript
  it("excludes system and connections skill directories", async () => {
    const { storage } = createMockSupabase({
      "client-1/skills/system/tools/SKILL.md": "system skill",
      "client-1/skills/connections/gmail/SKILL.md": "connection skill",
      "client-1/skills/re-analyst/SKILL.md": "---\nname: re-analyst\ndescription: test\n---\n# OK",
    });

    const result = await buildPreloadFiles({
      supabase: storage as any,
      clientId: "client-1",
      fileParts: [],
    });

    const paths = result.map((f) => f.path);
    expect(paths).not.toContain(expect.stringContaining("system"));
    expect(paths).not.toContain(expect.stringContaining("connections"));
    expect(paths).toContain("skills/re-analyst/SKILL.md");
  });
```

### Step 8: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: PASS.

### Step 9: Write failing test — sanitizes attachment filenames

```typescript
  it("sanitizes attachment filenames", async () => {
    const { storage } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: storage as any,
      clientId: "client-1",
      fileParts: [
        { type: "file" as const, filename: "my deals (2024).xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/file.xlsx" },
      ],
    });

    const attachmentFile = result.find((f) => f.path.startsWith("input/") && f.path !== "input/context.json");
    expect(attachmentFile).toBeDefined();
    expect(attachmentFile!.path).toBe("input/my_deals__2024_.xlsx");
  });
```

Note: This test will fail on the `fetch()` call in the test environment. The mock needs to be adjusted — or use `vi.stubGlobal("fetch", ...)`. Add before the test:

```typescript
  it("sanitizes attachment filenames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    })));

    const { storage } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: storage as any,
      clientId: "client-1",
      fileParts: [
        { type: "file" as const, filename: "my deals (2024).xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/file.xlsx" },
      ],
    });

    const attachmentFile = result.find((f) => f.path.startsWith("input/") && f.path !== "input/context.json");
    expect(attachmentFile).toBeDefined();
    expect(attachmentFile!.path).toBe("input/my_deals__2024_.xlsx");

    vi.unstubAllGlobals();
  });
```

### Step 10: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: PASS.

### Step 11: Write test for generateFileTree

```typescript
describe("generateFileTree", () => {
  it("generates ASCII tree from file list", () => {
    const { generateFileTree } = await import("../build-preload-files");
    const files: SandboxPreloadFile[] = [
      { path: "input/deals.xlsx", content: Buffer.from("") },
      { path: "input/context.json", content: Buffer.from("") },
      { path: "skills/re-analyst/SKILL.md", content: Buffer.from("") },
      { path: "skills/re-analyst/references/taxes.md", content: Buffer.from("") },
    ];
    const tree = generateFileTree(files);
    expect(tree).toContain("deals.xlsx");
    expect(tree).toContain("context.json");
    expect(tree).toContain("SKILL.md");
    expect(tree).toContain("taxes.md");
  });
});
```

### Step 12: Run all tests for this task

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: ALL PASS.

### Step 13: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts \
  src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
git commit -m "feat(sandbox): add buildPreloadFiles and generateFileTree"
```

---

## Task 4: `syncOutputArtifacts`

**Files:**
- Create: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`

### Step 1: Write failing test — finds and uploads new files

Create `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { syncOutputArtifacts } from "../sync-output-artifacts";

function createMockSandbox(outputFiles: Record<string, string>) {
  return {
    runCommand: vi.fn(async (cmd: string, args: string[]) => {
      // Simulate: find /vercel/sandbox/workspace/output -type f | sort
      const command = args[1]; // bash -c "<command>"
      if (command.includes("find") && command.includes("output")) {
        const paths = Object.keys(outputFiles)
          .map((p) => `/vercel/sandbox/workspace/output/${p}`)
          .sort()
          .join("\n");
        return {
          exitCode: 0,
          stdout: vi.fn(async () => paths || ""),
          stderr: vi.fn(async () => ""),
        };
      }
      return { exitCode: 1, stdout: vi.fn(async () => ""), stderr: vi.fn(async () => "") };
    }),
    readFileToBuffer: vi.fn(async ({ path }: { path: string }) => {
      const relative = path.replace("/vercel/sandbox/workspace/output/", "");
      const content = outputFiles[relative];
      if (!content) return null;
      return Buffer.from(content);
    }),
  };
}

function createMockFileClient() {
  return {
    uploadArtifact: vi.fn(async ({ path, content, contentType }: any) => ({
      storagePath: path,
      downloadUrl: `https://storage.example.com/${path}`,
    })),
  };
}

describe("syncOutputArtifacts", () => {
  it("uploads new files from output directory", async () => {
    const sandbox = createMockSandbox({
      "rental-analysis.xlsx": "xlsx-content",
    });
    const fileClient = createMockFileClient();

    const artifacts = await syncOutputArtifacts({
      sandbox: sandbox as any,
      fileClient: fileClient as any,
      runId: "run-123",
      priorHashes: new Map(),
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].relativePath).toBe("rental-analysis.xlsx");
    expect(artifacts[0].downloadUrl).toContain("rental-analysis.xlsx");
    expect(fileClient.uploadArtifact).toHaveBeenCalledOnce();
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
```

Expected: FAIL — `syncOutputArtifacts` not defined.

### Step 3: Write minimal implementation

Create `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`:

```typescript
/**
 * Syncs output files from sandbox back to Supabase Storage.
 *
 * Called after each `bash` command to make artifacts available as download
 * URLs in the same agent run. Uses SHA-256 hashing to skip unchanged files.
 *
 * @module lib/runner/tools/sandbox/sync-output-artifacts
 */
import { createHash } from "node:crypto";

import type { SyncedArtifact } from "./types";

const OUTPUT_DIR = "/vercel/sandbox/workspace/output";

/** Infers MIME type from file extension. */
function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    json: "application/json",
    pdf: "application/pdf",
    html: "text/html",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    md: "text/markdown",
    txt: "text/plain",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

export interface SyncOutputOptions {
  /** The raw Vercel Sandbox instance (not the bash-tool wrapper). */
  sandbox: {
    runCommand: (cmd: string, args: string[]) => Promise<{
      exitCode: number;
      stdout: () => Promise<string>;
      stderr: () => Promise<string>;
    }>;
    readFileToBuffer: (opts: { path: string }) => Promise<Buffer | null>;
  };
  /** Agent file client from createAgentFileClient(). */
  fileClient: {
    uploadArtifact: (opts: {
      path: string;
      content: Buffer;
      contentType: string;
      expiresInSeconds: number;
      downloadFilename?: string;
    }) => Promise<{ storagePath: string; downloadUrl: string }>;
  };
  /** Current run ID for artifact namespacing. */
  runId: string;
  /** Mutable map of path → SHA-256 hash from prior sync calls. */
  priorHashes: Map<string, string>;
}

/**
 * Scans `/vercel/sandbox/workspace/output/` for files, uploads new or changed
 * ones to Supabase Storage, and returns download URLs.
 */
export async function syncOutputArtifacts(
  options: SyncOutputOptions,
): Promise<SyncedArtifact[]> {
  const { sandbox, fileClient, runId, priorHashes } = options;

  // List files in output directory
  const listResult = await sandbox.runCommand("bash", [
    "-c",
    `find ${OUTPUT_DIR} -type f 2>/dev/null | sort`,
  ]);
  const stdout = await listResult.stdout();

  if (listResult.exitCode !== 0 || !stdout.trim()) {
    return [];
  }

  const filePaths = stdout.trim().split("\n").filter(Boolean);
  const artifacts: SyncedArtifact[] = [];

  for (const absolutePath of filePaths) {
    const relativePath = absolutePath.replace(`${OUTPUT_DIR}/`, "");

    // Download file from sandbox
    const buffer = await sandbox.readFileToBuffer({ path: absolutePath });
    if (!buffer) continue;

    // Check hash to skip unchanged files
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (priorHashes.get(relativePath) === hash) continue;
    priorHashes.set(relativePath, hash);

    // Upload to Supabase Storage via the real uploadArtifact API
    const contentType = inferContentType(relativePath);
    const artifactPath = `artifacts/sandbox/${runId}/${relativePath}`;

    const { downloadUrl } = await fileClient.uploadArtifact({
      path: artifactPath,
      content: buffer,
      contentType,
      expiresInSeconds: 7 * 24 * 60 * 60, // 7-day signed URL
      downloadFilename: relativePath.split("/").pop(),
    });

    artifacts.push({
      relativePath,
      downloadUrl,
      contentType,
      sizeBytes: buffer.length,
    });
  }

  return artifacts;
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
```

Expected: PASS.

### Step 5: Write failing test — skips unchanged files

```typescript
  it("skips unchanged files on second sync", async () => {
    const sandbox = createMockSandbox({
      "report.csv": "same-content",
    });
    const fileClient = createMockFileClient();
    const priorHashes = new Map<string, string>();

    // First sync
    await syncOutputArtifacts({ sandbox: sandbox as any, fileClient: fileClient as any, runId: "run-1", priorHashes });
    expect(fileClient.uploadArtifact).toHaveBeenCalledOnce();

    // Second sync — same content
    fileClient.uploadArtifact.mockClear();
    const artifacts = await syncOutputArtifacts({ sandbox: sandbox as any, fileClient: fileClient as any, runId: "run-1", priorHashes });
    expect(artifacts).toHaveLength(0);
    expect(fileClient.uploadArtifact).not.toHaveBeenCalled();
  });
```

### Step 6: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
```

Expected: PASS.

### Step 7: Write failing test — returns empty when no output dir

```typescript
  it("returns empty array when output directory is empty", async () => {
    const sandbox = createMockSandbox({});
    const fileClient = createMockFileClient();

    const artifacts = await syncOutputArtifacts({
      sandbox: sandbox as any,
      fileClient: fileClient as any,
      runId: "run-1",
      priorHashes: new Map(),
    });

    expect(artifacts).toEqual([]);
  });
```

### Step 8: Run all tests

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
```

Expected: ALL PASS.

### Step 9: Commit

```bash
git add src/lib/runner/tools/sandbox/sync-output-artifacts.ts \
  src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
git commit -m "feat(sandbox): add syncOutputArtifacts with hash dedup"
```

---

## Task 5: Lazy `bash` Tool Wrapper

**Files:**
- Create: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`
- Create: `src/lib/runner/tools/sandbox/index.ts`

### Step 1: Write failing test — no sandbox until first call

Create `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { createLazyBashTool } from "../create-lazy-bash-tool";

// Mock @vercel/sandbox
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async () => ({
      sandboxId: "sbx_test",
      runCommand: vi.fn(async () => ({
        exitCode: 0,
        stdout: vi.fn(async () => ""),
        stderr: vi.fn(async () => ""),
      })),
      readFile: vi.fn(async () => null),
      readFileToBuffer: vi.fn(async () => null),
      writeFiles: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    })),
  },
}));

// Mock bash-tool
vi.mock("bash-tool", () => ({
  createBashTool: vi.fn(async ({ sandbox }: any) => ({
    bash: {
      execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
    },
    tools: {
      bash: {
        execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
      },
    },
    sandbox,
  })),
}));

describe("createLazyBashTool", () => {
  it("does not create sandbox until first execute", async () => {
    const { Sandbox } = await import("@vercel/sandbox");

    const { tool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: {} as any,
      runId: "run-1",
    });

    // Sandbox should NOT be created yet
    expect(Sandbox.create).not.toHaveBeenCalled();
    expect(tool).toBeDefined();

    await cleanup();
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

Expected: FAIL — `createLazyBashTool` not defined.

### Step 3: Write the implementation

Create `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`:

```typescript
/**
 * Lazy bash tool wrapper — boots Vercel Sandbox on first use.
 *
 * Cloned from the tool-creation pattern in call-summary-agent's `lib/tools.ts`
 * and the sandbox-creation pattern in oss-data-analyst's `src/lib/tools/sandbox.ts`.
 * Adapted for Sunder's lazy initialization and per-call artifact syncing.
 *
 * @module lib/runner/tools/sandbox/create-lazy-bash-tool
 */
import { tool } from "ai";
import { z } from "zod";

import { buildContextJson } from "./build-context-json";
import { generateFileTree } from "./build-preload-files";
import { syncOutputArtifacts } from "./sync-output-artifacts";
import type { SandboxContextEntry, SandboxPreloadFile, SyncedArtifact } from "./types";

const WORKSPACE = "/vercel/sandbox/workspace";
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface LazyBashToolOptions {
  /** Golden snapshot ID from env. */
  snapshotId: string;
  /** Async callback to build preload files (skills + attachments). */
  getPreloadFiles: () => Promise<SandboxPreloadFile[]>;
  /** Callback to snapshot accumulated tool results for context.json. */
  getContextEntries: () => SandboxContextEntry[];
  /** Agent file client from createAgentFileClient(). */
  fileClient: {
    uploadArtifact: (opts: {
      path: string;
      content: Buffer;
      contentType: string;
      expiresInSeconds: number;
      downloadFilename?: string;
    }) => Promise<{ storagePath: string; downloadUrl: string }>;
  };
  /** Current run ID for artifact namespacing. */
  runId: string;
}

export interface LazyBashToolResult {
  /** AI SDK tool to register in the tools object. */
  tool: ReturnType<typeof tool>;
  /** Call in onFinish/onError to stop the sandbox. */
  cleanup: () => Promise<void>;
  /** Whether the sandbox has been created (for testing). */
  hasInitialized: () => boolean;
}

/**
 * Creates a lazy bash tool that boots the sandbox on first invocation.
 *
 * The tool is registered at run start so the LLM sees it in the tool list,
 * but the actual Vercel Sandbox + bash-tool instance is created only when
 * the agent first calls it.
 */
export function createLazyBashTool(options: LazyBashToolOptions): LazyBashToolResult {
  const { snapshotId, getPreloadFiles, getContextEntries, fileClient, runId } = options;

  // Mutable state — captured in closure
  let sandbox: any = null;
  let bashExecute: ((input: { command: string }) => Promise<any>) | null = null;
  let initialized = false;
  const artifactHashes = new Map<string, string>();

  async function initialize(): Promise<void> {
    if (initialized) return;

    // Dynamic import to avoid loading @vercel/sandbox when sandbox isn't used
    const { Sandbox } = await import("@vercel/sandbox");
    const { createBashTool } = await import("bash-tool");

    // 1. Create sandbox from golden snapshot
    //    Pattern from oss-data-analyst: src/lib/tools/sandbox.ts
    //    Auth: OIDC is automatic on Vercel. For local dev, pass token + team + project.
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    const sandboxOptions: Record<string, unknown> = {
      source: { type: "snapshot", snapshotId },
      timeout: SANDBOX_TIMEOUT_MS,
    };

    // Local dev fallback: explicit token auth requires team + project
    if (env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID) {
      sandboxOptions.token = env.VERCEL_TOKEN;
      sandboxOptions.teamId = env.VERCEL_TEAM_ID;
      sandboxOptions.projectId = env.VERCEL_PROJECT_ID;
    }

    sandbox = await Sandbox.create(sandboxOptions as any);

    // 2. Build and upload preload files
    //    All files via sandbox.writeFiles() (not createBashTool's files param)
    //    because .xlsx attachments are binary and files param is text-only.
    const preloadFiles = await getPreloadFiles();
    const contextJson = buildContextJson(getContextEntries());
    const allFiles = [
      ...preloadFiles,
      { path: "input/context.json", content: Buffer.from(contextJson, "utf-8") },
    ];

    if (allFiles.length > 0) {
      await sandbox.writeFiles(
        allFiles.map((f) => ({
          path: `${WORKSPACE}/${f.path}`,
          content: f.content,
        })),
      );
    }

    // 3. Create bash-tool instance
    //    Pattern from call-summary-agent: lib/tools.ts
    //    No files param — we already uploaded everything via sandbox.writeFiles()
    const fileTree = generateFileTree(allFiles);
    const extraInstructions = [
      `\nFiles preloaded in workspace:`,
      fileTree,
      `\nWrite output files to output/ — they will be synced to storage automatically.`,
    ].join("\n");

    const { bash } = await createBashTool({
      sandbox,
      extraInstructions,
      maxOutputLength: 100_000,
      onBeforeBashCall: ({ command }: { command: string }) => {
        // Langfuse logging hook — placeholder for now
        return undefined;
      },
      onAfterBashCall: ({ result }: { result: any }) => {
        // Langfuse logging hook — placeholder for now
        return undefined;
      },
    });

    bashExecute = bash.execute as any;
    initialized = true;
  }

  // The AI SDK tool definition — registered at run start, executes lazily
  const bashTool = tool({
    description: [
      "Execute a bash command in an isolated sandbox environment.",
      "The sandbox has Python 3 (pandas, openpyxl, matplotlib, numpy), Node 22, LibreOffice, and standard CLI tools.",
      "User files are at input/, skill references at skills/, write results to output/.",
    ].join(" "),
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute."),
    }),
    execute: async ({ command }) => {
      if (!snapshotId) {
        return {
          stdout: "",
          stderr: "Sandbox is not configured. Set SANDBOX_GOLDEN_SNAPSHOT_ID in environment.",
          exitCode: 1,
          artifacts: [],
        };
      }

      await initialize();

      // Execute the command
      const result = await bashExecute!({ command });

      // Sync output artifacts after each command
      let artifacts: SyncedArtifact[] = [];
      try {
        artifacts = await syncOutputArtifacts({
          sandbox,
          fileClient,
          runId,
          priorHashes: artifactHashes,
        });
      } catch {
        // Non-fatal — don't fail the bash call if artifact sync fails
      }

      return {
        ...result,
        artifacts,
      };
    },
  });

  async function cleanup(): Promise<void> {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Best-effort cleanup
      }
      sandbox = null;
      bashExecute = null;
      initialized = false;
    }
  }

  return {
    tool: bashTool,
    cleanup,
    hasInitialized: () => initialized,
  };
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

Expected: PASS.

### Step 5: Write failing test — missing snapshot ID returns clear error

```typescript
  it("returns error when snapshot ID is empty", async () => {
    const { tool: bashTool } = createLazyBashTool({
      snapshotId: "",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: {} as any,
      runId: "run-1",
    });

    const result = await (bashTool as any).execute({ command: "echo hello" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SANDBOX_GOLDEN_SNAPSHOT_ID");
  });
```

### Step 6: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

Expected: PASS.

### Step 7: Write failing test — cleanup is idempotent

```typescript
  it("cleanup is safe when sandbox was never created", async () => {
    const { cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: {} as any,
      runId: "run-1",
    });

    // Should not throw
    await cleanup();
    await cleanup();
  });
```

### Step 8: Run test

```bash
pnpm vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

Expected: PASS.

### Step 9: Create barrel export

Create `src/lib/runner/tools/sandbox/index.ts`:

```typescript
/**
 * Vercel Sandbox integration — lazy bash tool with file preloading and artifact sync.
 * @module lib/runner/tools/sandbox
 */
export { createLazyBashTool } from "./create-lazy-bash-tool";
export type { LazyBashToolOptions, LazyBashToolResult } from "./create-lazy-bash-tool";
export { buildContextJson } from "./build-context-json";
export { buildPreloadFiles, generateFileTree } from "./build-preload-files";
export { syncOutputArtifacts } from "./sync-output-artifacts";
export type {
  SandboxContextEntry,
  SandboxPreloadFile,
  SyncedArtifact,
} from "./types";
```

### Step 10: Run all sandbox tests

```bash
pnpm vitest run src/lib/runner/tools/sandbox/
```

Expected: ALL PASS.

### Step 11: Commit

```bash
git add src/lib/runner/tools/sandbox/
git commit -m "feat(sandbox): add lazy bash tool wrapper with artifact syncing"
```

---

## Task 6: Update System Prompt and Wire into Prompt Assembly

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/runner/context.ts`

### Step 1: Write failing test for sandbox prompt

Add to `src/lib/ai/__tests__/system-prompt.test.ts` (or create if needed):

```typescript
import { describe, expect, it } from "vitest";

import { SANDBOX_PROMPT } from "@/lib/ai/system-prompt";

describe("SANDBOX_PROMPT", () => {
  it("is exported", () => {
    expect(SANDBOX_PROMPT).toBeDefined();
    expect(typeof SANDBOX_PROMPT).toBe("string");
  });

  it("mentions /vercel/sandbox/workspace paths", () => {
    expect(SANDBOX_PROMPT).toContain("/vercel/sandbox/workspace");
  });

  it("mentions input/context.json for data passing", () => {
    expect(SANDBOX_PROMPT).toContain("input/context.json");
  });

  it("warns against hard-coding data", () => {
    expect(SANDBOX_PROMPT).toContain("Never enumerate or hard-code");
  });

  it("mentions output/ for results", () => {
    expect(SANDBOX_PROMPT).toContain("output/");
  });

  it("mentions skills/ for reference data", () => {
    expect(SANDBOX_PROMPT).toContain("skills/");
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — `SANDBOX_PROMPT` is not exported (the old export was removed).

### Step 3: Add SANDBOX_PROMPT to system-prompt.ts

Add this export to `src/lib/ai/system-prompt.ts`:

```typescript
/**
 * Sandbox usage guidance for the system prompt.
 *
 * Adapted from Tasklet's <sandbox> block with Sunder-specific paths.
 * Reference: design doc v2 Section 9.
 */
export const SANDBOX_PROMPT = `<sandbox>
You have access to a Linux sandbox (Amazon Linux 2023) via the bash tool for shell commands and scripts:
- Common packages are pre-installed (pandas, openpyxl, matplotlib, numpy, Node 22, LibreOffice).
- The sandbox has full network access.

<when-to-use>
Use the sandbox for:
- Running scripts (Python, shell, etc.)
- Processing and analyzing data
- File manipulation and conversions
- Using command-line tools

Do NOT use the sandbox for tasks requiring a browser or GUI. For those, use browse_website.
Do NOT use the sandbox to call external services or APIs (e.g., via curl) unless explicitly requested by the user.
</when-to-use>

<using-the-filesystem>
User files are pre-loaded at /vercel/sandbox/workspace/input/ when the sandbox starts.
Skill files are at /vercel/sandbox/workspace/skills/{slug}/ — including SKILL.md and reference data.
Write output files to /vercel/sandbox/workspace/output/ — they will be uploaded to storage and returned as download links automatically.

- /vercel/sandbox/workspace/input/ contains user-uploaded files and context.json with gathered data (read-only).
- /vercel/sandbox/workspace/skills/{slug}/ contains skill SKILL.md and reference files (read-only). Read reference data directly from here in your scripts.
- /vercel/sandbox/workspace/output/ is where you write results the user should receive.
- /tmp/ is fast local storage but ephemeral.
- Prefer /tmp/ for I/O-heavy intermediate work. Copy only final artifacts to /vercel/sandbox/workspace/output/.
</using-the-filesystem>

<processing-data>
Use python scripts or jq to run data processing or analysis in the sandbox.
IMPORTANT: Never enumerate or hard-code data from tool results in code you write.
Instead, read gathered data from /vercel/sandbox/workspace/input/context.json in your code:

import json
with open('/vercel/sandbox/workspace/input/context.json') as f:
    data = json.load(f)

You are *not* capable of correctly enumerating more than a few items accurately,
and hard-coding data will lead to errors.
</processing-data>

</sandbox>`;
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: PASS.

### Step 5: Write failing test — SANDBOX_PROMPT appears in assembled system prompt

`buildSystemPrompt` is **private** in `context.ts`. The public APIs are `assembleContext()` and `assembleSystemOnly()`. The `includeSandbox` flag must be threaded through the full chain:
- `AssembleContextParams` → `BuildSystemPromptOptions` → `buildSystemPrompt()`
- `AssembleSystemOnlyParams` → same

This follows the exact same pattern as `includeBrowserAutomation`, `includeMarketData`, and `includePropertyListings` which are already threaded through all three levels.

Add test in `src/lib/runner/__tests__/context.test.ts`. Use the real `assembleContext` params shape — it takes `currentMessage` (string), NOT `payload`. The functions destructure their arguments directly (no `params` object).

```typescript
it("includes SANDBOX_PROMPT in system prompt when includeSandbox is true", async () => {
  const result = await assembleContext({
    supabase: mockSupabase as any,
    threadId: "test-thread",
    clientId: "test-client",
    currentMessage: "Analyze this spreadsheet",
    includeSandbox: true,
  });
  expect(result.system).toContain("<sandbox>");
  expect(result.system).toContain("/vercel/sandbox/workspace");
});

it("excludes SANDBOX_PROMPT when includeSandbox is false", async () => {
  const result = await assembleContext({
    supabase: mockSupabase as any,
    threadId: "test-thread",
    clientId: "test-client",
    currentMessage: "Hello",
    includeSandbox: false,
  });
  expect(result.system).not.toContain("<sandbox>");
});
```

Adapt `mockSupabase` to match the existing test setup in the file.

### Step 6: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: FAIL — `includeSandbox` not in `AssembleContextParams`.

### Step 7: Wire SANDBOX_PROMPT through the full context assembly chain

In `src/lib/runner/context.ts`, thread `includeSandbox` through all three layers:

```typescript
// 1. Add import:
import { SANDBOX_PROMPT } from "@/lib/ai/system-prompt";

// 2. Add to AssembleContextParams interface (around line 42):
includeSandbox?: boolean;

// 3. Add to AssembleSystemOnlyParams interface (around line 67):
includeSandbox?: boolean;

// 4. Add to BuildSystemPromptOptions interface (around line 98):
includeSandbox?: boolean;

// 5. In assembleSystemOnly() — the function destructures its args directly.
//    Add includeSandbox to the destructured params (around line 300):
export async function assembleSystemOnly({
  supabase,
  threadId,
  // ... existing params ...
  includeSandbox,        // ← add here
}: AssembleSystemOnlyParams): Promise<string> {
  // ... and pass through to buildSystemPrompt():
  const system = buildSystemPrompt({
    // ... existing fields ...
    includeSandbox,      // ← add here
  });

// 6. In assembleContext() — same pattern. It calls buildSystemPrompt() around line 465.
//    Add includeSandbox to the buildSystemPrompt() call:
  system: buildSystemPrompt({
    userSkills,
    instructions,
    ...resolvePromptOverrides({ crmConfig, crmMode, platformInstructions, systemPrompt }),
    includeBrowserAutomation,
    includeMarketData,
    includePropertyListings,
    includeSandbox,      // ← add here
  }),

// 7. In buildSystemPrompt() body, after includePropertyListings block:
if (includeSandbox) {
  sections.push(SANDBOX_PROMPT);
}
```

This follows the identical pattern as `includeBrowserAutomation` at every level.

### Step 8: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS.

### Step 9: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts \
  src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(sandbox): add SANDBOX_PROMPT and wire into buildSystemPrompt"
```

---

## Task 7: Wire into Runner

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

### Step 1: Write failing runner test — bash tool present in tools

The existing test harness uses `vi.hoisted` mocks and triggers runs with `runAgent(validPayload, "mock-supabase-client" as never)`. Follow the same pattern.

Add to `src/lib/runner/__tests__/run-agent.test.ts`:

```typescript
describe("sandbox bash tool", () => {
  it("includes bash in tools when SANDBOX_GOLDEN_SNAPSHOT_ID is set", async () => {
    process.env.SANDBOX_GOLDEN_SNAPSHOT_ID = "snap_test";
    _resetForTesting(); // clear env cache

    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          bash: expect.any(Object),
        }),
      }),
    );

    delete process.env.SANDBOX_GOLDEN_SNAPSHOT_ID;
    _resetForTesting();
  });

  it("does not include bash when SANDBOX_GOLDEN_SNAPSHOT_ID is not set", async () => {
    delete process.env.SANDBOX_GOLDEN_SNAPSHOT_ID;
    _resetForTesting();

    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.objectContaining({
          bash: expect.anything(),
        }),
      }),
    );
  });
});
```

Note: the test file already imports `runAgent` and has `validPayload` and `mockStreamText` via `vi.hoisted`. Add `_resetForTesting` to the existing imports from `@/lib/env` and `getServerEnv` if not already imported. Follow the existing `beforeEach` pattern in the file for mock setup.

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: FAIL — `bash` not in tools.

### Step 3: Wire createLazyBashTool into run-agent.ts

In `src/lib/runner/run-agent.ts`, add to the `runAgent` function:

```typescript
import { createLazyBashTool } from "@/lib/runner/tools/sandbox";
import { buildPreloadFiles } from "@/lib/runner/tools/sandbox/build-preload-files";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { SandboxContextEntry } from "@/lib/runner/tools/sandbox/types";

// Inside runAgent(), after tool registry creation:

// ── Sandbox bash tool (lazy) ──
const snapshotId = getServerEnv().SANDBOX_GOLDEN_SNAPSHOT_ID ?? "";
const toolResultAccumulator: SandboxContextEntry[] = [];
let sandboxCleanup: (() => Promise<void>) | null = null;

const sandboxTools: Record<string, any> = {};

if (snapshotId) {
  const fileClient = createAgentFileClient(supabase, clientId);
  const { tool: bashTool, cleanup } = createLazyBashTool({
    snapshotId,
    getPreloadFiles: () =>
      buildPreloadFiles({
        supabase,
        clientId,
        fileParts: payload.fileParts ?? [],
      }),
    getContextEntries: () => toolResultAccumulator,
    fileClient,
    runId: `${threadId}-${runId}`, // namespace by thread + run to avoid collisions
  });

  sandboxTools.bash = bashTool;
  sandboxCleanup = cleanup;
}

// Merge into the tools object passed to streamText:
const allTools = {
  ...runnerTools,
  ...composioTools,
  ...sandboxTools,
};
```

Pass `includeSandbox` to the prompt assembly. In the `assembleContext` call (or wherever `buildSystemPrompt` options are constructed), add:

```typescript
includeSandbox: !!snapshotId,
```

Add `onStepFinish` to accumulate tool results. Note: AI SDK v6 uses `input`/`output` not `args`/`result`:

```typescript
// Inside streamText() options:
onStepFinish: ({ toolResults }) => {
  if (toolResults) {
    for (const result of toolResults) {
      toolResultAccumulator.push({
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        input: result.input,
        output: result.output,
      });
    }
  }
},
```

Add cleanup to `onFinish` and `onError`:

```typescript
// Inside onFinish callback:
if (sandboxCleanup) await sandboxCleanup();

// Inside onError callback:
if (sandboxCleanup) await sandboxCleanup();
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS.

### Step 5: Run full test suite

```bash
pnpm vitest run src/lib/runner/__tests__/ src/lib/runner/tools/sandbox/
```

Expected: ALL PASS.

### Step 6: Type check

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

### Step 7: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(sandbox): wire lazy bash tool into runner with artifact syncing"
```

---

## Task 8: End-to-End Verification

**Files:**
- Modify if needed: `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md`

### Step 1: Run all tests

```bash
pnpm vitest run \
  src/lib/__tests__/env.test.ts \
  src/lib/ai/__tests__/system-prompt.test.ts \
  src/lib/runner/__tests__/run-agent.test.ts \
  src/lib/runner/tools/sandbox/
```

Expected: ALL PASS.

### Step 2: Manual smoke tests (requires sandbox auth + snapshot)

1. Chat with `.csv` attachment → agent calls bash to analyze
2. Chat with `.xlsx` attachment → agent calls bash to run pandas
3. Multi-step: agent gathers CRM data, then calls bash → verify context.json has gathered data
4. Second bash call in same run → verify sandbox reuses (no second Sandbox.create)
5. Without `SANDBOX_GOLDEN_SNAPSHOT_ID` → verify bash returns clear error message

### Step 3: Update design doc if implementation diverges

Patch `/vercel/sandbox/workspace` paths, auth model, or any other spec corrections discovered during implementation.

### Step 4: Commit docs (if changed)

```bash
git add docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md
git commit -m "docs(sandbox): align design doc with shipped implementation"
```

---

## Exit Criteria

- [ ] `bash` tool present in runner tool map when `SANDBOX_GOLDEN_SNAPSHOT_ID` is set
- [ ] Sandbox not created until first `bash` call (lazy)
- [ ] Path contract is `/vercel/sandbox/workspace` throughout
- [ ] Binary attachments (.xlsx) preload correctly via `sandbox.writeFiles()`
- [ ] `context.json` assembled from accumulated tool results before first bash
- [ ] `context.json` excludes multimodal read_file outputs (image/PDF)
- [ ] `context.json` excludes operational tools (manage_todo, list_todo, write_file, etc.)
- [ ] Output artifacts uploaded and URLs returned after each bash call
- [ ] Artifact paths namespaced by `threadId-runId` (not just threadId)
- [ ] Cleanup called in both `onFinish` and `onError`
- [ ] All user skills preloaded (system/connections/superpowers excluded)
- [ ] Missing snapshot ID returns clear error (not a crash)
- [ ] `SANDBOX_PROMPT` included in assembled system prompt when sandbox is configured
- [ ] Auth: OIDC automatic on Vercel, VERCEL_TOKEN + TEAM_ID + PROJECT_ID for local dev
- [ ] All existing runner tests still pass
- [ ] No new sprite migration added
