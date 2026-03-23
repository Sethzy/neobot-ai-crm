# Sandbox Excel Analysis Implementation Plan

**PR:** PR 52: Sandbox Excel Analysis
**Decisions:** EXEC-04, EXEC-05, EXEC-06
**Goal:** Users upload spreadsheets or describe deals, and the agent produces professional Excel financial models with live formulas, color coding, and sensitivity tables — all running inside a persistent Sprite (Fly.io) with Claude Code CLI (pre-installed).

**Architecture:** Gemini Flash (existing runner) routes to the `analyze_spreadsheet` tool when a user uploads xlsx/csv or asks for financial analysis. The tool creates or wakes a persistent Sprite scoped to the current thread (one generic Sprite per thread) via `@fly/sprites` SDK (`rc37`). Python, pandas, openpyxl, and Claude Code CLI are pre-installed or installed on first use (deps persist across hibernation). The runner downloads chat attachment files on the server, then writes them into the Sprite via `sprite.filesystem().writeFile()` so Sprite egress can stay tightly allowlisted. User's custom `re-analyst/SKILL.md` preferences are downloaded from Supabase Storage and loaded into the Sprite at runtime. Claude Code CLI runs autonomously inside the Sprite, writes Python code, creates the Excel model, runs `recalc.py` to evaluate formulas, fixes errors, and outputs the final `.xlsx`. The tool uploads the result via the shared `createAgentFileClient()` abstraction and returns a signed download URL. The Sprite auto-sleeps after execution and wakes in <1s for follow-up iterations within the same thread.

**Tech Stack:** `@fly/sprites@0.0.1-rc37`, Claude Code CLI (pre-installed on Sprites), Anthropic xlsx skill, Vercel AI SDK `tool()`, Supabase Storage, Vitest

**Prerequisites:** Node 24+ required (set in Vercel Project Settings and local `.nvmrc`). The `@fly/sprites` SDK (rc37) requires Node 24 APIs.

**Depends on:** PR 51/51a (skill system — `discoverUserSkills()`, `getSkillContent()`, `createAgentFileClient()`, storage paths)

**Design doc:** `docs/product/designs/sandbox-skill-execution.md` (sections 1-5, 7-9)
**Handover:** `docs/product/handovers/2026-03-20-pr51-51a-skills-handover-to-sandbox.md`
**Reference repos:**
- [Sprites JS SDK](https://github.com/nichochar/sprites-js) — `@fly/sprites` API, `SpritesClient`, `sprite.execFile()`, `sprite.filesystem()`
- [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) — DCF model skill structure
- Anthropic xlsx skill source: vendored at `src/lib/sandbox/skills/xlsx/`

**SDK verification:** `docs/product/references/sprites-sdk-verification.md` — key findings:
- `client.sprite(name)` is a **handle only** — does NOT create. Use `client.createSprite(name)` to create.
- Use `execFile()` with arg arrays — `exec()` splits on whitespace and breaks quoted prompts.
- `ANTHROPIC_API_KEY` passed per-command via the `env` option on `execFile()`, not via `.bashrc`.
- `filesystem()` only available in `rc37` (not stable `0.0.1`).
- SDK is name-addressed — store Sprite name in DB, not a UUID.
- Node 24+ required.

---

## Relevant Files

### Create
- `src/lib/sandbox/types.ts` — SpriteSession, SpriteResult, SpriteSkillFile types
- `src/lib/sandbox/env.ts` — `isSandboxConfigured()` env gating helper (same pattern as `src/lib/apify/env.ts`)
- `src/lib/sandbox/sprites-client.ts` — `getSpritesClient()` singleton + `getOrCreateSprite()` lifecycle wrapper
- `src/lib/sandbox/sprite-session.ts` — `upsertSpriteSession()` / `findActiveSpriteSession()` / `touchSpriteSession()` — DB tracking of Sprite names per thread
- `src/lib/sandbox/run-claude-in-sprite.ts` — `runClaudeInSprite()` — ensures bundled xlsx skill files exist, writes user skill files, runs Claude CLI via `sprite.execFile()`, captures output
- `src/lib/sandbox/skill-loader.ts` — `loadSkillFilesForSandbox()` — downloads user skill files from Supabase Storage, returns as array
- `src/lib/sandbox/skills/xlsx/` — Vendored Anthropic xlsx skill assets (SKILL.md, scripts/recalc.py, scripts/office/soffice.py)
- `src/lib/sandbox/__tests__/sprites-client.test.ts`
- `src/lib/sandbox/__tests__/sprite-session.test.ts`
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`
- `src/lib/sandbox/__tests__/skill-loader.test.ts`
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` — `createAnalyzeSpreadsheetTool()` factory
- `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- `supabase/migrations/XXXXXXX_create_sprite_sessions.sql` — `sprite_sessions` table + RLS
- `supabase/migrations/__tests__/sprite-sessions-migration.test.ts` — Migration contract test
- `scripts/provision-sprite-deps.sh` — Optional: pre-installs pandas/openpyxl/LibreOffice into a named Sprite (deps persist across hibernation, so first-use install is also fine)

### Modify
- `src/lib/runner/tool-registry.ts` — add `analyze_spreadsheet` to `createRunnerTools()` with env gating
- `src/lib/ai/system-prompt.ts` — add `analyze_spreadsheet` tool guidance
- `app/api/files/upload/route.ts` — extend MIME type allowlist for xlsx/csv uploads
- `src/components/chat/chat-composer.tsx` — extend `accept` attribute for xlsx/csv files
- `src/lib/storage/agent-files.ts` — extend `createAgentFileClient()` with an artifact upload helper for sandbox outputs
- `.env.local` / `.env.example` — add `SPRITES_TOKEN`, `ANTHROPIC_API_KEY` (already exists)

### Reference (read, don't modify)
- `src/lib/runner/skills/skill-templates.ts` — pattern for inlining skill content as string constants
- `src/lib/runner/skills/discover-skills.ts` — `getSkillContent()` for loading user skills from Storage
- `src/lib/storage/agent-files.ts` — `createAgentFileClient()` for uploading output files
- `src/lib/storage/agent-paths.ts` — `toStoragePath()` / `toModelPath()` path conventions
- `src/lib/sandbox/skills/xlsx/SKILL.md` — Vendored Anthropic xlsx skill definition
- `src/lib/sandbox/skills/xlsx/scripts/recalc.py` — Formula recalculation script
- `src/lib/sandbox/skills/xlsx/scripts/office/soffice.py` — LibreOffice sandbox helper
- `docs/product/designs/sandbox-skill-execution.md` — full design doc

---

### Task 1: Install `@fly/sprites` SDK + define types

**Files:**
- Modify: `package.json`
- Create: `src/lib/sandbox/types.ts`

**Context:** The `@fly/sprites` SDK provides Sprite lifecycle management (create, wake, sleep, destroy) and execution APIs (execFile, filesystem). We pin to `rc37` because stable `0.0.1` lacks `filesystem()`, services, and policy helpers. Types define the shapes used across all sandbox modules.

This task is a setup step — no unit test, just install + type compile check.

**Step 1: Install the Sprites SDK**

```bash
pnpm add --save-exact @fly/sprites@0.0.1-rc37
```

Expected: package added to `dependencies` in `package.json` pinned at exactly `0.0.1-rc37`. Stable `0.0.1` lacks `filesystem()`, services, and policy — rc37 has everything we need.

**Note:** Node 24+ is a prerequisite for `@fly/sprites@0.0.1-rc37`. Update `.nvmrc` and Vercel Project Settings to Node 24 **before** starting PR 52 — this is a pre-PR setup step, not part of PR 52 itself.

**Step 2: Create sandbox types**

Create `src/lib/sandbox/types.ts`:

```typescript
// src/lib/sandbox/types.ts
/**
 * Types for Sprites (Fly.io) sandbox integration.
 * Sprites are persistent Firecracker microVMs that auto-sleep when idle
 * and wake in <1s for follow-up iterations.
 * @module lib/sandbox/types
 */

/** Configuration for creating or waking a Sprite. */
export interface SpriteConfig {
  /** Sprite name to wake, or undefined to create a new one. The SDK is name-addressed. */
  spriteName?: string;
}

/** Result from running Claude Code CLI inside a Sprite. */
export interface SpriteResult {
  success: boolean;
  /** Human-readable summary from /workspace/output/summary.txt. */
  summary: string;
  /** Output file paths uploaded to Supabase Storage (e.g. result.xlsx). */
  outputFiles: SpriteOutputFile[];
  /** Raw stdout from the Claude CLI process (for debugging). */
  cliOutput?: string;
  /** Error message if success=false. */
  error?: string;
  /** Sprite name for follow-up iterations (SDK is name-addressed). */
  spriteName: string;
}

/** A file produced by the Sprite and uploaded to Supabase Storage. */
export interface SpriteOutputFile {
  /** Original filename inside Sprite (e.g. "result.xlsx"). */
  filename: string;
  /** Supabase Storage path after upload. */
  storagePath: string;
  /** Signed download URL (time-limited). */
  downloadUrl: string;
}

/** User skill files downloaded from Supabase Storage for injection into Sprite. */
export interface SpriteSkillFile {
  /** Relative path inside the Sprite (e.g. "re-analyst/SKILL.md"). */
  path: string;
  /** File content as string. */
  content: string;
}

/** Row shape for the sprite_sessions DB table. One Sprite per thread. */
export interface SpriteSessionRow {
  id: string;
  client_id: string;
  thread_id: string;
  /** Sprite name — the SDK is name-addressed, not ID-addressed. */
  sprite_name: string;
  status: "running" | "sleeping" | "destroyed";
  preview_url: string | null;
  created_at: string;
  last_active_at: string;
  destroyed_at: string | null;
}
```

**Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors. All interfaces are pure type declarations with no runtime imports.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/sandbox/types.ts
git commit -m "feat(pr52): install @fly/sprites@0.0.1-rc37 + define sandbox types"
```

---

### Task 1a: Vendor Anthropic xlsx skill assets

**Files:**
- Create: `src/lib/sandbox/skills/xlsx/SKILL.md`
- Create: `src/lib/sandbox/skills/xlsx/scripts/recalc.py`
- Create: `src/lib/sandbox/skills/xlsx/scripts/office/soffice.py`

**Context:** The Anthropic xlsx skill files (SKILL.md, recalc.py, soffice.py) must be committed to the repo so the build is reproducible and does not depend on any local path. These files are written into the Sprite on first use by `run-claude-in-sprite.ts` and provide the xlsx best practices, formula recalculation, and LibreOffice integration that Claude Code CLI follows inside the Sprite.

This task has no unit test — it is a file vendoring step.

**Step 1: Create the vendored skill directory**

```bash
mkdir -p src/lib/sandbox/skills/xlsx/scripts/office
```

**Step 2: Copy the Anthropic xlsx skill files into the vendored directory**

Copy these files from the Anthropic financial-services-plugins repo (or your local copy) into the repo:

```bash
cp /path/to/xlsx/SKILL.md src/lib/sandbox/skills/xlsx/SKILL.md
cp /path/to/xlsx/scripts/recalc.py src/lib/sandbox/skills/xlsx/scripts/recalc.py
cp /path/to/xlsx/scripts/office/soffice.py src/lib/sandbox/skills/xlsx/scripts/office/soffice.py
```

**Step 3: Verify files exist**

```bash
ls -la src/lib/sandbox/skills/xlsx/SKILL.md
ls -la src/lib/sandbox/skills/xlsx/scripts/recalc.py
ls -la src/lib/sandbox/skills/xlsx/scripts/office/soffice.py
```

Expected: All three files exist with non-zero size.

**Step 4: Commit**

```bash
git add src/lib/sandbox/skills/xlsx/
git commit -m "feat(pr52): vendor Anthropic xlsx skill assets (SKILL.md, recalc.py, soffice.py)"
```

---

### Task 2: Create `sprite_sessions` table migration

**Files:**
- Create: `supabase/migrations/XXXXXXX_create_sprite_sessions.sql`

**Context:** The `sprite_sessions` table tracks which Sprite belongs to which client, enabling multi-turn iteration (follow-up messages route to the same Sprite). This is a DB migration task — not directly testable with unit tests. Verification is via `supabase migration up`.

**Step 1: Write the migration**

Replace `XXXXXXX` with the next migration timestamp (e.g. `20260323100000`).

```sql
-- Migration: Create sprite_sessions table for tracking Sprite lifecycle per thread.
-- Each row maps a thread to a Fly.io Sprite name (one Sprite per thread).
-- The runner uses this to wake an existing Sprite instead of creating a new one.

CREATE TABLE public.sprite_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  sprite_name text NOT NULL,         -- SDK is name-addressed (e.g. "thread-{threadId-prefix}")
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'sleeping', 'destroyed')),
  preview_url text,                  -- Sprite preview URL (for publish_artifact)
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  CONSTRAINT sprite_sessions_thread_unique UNIQUE (thread_id)  -- one Sprite per thread
);

-- Index for fast lookups: "find the active Sprite for this thread"
CREATE INDEX idx_sprite_sessions_thread
  ON public.sprite_sessions (thread_id)
  WHERE status != 'destroyed';

-- RLS: clients can only see their own Sprites
ALTER TABLE public.sprite_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sprite_sessions_select_own ON public.sprite_sessions
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_insert_own ON public.sprite_sessions
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_update_own ON public.sprite_sessions
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_delete_own ON public.sprite_sessions
  FOR DELETE
  USING (client_id = public.get_my_client_id());
```

**Step 2: Apply the migration**

```bash
npx supabase migration up
```

Expected: Migration applies successfully. Table `sprite_sessions` created with RLS enabled.

**Step 3: Commit**

```bash
git add supabase/migrations/*_create_sprite_sessions.sql
git commit -m "feat(pr52): create sprite_sessions table migration with RLS"
```

---

### Task 2a: Migration contract test for `sprite_sessions`

**Files:**
- Create: `supabase/migrations/__tests__/sprite-sessions-migration.test.ts`

**Context:** Follows the established migration contract test pattern (see `supabase/migrations/__tests__/telegram-channel-migrations.test.ts`). Reads the migration SQL file and asserts key structural properties: correct table name, FK references, RLS policies, and the unique constraint on `thread_id`.

**Step 1: Write the contract test**

Create `supabase/migrations/__tests__/sprite-sessions-migration.test.ts`:

```typescript
// supabase/migrations/__tests__/sprite-sessions-migration.test.ts
/**
 * Contract tests for the sprite_sessions migration.
 * @module supabase/migrations/__tests__/sprite-sessions-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Replace XXXXXXX with the actual migration timestamp used in Task 2
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/XXXXXXX_create_sprite_sessions.sql",
);

function readMigrationSql(path: string) {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("sprite_sessions migration", () => {
  it("creates sprite_sessions table with correct schema", () => {
    const sql = readMigrationSql(migrationPath);

    // Table structure
    expect(sql).toContain("CREATE TABLE public.sprite_sessions");
    expect(sql).toContain("client_id uuid NOT NULL REFERENCES public.clients(client_id)");
    expect(sql).toContain("thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id)");
    expect(sql).toContain("sprite_name text NOT NULL");
    expect(sql).toContain("status text NOT NULL DEFAULT 'running'");
  });

  it("has unique constraint on thread_id (one Sprite per thread)", () => {
    const sql = readMigrationSql(migrationPath);

    expect(sql).toContain("UNIQUE (thread_id)");
  });

  it("enables RLS with per-client policies using get_my_client_id()", () => {
    const sql = readMigrationSql(migrationPath);

    expect(sql).toContain("ALTER TABLE public.sprite_sessions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY sprite_sessions_select_own");
    expect(sql).toContain("CREATE POLICY sprite_sessions_insert_own");
    expect(sql).toContain("CREATE POLICY sprite_sessions_update_own");
    expect(sql).toContain("CREATE POLICY sprite_sessions_delete_own");
    expect(sql).toContain("public.get_my_client_id()");
  });
});
```

**Step 2: Run test to verify it passes**

```bash
npx vitest run supabase/migrations/__tests__/sprite-sessions-migration.test.ts --reporter=verbose
```

Expected: ALL PASS (3 tests). If FAIL, check the migration timestamp in the path matches Task 2.

**Step 3: Commit**

```bash
git add supabase/migrations/__tests__/sprite-sessions-migration.test.ts
git commit -m "test(pr52): add migration contract test for sprite_sessions"
```

---

### Task 3: Build `sprite-session.ts` — DB tracking layer

**Files:**
- Create: `src/lib/sandbox/__tests__/sprite-session.test.ts`
- Create: `src/lib/sandbox/sprite-session.ts`

**Context:** Tracks which Sprite belongs to which thread so follow-up messages route to the same Sprite (one Sprite per thread). Provides `findActiveSpriteSession`, `upsertSpriteSession`, `markSpriteDestroyed`, and `touchSpriteSession`.

**Step 1: Write the failing test**

Create `src/lib/sandbox/__tests__/sprite-session.test.ts`:

```typescript
// src/lib/sandbox/__tests__/sprite-session.test.ts
/**
 * Tests for Sprite session DB tracking layer.
 * @module lib/sandbox/__tests__/sprite-session
 */
import { describe, expect, it, vi } from "vitest";

import {
  findActiveSpriteSession,
  upsertSpriteSession,
  markSpriteDestroyed,
} from "../sprite-session";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    select: mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
    upsert: mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "session_1",
            client_id: "client_1",
            sprite_name: "thread-abcd1234",
            status: "running",
          },
          error: null,
        }),
      }),
    }),
    update: mockUpdate.mockReturnValue({
      eq: mockEq.mockResolvedValue({ error: null }),
    }),
  })),
} as any;

describe("findActiveSpriteSession", () => {
  it("returns null when no active session exists", async () => {
    const result = await findActiveSpriteSession(
      mockSupabase, "thread_1",
    );
    expect(result).toBeNull();
  });
});

describe("upsertSpriteSession", () => {
  it("inserts a new sprite session row", async () => {
    const result = await upsertSpriteSession(mockSupabase, {
      client_id: "client_1",
      thread_id: "thread_1",
      sprite_name: "thread-abcd1234",
      status: "running",
    });
    expect(result).toBeDefined();
    expect(result?.sprite_name).toBe("thread-abcd1234");
  });
});

describe("markSpriteDestroyed", () => {
  it("updates status to destroyed", async () => {
    await markSpriteDestroyed(mockSupabase, "thread-abcd1234");
    expect(mockSupabase.from).toHaveBeenCalledWith("sprite_sessions");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-session.test.ts --reporter=verbose
```

Expected: FAIL — module `../sprite-session` not found. The test file imports from a module that doesn't exist yet.

**Step 3: Implement sprite-session**

Create `src/lib/sandbox/sprite-session.ts`:

```typescript
// src/lib/sandbox/sprite-session.ts
/**
 * Database layer for tracking Sprite sessions per thread (one Sprite per thread).
 * Enables multi-turn iteration: follow-up messages in the same thread route to the
 * same Sprite instead of creating a new one.
 * @module lib/sandbox/sprite-session
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SpriteSessionRow } from "./types";

/**
 * Finds the active, non-destroyed Sprite session for a thread.
 * One Sprite per thread (UNIQUE constraint on thread_id).
 * Returns null if no active session exists (caller should create a new Sprite).
 */
export async function findActiveSpriteSession(
  supabase: SupabaseClient,
  threadId: string,
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .select("*")
    .eq("thread_id", threadId)
    .neq("status", "destroyed")
    .single();

  if (error || !data) return null;
  return data as SpriteSessionRow;
}

/**
 * Creates or updates a Sprite session row.
 * Used when creating a new Sprite or when a Sprite wakes from sleep.
 * Upserts on thread_id (one Sprite per thread).
 */
export async function upsertSpriteSession(
  supabase: SupabaseClient,
  session: {
    client_id: string;
    thread_id: string;
    sprite_name: string;
    status: "running" | "sleeping";
    preview_url?: string | null;
  },
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .upsert(
      {
        client_id: session.client_id,
        thread_id: session.thread_id,
        sprite_name: session.sprite_name,
        status: session.status,
        preview_url: session.preview_url ?? null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("[sprite-session] Failed to upsert session:", error.message);
    return null;
  }

  return data as SpriteSessionRow;
}

/**
 * Marks a Sprite session as destroyed. Called when a Sprite is explicitly killed
 * or when the 24h inactivity cleanup runs.
 */
export async function markSpriteDestroyed(
  supabase: SupabaseClient,
  spriteName: string,
): Promise<void> {
  await supabase
    .from("sprite_sessions")
    .update({
      status: "destroyed",
      destroyed_at: new Date().toISOString(),
    })
    .eq("sprite_name", spriteName);
}

/**
 * Updates the last_active_at timestamp for a Sprite session.
 * Called after each successful tool invocation to track activity.
 */
export async function touchSpriteSession(
  supabase: SupabaseClient,
  spriteName: string,
): Promise<void> {
  await supabase
    .from("sprite_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("sprite_name", spriteName);
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-session.test.ts --reporter=verbose
```

Expected: ALL PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/sprite-session.ts src/lib/sandbox/__tests__/sprite-session.test.ts
git commit -m "feat(pr52): add sprite-session DB tracking layer with tests"
```

---

### Task 4: Build `sprites-client.ts` — SDK wrapper + lifecycle

**Files:**
- Create: `src/lib/sandbox/__tests__/sprites-client.test.ts`
- Create: `src/lib/sandbox/sprites-client.ts`

**Context:** Wraps `@fly/sprites` SDK. Handles the create-or-wake lifecycle: check DB for existing Sprite → try to wake it → if gone, create a new one. The SDK is name-addressed: `client.sprite(name)` returns a handle (does NOT create), `client.createSprite(name)` creates and returns a Sprite object. Sprite names are scoped by threadId (one Sprite per thread).

**Step 1: Write the failing test**

Create `src/lib/sandbox/__tests__/sprites-client.test.ts`:

```typescript
// src/lib/sandbox/__tests__/sprites-client.test.ts
/**
 * Tests for Sprites SDK wrapper and lifecycle management.
 * @module lib/sandbox/__tests__/sprites-client
 */
import { describe, expect, it, vi } from "vitest";

// Mock the @fly/sprites SDK
const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
const mockFilesystem = vi.fn().mockReturnValue({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("")),
});
const mockSpriteHandle = {
  execFile: mockExecFile,
  filesystem: mockFilesystem,
  name: "thread-abcd1234",
};

vi.mock("@fly/sprites", () => ({
  SpritesClient: vi.fn().mockImplementation(() => ({
    // client.sprite(name) returns a handle (does NOT create)
    sprite: vi.fn().mockReturnValue(mockSpriteHandle),
    // client.createSprite(name) creates and returns a Sprite object
    createSprite: vi.fn().mockResolvedValue(mockSpriteHandle),
  })),
}));

import { getSpritesClient, getOrCreateSprite, validateSpritesEnv } from "../sprites-client";

describe("validateSpritesEnv", () => {
  it("throws if SPRITES_TOKEN is missing", () => {
    expect(() => validateSpritesEnv({})).toThrow("SPRITES_TOKEN");
  });

  it("passes with required vars", () => {
    expect(() =>
      validateSpritesEnv({ SPRITES_TOKEN: "tok_abc" }),
    ).not.toThrow();
  });
});

describe("getSpritesClient", () => {
  it("returns a SpritesClient instance", () => {
    const client = getSpritesClient("tok_test");
    expect(client).toBeDefined();
  });
});

describe("getOrCreateSprite", () => {
  it("creates a new Sprite when no existing session", async () => {
    const result = await getOrCreateSprite({
      token: "tok_test",
      existingSpriteName: undefined,
      spriteName: "thread-abcd1234",
    });
    expect(result).toBeDefined();
    expect(result.sprite).toBeDefined();
    expect(result.isNew).toBe(true);
  });

  it("wakes an existing Sprite when session exists", async () => {
    const result = await getOrCreateSprite({
      token: "tok_test",
      existingSpriteName: "thread-abcd1234",
      spriteName: "thread-abcd1234",
    });
    expect(result).toBeDefined();
    expect(result.sprite).toBeDefined();
    // Connects to existing Sprite via name handle (SDK handles wake-from-sleep)
  });

  it("falls back to creating a new Sprite when existing one is unreachable", async () => {
    // Simulate the existing Sprite being destroyed — execFile("echo", ["ok"]) throws
    mockExecFile.mockRejectedValueOnce(new Error("Sprite not found"));
    const result = await getOrCreateSprite({
      token: "tok_test",
      existingSpriteName: "thread-stale",
      spriteName: "thread-fresh",
    });
    expect(result).toBeDefined();
    expect(result.isNew).toBe(true);
    expect(result.spriteName).toBe("thread-fresh");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sprites-client.test.ts --reporter=verbose
```

Expected: FAIL — module `../sprites-client` not found. All 5 tests should fail with a module resolution error.

**Step 3: Implement sprites-client**

Create `src/lib/sandbox/sprites-client.ts`:

```typescript
// src/lib/sandbox/sprites-client.ts
/**
 * Wrapper around @fly/sprites SDK for creating/waking Sprites.
 * Handles the create-or-wake lifecycle: check for existing Sprite → wake it →
 * if destroyed, create a new one. Sprites auto-sleep when idle and wake in <1s.
 * @module lib/sandbox/sprites-client
 */
import { SpritesClient } from "@fly/sprites";

const REQUIRED_ENV_VARS = ["SPRITES_TOKEN"] as const;

/** Throws if required Sprites env vars are missing. */
export function validateSpritesEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const key of REQUIRED_ENV_VARS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

/** Returns a configured SpritesClient singleton. */
export function getSpritesClient(token?: string): SpritesClient {
  const resolvedToken = token ?? process.env.SPRITES_TOKEN;
  if (!resolvedToken) throw new Error("SPRITES_TOKEN is required");
  return new SpritesClient(resolvedToken);
}

/**
 * Gets or creates a Sprite for a thread (one Sprite per thread).
 *
 * The SDK is **name-addressed**: `client.sprite(name)` returns a handle (does NOT create).
 * `client.createSprite(name)` creates and returns a Sprite object.
 *
 * Flow:
 * 1. If existingSpriteName is provided, get a handle and verify it's reachable.
 * 2. If the handle fails (Sprite was destroyed), create a new one.
 * 3. If no existingSpriteName, create a new one.
 *
 * The caller is responsible for DB tracking (sprite-session.ts).
 *
 * @param opts.token - Sprites API token
 * @param opts.existingSpriteName - Sprite name from a previous session (may be sleeping or destroyed)
 * @param opts.spriteName - Name for new Sprites (e.g. "thread-{threadId-prefix}")
 * @returns The Sprite handle + whether it was newly created
 */
export async function getOrCreateSprite(opts: {
  token: string;
  existingSpriteName?: string;
  spriteName: string;
}): Promise<{
  sprite: ReturnType<SpritesClient["sprite"]>;
  spriteName: string;
  isNew: boolean;
}> {
  const client = getSpritesClient(opts.token);

  // Try to connect to an existing Sprite by name (handles wake-from-sleep automatically)
  if (opts.existingSpriteName) {
    try {
      // client.sprite(name) is just a handle — does NOT create
      const sprite = client.sprite(opts.existingSpriteName);
      // Verify the Sprite is reachable by running a simple command
      await sprite.execFile("echo", ["ok"]);
      return { sprite, spriteName: opts.existingSpriteName, isNew: false };
    } catch (error) {
      console.warn(
        `[sprites] Existing Sprite "${opts.existingSpriteName}" unreachable, creating new one:`,
        error instanceof Error ? error.message : error,
      );
      // Fall through to create a new one
    }
  }

  // Create a new Sprite — client.createSprite(name) returns a Sprite object
  const sprite = await client.createSprite(opts.spriteName);

  return { sprite, spriteName: opts.spriteName, isNew: true };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sprites-client.test.ts --reporter=verbose
```

Expected: ALL PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/sprites-client.ts src/lib/sandbox/__tests__/sprites-client.test.ts
git commit -m "feat(pr52): add sprites-client SDK wrapper with create-or-wake lifecycle"
```

**Note on SDK API:** `client.sprite(name)` is only a handle — it does NOT create a Sprite. Use `client.createSprite(name, config?)` to create. The return type is a `Sprite` object (not `{ id }`). The SDK is name-addressed: store the Sprite name in `sprite_sessions`, not a UUID. The `Sprite` object has an optional `id` field but `name` is the primary handle. Each thread gets exactly one Sprite (enforced by the `UNIQUE(thread_id)` constraint).

---

### Task 5: Build `loadSkillFilesForSandbox()`

**Files:**
- Create: `src/lib/sandbox/__tests__/skill-loader.test.ts`
- Create: `src/lib/sandbox/skill-loader.ts`

**Context:** Downloads a user's custom skill files from Supabase Storage and returns them as an array of `{ path, content }` entries ready to be written into the Sprite filesystem. Reuses existing agent-files storage patterns.

**Step 1: Write the failing test**

Create `src/lib/sandbox/__tests__/skill-loader.test.ts`:

```typescript
// src/lib/sandbox/__tests__/skill-loader.test.ts
/**
 * Tests for Sprite skill file loader.
 * @module lib/sandbox/__tests__/skill-loader
 */
import { describe, expect, it, vi } from "vitest";

import { loadSkillFilesForSandbox } from "../skill-loader";

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

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/skill-loader.test.ts --reporter=verbose
```

Expected: FAIL — module `../skill-loader` not found.

**Step 3: Implement skill-loader**

Create `src/lib/sandbox/skill-loader.ts`:

```typescript
// src/lib/sandbox/skill-loader.ts
/**
 * Downloads user skill files from Supabase Storage for injection into a Sprite.
 * Reuses the existing agent-files storage patterns (same bucket, same path conventions).
 * @module lib/sandbox/skill-loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import type { SpriteSkillFile } from "./types";

/**
 * Downloads all files in a user's skill directory from Supabase Storage.
 * Returns a flat array of { path, content } ready to write into the Sprite.
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
): Promise<SpriteSkillFile[]> {
  const basePath = `${clientId}/skills/${skillSlug}`;
  const files: SpriteSkillFile[] = [];

  // List all files in the skill directory (non-recursive first level)
  const { data: entries, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .list(basePath);

  if (error || !entries) {
    console.warn(`[sprites] No skill files found at ${basePath}:`, error?.message);
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
    console.warn(`[sprites] Failed to download ${path}:`, error?.message);
    return null;
  }

  return data.text();
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/skill-loader.test.ts --reporter=verbose
```

Expected: ALL PASS (2 tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/skill-loader.ts src/lib/sandbox/__tests__/skill-loader.test.ts
git commit -m "feat(pr52): add sandbox skill loader for user skill files"
```

---

### Task 6: Build `runClaudeInSprite()` — core execution function

**Files:**
- Create: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`
- Create: `src/lib/sandbox/run-claude-in-sprite.ts`

**Context:** The core function that writes skill files + user files into the Sprite, runs Claude Code CLI via `sprite.execFile()`, and reads the output. `buildClaudeCliArgs` and `buildAnalysisPrompt` are pure functions exported for testing. `ANTHROPIC_API_KEY` is passed via the `env` option on `execFile()`, not via `.bashrc`.

**Step 1: Write the failing test**

Create `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`:

```typescript
// src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
/**
 * Tests for Claude Code CLI execution inside a Sprite.
 * Tests the pure functions (buildClaudeCliArgs, buildAnalysisPrompt)
 * that are exported for testability.
 * @module lib/sandbox/__tests__/run-claude-in-sprite
 */
import { describe, expect, it, vi } from "vitest";

import { buildClaudeCliArgs, buildAnalysisPrompt } from "../run-claude-in-sprite";

describe("buildClaudeCliArgs", () => {
  it("includes --print flag for non-interactive mode", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    expect(args).toContain("--print");
  });

  it("includes --dangerously-skip-permissions", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("includes --max-turns with value", () => {
    const args = buildClaudeCliArgs("analyze this data", 15);
    const idx = args.indexOf("--max-turns");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("15");
  });

  it("includes allowed tools", () => {
    const args = buildClaudeCliArgs("analyze this data", 20);
    const toolsStr = args.join(" ");
    expect(toolsStr).toContain("Read");
    expect(toolsStr).toContain("Write");
    expect(toolsStr).toContain("Bash");
  });

  it("passes prompt as a single array element (no shell splitting)", () => {
    const prompt = "analyze this data with 'quotes' inside";
    const args = buildClaudeCliArgs(prompt, 20);
    // The prompt should appear as-is in one element — execFile does not shell-split
    expect(args).toContain(prompt);
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
    expect(prompt).toContain("/workspace/output/result.xlsx");
    expect(prompt).toContain("/workspace/output/summary.txt");
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

  it("works without a user skill slug", () => {
    const prompt = buildAnalysisPrompt("compare deals", ["deals.xlsx"]);
    expect(prompt).toContain("/skills/xlsx/SKILL.md");
    expect(prompt).not.toContain("/skills/re-analyst/");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts --reporter=verbose
```

Expected: FAIL — module `../run-claude-in-sprite` not found. All 11 tests should fail with a module resolution error.

**Step 3: Implement run-claude-in-sprite**

Create `src/lib/sandbox/run-claude-in-sprite.ts`:

```typescript
// src/lib/sandbox/run-claude-in-sprite.ts
/**
 * Runs Claude Code CLI inside a Sprite (Fly.io).
 * Handles: skill file injection, file upload, CLI execution, output collection.
 * Uses sprite.execFile() for commands and sprite.filesystem() for file I/O.
 * ANTHROPIC_API_KEY is passed via the `env` option on execFile(), not via .bashrc.
 * @module lib/sandbox/run-claude-in-sprite
 */
import type { SpriteSkillFile } from "./types";

/** Sprite handle type — the object returned by client.sprite(name) or client.createSprite(name). */
type SpriteHandle = {
  execFile: (
    cmd: string,
    args?: string[],
    opts?: { env?: Record<string, string> },
  ) => Promise<{ stdout: string; stderr: string }>;
  filesystem: (basePath?: string) => {
    writeFile: (path: string, content: string | Buffer) => Promise<void>;
    readFile: (path: string) => Promise<Buffer>;
  };
};

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;

/**
 * Builds the Claude CLI args array for sprite.execFile().
 * Returns an args array (NOT a shell string) — execFile() does not shell-split,
 * so quoted prompts with spaces and special chars are safe.
 * Exported for testing.
 */
export function buildClaudeCliArgs(prompt: string, maxTurns: number): string[] {
  return [
    "--print",
    "--dangerously-skip-permissions",
    "--allowedTools", ALLOWED_TOOLS.join(","),
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
  lines.push(`Input files are in /workspace/input/. Available files: ${inputFilenames.join(", ")}`);
  lines.push("");
  lines.push("Create an Excel financial model at /workspace/output/result.xlsx:");
  lines.push("- Use Excel FORMULAS, not hardcoded Python calculations");
  lines.push("- Blue text for editable inputs, black for formulas (per xlsx skill)");
  lines.push("- Run: python3 /skills/xlsx/scripts/recalc.py /workspace/output/result.xlsx");
  lines.push("- If errors found, fix formulas and recalculate until clean");
  lines.push("- Write a human-readable summary to /workspace/output/summary.txt");

  return lines.join("\n");
}

/**
 * Returns the env vars to pass to execFile() for Claude CLI authentication.
 * ANTHROPIC_API_KEY is passed per-command via the `env` option on execFile(),
 * NOT by writing to .bashrc or Sprite config.
 */
function getClaudeEnv(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for Sprite Claude CLI");
  return { ANTHROPIC_API_KEY: apiKey };
}

/**
 * Writes user's custom skill files into the Sprite filesystem.
 * User-authored skill files are always written at runtime.
 */
async function writeUserSkillFiles(
  sprite: SpriteHandle,
  skillFiles: SpriteSkillFile[],
): Promise<void> {
  const fs = sprite.filesystem();
  for (const file of skillFiles) {
    const fullPath = `/skills/${file.path}`;
    // Ensure parent directory exists
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await sprite.execFile("mkdir", ["-p", dir]);
    await fs.writeFile(fullPath, file.content);
  }
}

/**
 * Ensures the bundled xlsx skill assets are present in the Sprite.
 * This runs on first use so `recalc.py` and the LibreOffice helpers are
 * available even when no pre-provisioning script was run.
 */
async function ensureBundledXlsxSkillFiles(
  sprite: SpriteHandle,
  bundledXlsxSkillFiles: SpriteSkillFile[],
): Promise<void> {
  const fs = sprite.filesystem();

  try {
    await fs.readFile("/skills/xlsx/SKILL.md");
    return;
  } catch {
    // First use — write the vendored assets into the Sprite.
  }

  for (const file of bundledXlsxSkillFiles) {
    const fullPath = `/skills/${file.path}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await sprite.execFile("mkdir", ["-p", dir]);
    await fs.writeFile(fullPath, file.content);
  }
}

/**
 * Ensures Python analysis dependencies are installed in the Sprite.
 * Only runs on first use — packages persist across Sprite hibernation.
 */
async function ensureDependencies(sprite: SpriteHandle): Promise<void> {
  const { stdout } = await sprite.execFile("bash", ["-c", "pip3 show pandas 2>/dev/null || echo 'NOT_INSTALLED'"]);
  if (stdout.includes("NOT_INSTALLED")) {
    console.log("[sprites] Installing Python analysis dependencies (first use)...");
    await sprite.execFile("pip3", ["install", "pandas", "openpyxl", "xlsxwriter", "matplotlib"]);
  }
}

/**
 * Runs Claude Code CLI inside a Sprite for spreadsheet analysis.
 *
 * @param sprite - An active Sprite handle (already created or woken)
 * @param task - The user's analysis request
 * @param inputFilenames - Filenames of files already downloaded into /workspace/input/
 * @param userSkillFiles - User's custom skill files from Supabase Storage
 * @param userSkillSlug - Skill slug for prompt assembly (e.g. "re-analyst")
 * @param maxTurns - Max Claude CLI iterations (default 20)
 */
export async function runClaudeInSprite(
  sprite: SpriteHandle,
  task: string,
  inputFilenames: string[],
  userSkillFiles: SpriteSkillFile[],
  bundledXlsxSkillFiles: SpriteSkillFile[],
  userSkillSlug?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Promise<{ success: boolean; summary: string; cliOutput: string }> {
  // 1. Resolve API key env (passed per-command via execFile env option, not .bashrc)
  const claudeEnv = getClaudeEnv();

  // 2. Ensure Python deps are installed (no-op after first use)
  await ensureDependencies(sprite);

  // 3. Ensure the bundled xlsx skill files exist in the Sprite.
  await ensureBundledXlsxSkillFiles(sprite, bundledXlsxSkillFiles);

  // 4. Write user's custom skill files.
  if (userSkillFiles.length > 0) {
    await writeUserSkillFiles(sprite, userSkillFiles);
  }

  // 5. Create output directory
  await sprite.execFile("mkdir", ["-p", "/workspace/output"]);

  // 6. Input files are already in /workspace/input/ (written there by the runner).

  // 7. Build prompt and run Claude CLI via execFile (not exec — exec splits on whitespace)
  const prompt = buildAnalysisPrompt(task, inputFilenames, userSkillSlug);
  const cliArgs = buildClaudeCliArgs(prompt, maxTurns);

  // Claude Code CLI is pre-installed on all Sprites — no installation needed.
  // ANTHROPIC_API_KEY is passed via the env option, not written to .bashrc.
  const result = await sprite.execFile("claude", cliArgs, { env: claudeEnv });

  const cliOutput = result.stdout ?? "";

  // 8. Read summary file
  let summary = "";
  try {
    const fs = sprite.filesystem();
    const summaryBuffer = await fs.readFile("/workspace/output/summary.txt");
    summary = summaryBuffer.toString("utf-8");
  } catch {
    summary = "Analysis complete. Check the Excel file for details.";
  }

  // Determine success by checking if output file exists
  let success = false;
  try {
    await sprite.execFile("test", ["-f", "/workspace/output/result.xlsx"]);
    success = true;
  } catch {
    success = false;
  }

  return {
    success,
    summary: summary.trim(),
    cliOutput,
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts --reporter=verbose
```

Expected: ALL PASS (11 tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/run-claude-in-sprite.ts src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
git commit -m "feat(pr52): add runClaudeInSprite with CLI arg builder and prompt assembly"
```

---

### Task 7: Build `analyze_spreadsheet` tool

**Files:**
- Create: `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- Create: `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`

**Context:** The Vercel AI SDK tool that the runner calls. Orchestrates the full flow: get-or-create Sprite → load skills → load files → run Claude → collect output → upload → Sprite auto-sleeps. Uses the factory pattern (same as CRM tools).

**Step 1: Write the failing test**

Create `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`:

```typescript
// src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts
/**
 * Tests for the analyze_spreadsheet tool factory.
 * @module lib/runner/tools/sandbox/__tests__/analyze-spreadsheet
 */
import { describe, expect, it, vi } from "vitest";

// Mock the Sprites SDK
const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from("mock xlsx content"));
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockFilesystem = vi.fn().mockReturnValue({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
});

const mockSpriteHandle = {
  execFile: mockExecFile,
  filesystem: mockFilesystem,
  name: "thread-test",
};

vi.mock("@fly/sprites", () => ({
  SpritesClient: vi.fn().mockImplementation(() => ({
    sprite: vi.fn().mockReturnValue(mockSpriteHandle),
    createSprite: vi.fn().mockResolvedValue(mockSpriteHandle),
  })),
}));

vi.mock("@/lib/sandbox/sprite-session", () => ({
  findActiveSpriteSession: vi.fn().mockResolvedValue(null),
  upsertSpriteSession: vi.fn().mockResolvedValue({
    id: "session_1",
    sprite_name: "thread-test",
    status: "running",
  }),
  touchSpriteSession: vi.fn().mockResolvedValue(undefined),
}));

import { createAnalyzeSpreadsheetTool } from "../analyze-spreadsheet";

describe("createAnalyzeSpreadsheetTool", () => {
  it("returns a tool with correct description", () => {
    const tools = createAnalyzeSpreadsheetTool({} as any, "client_1", "thread_1");
    expect(tools.analyze_spreadsheet.description).toContain("spreadsheet");
    expect(tools.analyze_spreadsheet.description).toContain("Excel");
  });

  it("description mentions multi-turn iteration", () => {
    const tools = createAnalyzeSpreadsheetTool({} as any, "client_1", "thread_1");
    expect(tools.analyze_spreadsheet.description).toContain("multi-turn");
  });

  it("has inputSchema with task and files fields", () => {
    const tools = createAnalyzeSpreadsheetTool({} as any, "client_1", "thread_1");
    // AI SDK v6 tools use `inputSchema`, not `parameters`
    expect(tools.analyze_spreadsheet).toBeDefined();
  });
});

describe("analyze_spreadsheet execute paths", () => {
  const mockSupabase = {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://storage.example.com/signed/result.xlsx" },
        }),
      }),
    },
  } as any;

  it("throws when SPRITES_TOKEN is not set", async () => {
    delete process.env.SPRITES_TOKEN;
    const tools = createAnalyzeSpreadsheetTool(mockSupabase, "client_1", "thread_1");
    const result = await tools.analyze_spreadsheet.execute({ task: "test", files: [] });
    expect(result.success).toBe(false);
    expect(result.error).toContain("SPRITES_TOKEN");
  });

  it("downloads input files on the runner and writes them into the Sprite", async () => {
    process.env.SPRITES_TOKEN = "tok_test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("xlsx")),
    }) as any;
    const tools = createAnalyzeSpreadsheetTool(mockSupabase, "client_1", "thread_1");
    await tools.analyze_spreadsheet.execute({
      task: "compare",
      files: [{
        url: "https://storage.example.com/chat-attachments/file.xlsx",
        filename: "file.xlsx",
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://storage.example.com/chat-attachments/file.xlsx",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/workspace/input/file.xlsx",
      expect.any(Buffer),
    );
  });

  it("uploads output xlsx to Supabase Storage", async () => {
    process.env.SPRITES_TOKEN = "tok_test";
    mockReadFile.mockResolvedValue(Buffer.from("fake xlsx"));
    const tools = createAnalyzeSpreadsheetTool(mockSupabase, "client_1", "thread_1");
    const result = await tools.analyze_spreadsheet.execute({ task: "compare", files: [] });
    expect(result.success).toBe(true);
    expect(result.outputFiles?.[0]?.downloadUrl).toBeDefined();
  });

  it("returns error when output file is missing", async () => {
    process.env.SPRITES_TOKEN = "tok_test";
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockExecFile.mockRejectedValueOnce(new Error("file not found")); // test -f fails
    const tools = createAnalyzeSpreadsheetTool(mockSupabase, "client_1", "thread_1");
    const result = await tools.analyze_spreadsheet.execute({ task: "compare", files: [] });
    expect(result.success).toBe(false);
  });

  it("handles failed runner-side file download gracefully", async () => {
    process.env.SPRITES_TOKEN = "tok_test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    }) as any;
    const tools = createAnalyzeSpreadsheetTool(mockSupabase, "client_1", "thread_1");
    const result = await tools.analyze_spreadsheet.execute({
      task: "compare",
      files: [{
        url: "https://storage.example.com/chat-attachments/bad.xlsx",
        filename: "bad.xlsx",
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

**Step 2: Write test — RED phase**

Run the tests first to verify they fail (module not found):

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts --reporter=verbose
```

Expected: FAIL — module `../analyze-spreadsheet` not found. All 8 tests (3 shape + 5 execute-path) should fail.

**Step 3: Implement the tool**

Create `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`:

```typescript
// src/lib/runner/tools/sandbox/analyze-spreadsheet.ts
/**
 * analyze_spreadsheet tool — runs spreadsheet analysis in a Sprite (Fly.io).
 * Uses Claude Code CLI (pre-installed) with Anthropic's xlsx skill + user's custom RE analysis skill.
 * Sprites persist between tool calls — follow-up analysis requests reuse the same Sprite
 * (all files and context from previous iterations are still there).
 * @module lib/runner/tools/sandbox/analyze-spreadsheet
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAgentFileClient } from "@/lib/storage/agent-files";
import { BUNDLED_XLSX_SKILL_FILES } from "@/lib/sandbox/skills/xlsx/skill-files";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import { runClaudeInSprite } from "@/lib/sandbox/run-claude-in-sprite";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import {
  findActiveSpriteSession,
  upsertSpriteSession,
  touchSpriteSession,
} from "@/lib/sandbox/sprite-session";
import type { SpriteOutputFile } from "@/lib/sandbox/types";

const USER_SKILL_SLUG = "re-analyst";

/**
 * Creates the analyze_spreadsheet tool scoped to a client and thread.
 * Added to createRunnerTools() in tool-registry.ts.
 * The threadId is used as the primary scope key for Sprite sessions (one Sprite per thread).
 */
export function createAnalyzeSpreadsheetTool(
  supabase: SupabaseClient,
  clientId: string,
  threadId: string,
) {
  return {
    analyze_spreadsheet: tool({
      description:
        "Analyze spreadsheet data and produce an Excel financial model. " +
        "Use when the user uploads an xlsx/csv file or asks for financial analysis, " +
        "deal comparison, ROI calculation, or any spreadsheet-based analysis. " +
        "Output is a downloadable .xlsx file with proper Excel formulas. " +
        "Supports multi-turn iteration — user can refine the analysis in follow-up messages.",
      inputSchema: z.object({
        task: z.string().describe("What analysis to perform"),
        files: z.array(z.object({
          url: z.string().url(),
          filename: z.string().min(1),
          mediaType: z.string().min(1),
        })).describe("Chat file parts for xlsx/csv inputs"),
      }),
      execute: async ({ task, files }) => {
        const token = process.env.SPRITES_TOKEN;
        if (!token) {
          return { success: false, error: "Missing SPRITES_TOKEN environment variable" };
        }

        try {
          const agentFiles = createAgentFileClient(supabase, clientId);

          // 1. Check for existing Sprite session (one Sprite per thread — enables multi-turn iteration)
          const spriteName = `thread-${threadId.slice(0, 8)}`;
          const existingSession = await findActiveSpriteSession(
            supabase, threadId,
          );

          // 2. Get or create Sprite by name (wake from sleep if existing, create if new)
          const { sprite, spriteName: resolvedName, isNew } = await getOrCreateSprite({
            token,
            existingSpriteName: existingSession?.sprite_name,
            spriteName,
          });

          // 3. Track the session in DB (for follow-up iterations — one Sprite per thread)
          await upsertSpriteSession(supabase, {
            client_id: clientId,
            thread_id: threadId,
            sprite_name: resolvedName,
            status: "running",
          });

          // 4. Load user's custom skill files
          const userSkillFiles = await loadSkillFilesForSandbox(
            supabase, clientId, USER_SKILL_SLUG,
          );

          // 5. Download input files on the runner, then write them into the Sprite.
          const inputFs = sprite.filesystem();
          await sprite.execFile("mkdir", ["-p", "/workspace/input"]);

          for (const file of files) {
            const response = await fetch(file.url);
            if (!response.ok) {
              throw new Error(`Failed to download input file: ${file.filename}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            await inputFs.writeFile(`/workspace/input/${file.filename}`, buffer);
          }

          // 6. Run Claude Code CLI inside the Sprite
          const filenames = files.map((file) => file.filename);
          const result = await runClaudeInSprite(
            sprite,
            task,
            filenames,
            userSkillFiles,
            BUNDLED_XLSX_SKILL_FILES,
            USER_SKILL_SLUG,
          );

          // 7. Update last_active_at (Sprite will auto-sleep on its own)
          await touchSpriteSession(supabase, resolvedName);

          if (!result.success) {
            return { success: false, error: result.cliOutput || "Analysis failed" };
          }

          // 8. Read output file from Sprite and upload via the shared storage helper
          const outputFiles: SpriteOutputFile[] = [];

          try {
            const fs = sprite.filesystem();
            const outputBuffer = await fs.readFile("/workspace/output/result.xlsx");

            if (outputBuffer.length > 0) {
              const uploaded = await agentFiles.uploadArtifact({
                path: `artifacts/output-${Date.now()}.xlsx`,
                content: outputBuffer,
                contentType:
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                expiresInSeconds: 60 * 60 * 24 * 7,
              });

              outputFiles.push({
                filename: "result.xlsx",
                storagePath: uploaded.storagePath,
                downloadUrl: uploaded.downloadUrl,
              });
            }
          } catch (e) {
            console.error("[sprites] Failed to extract result.xlsx:", e);
          }

          // NOTE: No sandbox.stop() — Sprite auto-sleeps when idle.
          // It stays alive for follow-up iterations (multi-turn).

          return {
            success: true,
            summary: result.summary,
            outputFiles,
            spriteName: resolvedName, // Returned so the runner can reference it in follow-ups
          };
        } catch (error) {
          console.error("[sprites] analyze_spreadsheet error:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Sprite execution failed",
          };
        }
      },
    }),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts --reporter=verbose
```

Expected: ALL PASS (8 tests — 3 shape + 5 execute-path)

**Step 5: Commit**

```bash
git add src/lib/runner/tools/sandbox/analyze-spreadsheet.ts src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts
git commit -m "feat(pr52): add analyze_spreadsheet tool with Sprite lifecycle and multi-turn support"
```

---

### Task 8: Register tool in runner + update system prompt

**Files:**
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/ai/system-prompt.ts`

**Context:** Wires the new tool into the runner's tool registry and adds system prompt guidance so the LLM knows when to use it. Follows the same env-gating pattern used for Apify and Browser-Use: a `isSandboxConfigured()` helper gates whether the tool is included. Excluded from subagents (`!isSubagent && isSandboxConfigured()`).

**Step 1: Create `src/lib/sandbox/env.ts` — env gating helper**

Create `src/lib/sandbox/env.ts` following the `src/lib/apify/env.ts` pattern:

```typescript
// src/lib/sandbox/env.ts
/**
 * Shared Sprites (sandbox) environment helpers.
 * @module lib/sandbox/env
 */

/**
 * Returns the configured Sprites token, or null when Sprites is unavailable.
 */
export function getSpritesToken(): string | null {
  const token = process.env.SPRITES_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Returns whether Sprites-backed sandbox tooling is configured for this runtime.
 */
export function isSandboxConfigured(): boolean {
  return getSpritesToken() !== null;
}
```

**Step 2: Add to tool registry with env gating**

In `src/lib/runner/tool-registry.ts`, import and add the sandbox tool with env gating (same pattern as listing tools / browser tools):

```typescript
import { isSandboxConfigured } from "@/lib/sandbox/env";
import { createAnalyzeSpreadsheetTool } from "./tools/sandbox/analyze-spreadsheet";

// Inside createRunnerTools(), after other tool creation:
// Sandbox tools: excluded from subagents, gated on SPRITES_TOKEN env var
const sandboxTools = !isSubagent && isSandboxConfigured()
  ? createAnalyzeSpreadsheetTool(supabase, clientId, threadId)
  : {};
```

And merge `...sandboxTools` into the returned tools object (same pattern as CRM tools, storage tools, etc.).

**Step 3: Add system prompt guidance**

In `src/lib/ai/system-prompt.ts`, add guidance for the sandbox tool in the tools instruction section. Add near the other tool descriptions:

```
## analyze_spreadsheet
Use this tool when the user uploads a spreadsheet (.xlsx, .csv) or asks for financial analysis, deal comparison, ROI calculation, or any task requiring an Excel model as output. The tool runs in an isolated Sprite sandbox with full code execution — it can read spreadsheets, write Python, create professional Excel models with live formulas, and verify them. Output is a downloadable .xlsx file. The same Sprite persists between tool calls — follow-up requests like "add a sensitivity table" or "break it down by district" will reuse the same environment with all previous files and context intact. Do NOT use this for simple questions about deals — use the opportunity-analysis skill instead. Reserve this tool for when the user explicitly wants an Excel deliverable or complex financial modeling.
```

**Step 4: Add tool registry exposure tests**

Add the following tests to `src/lib/runner/__tests__/tool-registry.test.ts`, following the pattern used for browser/listing/market tools. Add `mockIsSandboxConfigured` to the hoisted mocks and add the `@/lib/sandbox/env` mock:

```typescript
// Add to vi.hoisted:
mockIsSandboxConfigured: vi.fn(),

// Add mock:
vi.mock("@/lib/sandbox/env", () => ({
  isSandboxConfigured: mockIsSandboxConfigured,
}));

// Add mock tool factory:
vi.mock("@/lib/runner/tools/sandbox/analyze-spreadsheet", () => ({
  createAnalyzeSpreadsheetTool: vi.fn().mockReturnValue({
    analyze_spreadsheet: { description: "sandbox-tool" },
  }),
}));

// In beforeEach:
mockIsSandboxConfigured.mockReturnValue(true);

// Tests:
it("includes sandbox tools when SPRITES_TOKEN is configured", () => {
  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
  );
  expect(tools).toHaveProperty("analyze_spreadsheet");
});

it("omits sandbox tools when SPRITES_TOKEN is not configured", () => {
  mockIsSandboxConfigured.mockReturnValue(false);
  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
  );
  expect(tools).not.toHaveProperty("analyze_spreadsheet");
});

it("omits sandbox tools for subagents even when configured", () => {
  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
    { isSubagent: true },
  );
  expect(tools).not.toHaveProperty("analyze_spreadsheet");
});
```

**Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 6: Run tool registry tests to check for regressions**

```bash
npx vitest run src/lib/runner/__tests__/tool-registry.test.ts --reporter=verbose
```

Expected: ALL PASS — new sandbox tool tests pass, existing tests unchanged.

**Step 7: Commit**

```bash
git add src/lib/runner/tool-registry.ts src/lib/ai/system-prompt.ts src/lib/sandbox/env.ts src/lib/runner/__tests__/tool-registry.test.ts
git commit -m "feat(pr52): register analyze_spreadsheet in tool registry + add system prompt guidance + exposure tests"
```

---

### Task 8a: Extend chat upload route + composer for xlsx/csv files

**Files:**
- Modify: `app/api/files/upload/route.ts`
- Modify: `src/components/chat/chat-composer.tsx`

**Context:** The current chat upload route only accepts `image/jpeg` and `image/png`. The `analyze_spreadsheet` tool needs users to upload xlsx/csv files through the chat composer. This task extends the MIME type allowlist and the file input `accept` attribute to include spreadsheet formats. The file size limit (5MB) stays the same.

**Step 1: Extend the upload route MIME type allowlist**

In `app/api/files/upload/route.ts`, find the `fileSchema` Zod validation and extend the allowed MIME types:

```typescript
// Before (current):
.refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
  message: "File type should be JPEG or PNG",
})

// After:
.refine(
  (file) =>
    [
      "image/jpeg",
      "image/png",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ].includes(file.type),
  {
    message: "File type should be JPEG, PNG, XLSX, XLS, or CSV",
  },
)
```

**Step 2: Extend the composer file input `accept` attribute**

In `src/components/chat/chat-composer.tsx`, find the hidden file input and extend its `accept` attribute:

```tsx
// Before (current):
<input
  accept="image/jpeg,image/png"
  ...
/>

// After:
<input
  accept="image/jpeg,image/png,.xlsx,.xls,.csv"
  ...
/>
```

**Step 3: Update the paste handler to allow spreadsheet files**

In `src/components/chat/chat-composer.tsx`, the `handlePaste` callback currently only handles `image/*` files. Add spreadsheet MIME types to the paste filter:

```typescript
// Before:
.filter((item) => item.kind === "file" && item.type.startsWith("image/"))

// After:
.filter((item) => {
  if (item.kind !== "file") return false;
  return item.type.startsWith("image/") ||
    item.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    item.type === "application/vnd.ms-excel" ||
    item.type === "text/csv";
})
```

**Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add app/api/files/upload/route.ts src/components/chat/chat-composer.tsx
git commit -m "feat(pr52): extend chat upload route + composer to accept xlsx/csv files"
```

---

### Task 9: Add environment variables

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (if exists, add locally)

**Context:** The Sprites SDK needs a `SPRITES_TOKEN` for authentication. `ANTHROPIC_API_KEY` already exists in `.env` and is passed per-command via `execFile()` env option. This is a config task — no unit test needed.

**Step 1: Update .env.example**

Add to `.env.example`:

```bash
# Sprites (Fly.io) — sandbox execution for analyze_spreadsheet and publish_artifact tools
SPRITES_TOKEN=
# ANTHROPIC_API_KEY is passed per-command via execFile() env option — already in .env
```

**Step 2: Set up local env**

Get the `SPRITES_TOKEN` from Fly.io dashboard. The token is used to authenticate with the Sprites API.

```bash
# Get $30 free credits at the Sprites dashboard, then:
# Settings → API Tokens → Create Token
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "feat(pr52): add SPRITES_TOKEN to .env.example"
```

---

### Task 10: Optional dependency pre-provisioning script

**Files:**
- Create: `scripts/provision-sprite-deps.sh`

**Context:** We use the default Sprite + install deps on first use (they persist across hibernation). No custom template needed. This script is an optional convenience for pre-provisioning a named Sprite so the first user request is faster. This is a scripting task — no unit test needed.

**Step 1: Write the provisioning script**

Create `scripts/provision-sprite-deps.sh`:

```bash
#!/usr/bin/env bash
# provision-sprite-deps.sh
#
# Optional: Pre-provisions a named Sprite with Python analysis deps + xlsx skill files.
# Deps persist across hibernation, so this is purely for faster first-use cold starts.
# If you skip this, the runtime code installs deps on first use (~60s one-time cost).
#
# Prerequisites:
#   - Node 24+ (required by @fly/sprites@0.0.1-rc37)
#   - SPRITES_TOKEN env var set
#   - xlsx skill files vendored at src/lib/sandbox/skills/xlsx/
#
# Usage:
#   SPRITES_TOKEN=xxx bash scripts/provision-sprite-deps.sh <sprite-name>

set -euo pipefail

SPRITE_NAME="${1:?Usage: provision-sprite-deps.sh <sprite-name>}"
XLSX_SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)/src/lib/sandbox/skills/xlsx"

if [ -z "${SPRITES_TOKEN:-}" ]; then
  echo "ERROR: SPRITES_TOKEN env var is required"
  exit 1
fi

if [ ! -d "$XLSX_SKILL_DIR" ]; then
  echo "ERROR: xlsx skill directory not found at $XLSX_SKILL_DIR"
  exit 1
fi

echo "=== Creating Sprite '$SPRITE_NAME' ==="

# Use a Node one-liner to create the Sprite and install deps via SDK
node -e "
const { SpritesClient } = require('@fly/sprites');
(async () => {
  const client = new SpritesClient(process.env.SPRITES_TOKEN);
  const sprite = await client.createSprite('$SPRITE_NAME');
  console.log('Sprite created:', sprite.name);

  console.log('Installing Python deps...');
  await sprite.execFile('pip3', ['install', 'pandas', 'openpyxl', 'xlsxwriter', 'matplotlib']);

  console.log('Installing LibreOffice + gcc...');
  await sprite.execFile('bash', ['-c', 'apt-get update -qq && apt-get install -y -qq libreoffice-calc gcc']);

  console.log('Creating directory structure...');
  await sprite.execFile('mkdir', ['-p', '/skills/xlsx/scripts/office', '/workspace/input', '/workspace/output']);

  console.log('Verifying...');
  const { stdout } = await sprite.execFile('python3', ['-c', 'import pandas; import openpyxl; print(\"OK\")']);
  console.log('Python deps:', stdout.trim());

  const { stdout: ver } = await sprite.execFile('claude', ['--version']);
  console.log('Claude CLI:', ver.trim());

  // Read the Sprite URL from metadata (don't hardcode .sprites.dev)
  if (sprite.url) console.log('Sprite URL:', sprite.url);

  console.log('Done. Sprite will auto-sleep when idle — no idle compute cost while sleeping (storage still bills).');
})().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Uploading xlsx skill files via filesystem API ==="
# Upload skill files using the SDK's filesystem() method
node -e "
const { SpritesClient } = require('@fly/sprites');
const fs = require('fs');
const path = require('path');
(async () => {
  const client = new SpritesClient(process.env.SPRITES_TOKEN);
  // client.sprite(name) is a handle — does NOT create
  const sprite = client.sprite('$SPRITE_NAME');
  const spriteFs = sprite.filesystem();

  const files = ['SKILL.md', 'scripts/recalc.py', 'scripts/office/soffice.py'];
  for (const file of files) {
    const src = path.join('$XLSX_SKILL_DIR', file);
    if (fs.existsSync(src)) {
      const content = fs.readFileSync(src);
      await spriteFs.writeFile('/skills/xlsx/' + file, content);
      console.log('  Uploaded /skills/xlsx/' + file);
    } else {
      console.log('  SKIP:', src, 'not found');
    }
  }
  console.log('Skill files uploaded.');
})().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Done ==="
echo "Sprite name: $SPRITE_NAME"
echo "The runtime code will find this Sprite by name via sprite_sessions table."
```

**Step 2: Make executable**

```bash
chmod +x scripts/provision-sprite-deps.sh
```

**Step 3: Run it (optional — only if you have credentials)**

```bash
SPRITES_TOKEN=xxx bash scripts/provision-sprite-deps.sh thread-demo
```

**Important notes:**
- This is optional. The runtime code (`ensureDependencies()`) installs deps on first use if they're missing. Deps persist across Sprite hibernation.
- Claude Code CLI is already pre-installed on all Sprites — no installation step needed.
- Python 3 and Node.js are pre-installed on default Sprites (Ubuntu 25.10 base).
- Sprite is persistent: auto-sleeps when idle, wakes in <1s for follow-up. No idle compute cost while sleeping (storage still bills).
- Don't hardcode `.sprites.dev` — read from `sprite.url` metadata.

**Step 4: Commit**

```bash
git add scripts/provision-sprite-deps.sh
git commit -m "feat(pr52): add optional Sprite dependency pre-provisioning script"
```

---

### Task 11: Full integration smoke test

**Files:**
- Test: all `src/lib/sandbox/__tests__/*.test.ts` (read only — verify)
- Test: `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts` (read only — verify)

**Context:** Final verification pass. Run ALL sandbox tests, then the full project test suite, then type checking. Also includes a manual E2E test checklist.

**Step 1: Run all sandbox unit tests**

```bash
npx vitest run src/lib/sandbox/__tests__/ --reporter=verbose
```

Expected: ALL PASS

**Step 2: Run the analyze_spreadsheet tool tests**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/ --reporter=verbose
```

Expected: ALL PASS

**Step 3: Run the full project test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: ALL PASS

**Step 4: Verify type checking**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Manual E2E test (requires real Sprites credentials)**

Verify env vars are set:

```bash
echo $SPRITES_TOKEN
echo $ANTHROPIC_API_KEY
```

Both should be non-empty. (No `SPRITE_TEMPLATE_EXCEL` needed — we use the default Sprite + install deps on first use.)

**Test via chat UI:**

1. Start the dev server: `pnpm dev`
2. Upload a simple `.xlsx` file with 2-3 property deals (price, rent, sqft, tenure)
3. Type: "Build me a comparison model for these deals"
4. Verify:
   - [ ] Chat shows "Analyzing your deals..." or similar
   - [ ] After 30-90s, chat shows a download link
   - [ ] Downloaded .xlsx opens in Excel/Google Sheets
   - [ ] Formulas are live (change an input → calculations update)
   - [ ] Color coding is correct (blue inputs, black formulas)
   - [ ] Summary text in chat accurately describes the analysis

**Test multi-turn iteration (the key new capability):**

1. After the first analysis completes, type: "Now break it down by district"
2. Verify:
   - [ ] Response is faster (~10-20s vs ~30-90s for first run — Sprite wakes from sleep, no setup)
   - [ ] New download link with updated analysis
   - [ ] The analysis builds on the previous one (same data, added breakdown)
3. Type: "Add a sensitivity table for mortgage rates 2.5% to 4.5%"
4. Verify:
   - [ ] Same fast iteration
   - [ ] Sensitivity table added to the workbook
   - [ ] All previous sheets still intact

**Test without user skill:**

If the user hasn't set up a `re-analyst/SKILL.md`, the tool should still work — it falls back to just the xlsx skill without custom preferences.

**Test with user skill:**

1. In chat: "Set up my property analysis preferences. Net yield must beat 2.5%, mortgage rate 3.8%, focus on D9-D11 freehold."
2. Verify a `re-analyst/SKILL.md` is created in Supabase Storage
3. Upload a spreadsheet again
4. Verify the analysis follows the user's preferences (mentions 2.5% benchmark, 3.8% rate, etc.)

**Step 6: Final commit (if any fixes were needed)**

If any type issues or test failures were found and fixed:

```bash
git add -A
git commit -m "fix(pr52): resolve issues found in integration smoke test"
```

---

## Summary

| Task | What | Test Type | Depends On |
|---|---|---|---|
| 1 | Install `@fly/sprites` SDK + types | Type compile check | — |
| 1a | Vendor Anthropic xlsx skill assets | File check (no test) | — |
| 2 | `sprite_sessions` DB migration | Migration apply | — |
| 2a | Migration contract test for `sprite_sessions` | Contract test | 2 |
| 3 | `sprite-session.ts` DB tracking layer (per-thread) | Unit test (red-green) | 1, 2 |
| 4 | `sprites-client.ts` SDK wrapper + lifecycle | Unit test (red-green, 5 tests incl. error path) | 1 |
| 5 | `loadSkillFilesForSandbox()` | Unit test (red-green) | 1 |
| 6 | `runClaudeInSprite()` | Unit test (red-green, 11 tests) | 4 |
| 7 | `analyze_spreadsheet` tool | Unit test (red-green, 8 tests: 3 shape + 5 execute-path) | 3, 4, 5, 6 |
| 8 | Register in runner + system prompt + env gating | Type compile + registry exposure tests | 7 |
| 8a | Extend chat upload route + composer for xlsx/csv | Compile check | — |
| 9 | Environment variables | Config (no test) | — |
| 10 | Optional dep pre-provisioning script (no template needed) | Script (no test) | 9 |
| 11 | Full integration smoke test (incl. multi-turn) | Full suite + manual E2E | 8, 8a, 10 |

Tasks 1, 1a, 2, 2a, and 9 can run in parallel. Tasks 3-5 can run in parallel after 1+2. Task 10 is optional and can start after 9 (independent of tool code — just needs env vars and the vendored xlsx skill files at `src/lib/sandbox/skills/xlsx/`).

**Key differences from v1 (Vercel Sandbox) tasklist:**

| Aspect | v1 (Vercel Sandbox) | v2 (Sprites / Fly.io) |
|---|---|---|
| SDK | `@vercel/sandbox` | `@fly/sprites` |
| Lifecycle | `Sandbox.create()` → `sandbox.stop()` | `getOrCreateSprite()` → auto-sleep |
| Persistence | Ephemeral (dies on timeout) | Persistent (sleeps, wakes in <1s) |
| Multi-turn | N/A (new sandbox each time) | Built-in (same Sprite, same files) |
| Session tracking | N/A | `sprite_sessions` DB table |
| Claude Code | Install in snapshot (~15-30s) | Pre-installed on all Sprites |
| Python/Node | Install in snapshot | Pre-installed (Ubuntu 25.10) |
| Deps | Baked into snapshot | Install on first use (persists across hibernation) |
| Snapshot/Template | `Sandbox.snapshot()` | Not needed — deps persist, default Sprite used |
| File I/O | `sandbox.runCommand({ cmd: "cat" })` | `sprite.filesystem().readFile()` / `.writeFile()` |
| Commands | `sandbox.runCommand({ cmd, args })` | `sprite.execFile("cmd", [...args], { env })` |
| Cleanup | `sandbox.stop()` in finally block | No cleanup needed — auto-sleep |
| Env vars | `SANDBOX_VERCEL_*` (4 vars) | `SPRITES_TOKEN` (1 var) |
| Output paths | `/tmp/output.xlsx` | `/workspace/output/result.xlsx` |

**Note on xlsx skill files:** The xlsx skill files are vendored at `src/lib/sandbox/skills/xlsx/` (Task 1a) and can be optionally pre-provisioned into a Sprite via the script in Task 10 (they persist across hibernation). If not pre-provisioned, they are uploaded at runtime via `sprite.filesystem().writeFile()`. User's custom skill files (e.g. `re-analyst/SKILL.md`) are always written at runtime.
