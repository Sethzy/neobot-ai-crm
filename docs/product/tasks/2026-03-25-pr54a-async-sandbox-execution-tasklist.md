# Async Sandbox Execution Implementation Plan

**PR:** PR 54a: Async sandbox execution (out-of-plan, design-driven)
**Decisions:** EXEC-02, EXEC-04 (extended — removes runtime ceiling)
**Goal:** Make sandbox tools (`analyze_spreadsheet`, `publish_artifact`) non-blocking so the AI can run as long as needed without timing out the chat stream.

**Architecture:** Both tools currently block via `await sprite.execFile("claude", ...)` for 2-10 min. We swap that single line for `sprite.spawn("bash", [...], { detachable: true })` which fires a detachable tmux session and returns immediately. A webhook callback from the sprite (primary) + cron fallback (30s) detect completion, read results, and deliver them to the chat via `conversation_messages` + Supabase Realtime. The agent optionally presents the result in its voice via a best-effort `runAgent()` call.

**Tech Stack:** Fly Sprites SDK (`@fly/sprites@0.0.1-rc37`), Supabase (Postgres + RLS + Realtime), Next.js API routes, Vercel Cron

**Design Doc:** `docs/plans/2026-03-24-async-sandbox-execution-design.md`

---

## Relevant Files

### New Files
- `src/lib/sandbox/sprite-jobs.ts` — job CRUD, claim/lease, delivery, progress reading, cleanup
- `src/lib/sandbox/sandbox-paths.ts` — centralized output path helpers
- `src/lib/sandbox/__tests__/sprite-jobs.test.ts`
- `src/lib/sandbox/__tests__/sandbox-paths.test.ts`
- `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts`
- `src/lib/sandbox/__tests__/cleanup-sprites.test.ts`
- `app/api/sandbox/callback/route.ts` — webhook callback endpoint
- `app/api/cron/cleanup-sprites/route.ts` — daily cleanup cron
- `supabase/migrations/YYYYMMDD_create_sprite_jobs.sql`

### Modified Files
- `src/lib/sandbox/run-claude-in-sprite.ts` — add `launchBackgroundJob()`, update CLI flags + paths
- `src/lib/sandbox/artifact-runner.ts` — add `launchArtifactBackgroundJob()`, update paths, modify `ensureDevServerService()`
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` — update tests
- `src/lib/sandbox/__tests__/artifact-runner.test.ts` — update tests
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` — swap sync → async
- `src/lib/runner/tools/sandbox/publish-artifact.ts` — swap sync → async
- `src/lib/runner/context.ts` — inject active background jobs into context assembly
- `src/lib/runner/__tests__/context.test.ts` — tests for active jobs injection
- `src/components/chat/chat-panel.tsx` — Supabase Realtime subscription
- `src/components/chat/chat-panel.test.tsx` — tests for Realtime subscription
- `src/lib/sandbox/templates/property-showcase/build.sh` — update output path
- `.env.example` — add SANDBOX_CALLBACK_SECRET

---

## Task 1: Sandbox Path Helpers

**Files:**
- Create: `src/lib/sandbox/sandbox-paths.ts`
- Create: `src/lib/sandbox/__tests__/sandbox-paths.test.ts`

**Step 1: Write failing tests for path helpers**

```typescript
// src/lib/sandbox/__tests__/sandbox-paths.test.ts
import { describe, it, expect } from "vitest";
import {
  jobOutputDir,
  jobStreamLog,
  jobDoneMarker,
  jobErrorMarker,
} from "../sandbox-paths";

describe("sandbox-paths", () => {
  const jobId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("returns job-scoped output directory", () => {
    expect(jobOutputDir(jobId)).toBe(`/workspace/jobs/${jobId}`);
  });

  it("returns job-scoped stream log path", () => {
    expect(jobStreamLog(jobId)).toBe(`/workspace/jobs/${jobId}/stream.jsonl`);
  });

  it("returns job-scoped done marker path", () => {
    expect(jobDoneMarker(jobId)).toBe(`/workspace/jobs/${jobId}/.done`);
  });

  it("returns job-scoped error marker path", () => {
    expect(jobErrorMarker(jobId)).toBe(`/workspace/jobs/${jobId}/.error`);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sandbox-paths.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement sandbox-paths.ts**

```typescript
// src/lib/sandbox/sandbox-paths.ts
/** Centralized output path helpers for async sandbox jobs. */

export function jobOutputDir(jobId: string): string {
  return `/workspace/jobs/${jobId}`;
}

export function jobStreamLog(jobId: string): string {
  return `/workspace/jobs/${jobId}/stream.jsonl`;
}

export function jobDoneMarker(jobId: string): string {
  return `/workspace/jobs/${jobId}/.done`;
}

export function jobErrorMarker(jobId: string): string {
  return `/workspace/jobs/${jobId}/.error`;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sandbox-paths.test.ts
```
Expected: PASS — all 4 tests green.

**Step 5: Commit**

```bash
git add src/lib/sandbox/sandbox-paths.ts src/lib/sandbox/__tests__/sandbox-paths.test.ts
git commit -m "feat(pr54a): add sandbox-paths helper for job-scoped output directories"
```

---

## Task 2: Database Migration — `sprite_jobs` Table

**Files:**
- Create: `supabase/migrations/YYYYMMDD_create_sprite_jobs.sql`

**Step 1: Create the migration file in-repo**

```bash
npx supabase migration new create_sprite_jobs
```

Paste this SQL into the generated file:

```sql
-- Async sandbox job state machine
CREATE TABLE sprite_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sprite_name text NOT NULL,
  job_type text NOT NULL,
  job_meta jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'starting',
  progress_label text,
  result_meta jsonb,
  claimed_at timestamptz,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE sprite_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sprite jobs"
  ON sprite_jobs FOR ALL
  USING (client_id = get_my_client_id());

CREATE INDEX idx_sprite_jobs_active
  ON sprite_jobs (status) WHERE status IN ('starting', 'running');

CREATE UNIQUE INDEX idx_sprite_jobs_sprite_active
  ON sprite_jobs (sprite_name) WHERE status IN ('starting', 'running');
```

**Step 2: Apply migration locally**

```bash
npx supabase db push
```

**Step 3: Regenerate types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 4: Verify via SQL**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sprite_jobs' ORDER BY ordinal_position;
```
Expected: 12 columns matching the schema.

**Step 5: Test unique constraint**

```sql
INSERT INTO sprite_jobs (client_id, thread_id, sprite_name, job_type, status)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'test-sprite', 'analyze', 'running');

-- This should fail with unique violation:
INSERT INTO sprite_jobs (client_id, thread_id, sprite_name, job_type, status)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'test-sprite', 'analyze', 'running');

-- Clean up:
DELETE FROM sprite_jobs WHERE sprite_name = 'test-sprite';
```

**Step 6: Commit**

```bash
git add supabase/migrations/ src/types/database.ts
git commit -m "feat(pr54a): create sprite_jobs table with state machine + RLS"
```

---

## Task 3: Sprite Jobs CRUD + Per-Job HMAC

**Files:**
- Create: `src/lib/sandbox/sprite-jobs.ts`
- Create: `src/lib/sandbox/__tests__/sprite-jobs.test.ts`

**Step 1: Write failing tests for job CRUD and HMAC**

```typescript
// src/lib/sandbox/__tests__/sprite-jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveJobToken } from "../sprite-jobs";

// Test the HMAC derivation (pure function, no DB needed)
describe("deriveJobToken", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "test-secret-key");
  });

  it("produces a hex string", () => {
    const token = deriveJobToken("job-123");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same jobId", () => {
    const a = deriveJobToken("job-123");
    const b = deriveJobToken("job-123");
    expect(a).toBe(b);
  });

  it("produces different tokens for different jobIds", () => {
    const a = deriveJobToken("job-123");
    const b = deriveJobToken("job-456");
    expect(a).not.toBe(b);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement the HMAC function**

```typescript
// src/lib/sandbox/sprite-jobs.ts
/** Async sandbox job management — CRUD, claim/lease, HMAC auth. */

import crypto from "crypto";

/**
 * Derive a per-job HMAC token for webhook callback authentication.
 * Reuses the signing pattern from src/lib/triggers/webhook-auth.ts.
 */
export function deriveJobToken(jobId: string): string {
  return crypto
    .createHmac("sha256", process.env.SANDBOX_CALLBACK_SECRET!)
    .update(jobId)
    .digest("hex");
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs.test.ts
```
Expected: PASS — all 3 tests green.

**Step 5: Add job CRUD functions (test + implement)**

Add to the same test file:

```typescript
describe("formatResultForChat", () => {
  it("formats analyze result with download link", () => {
    const result = formatResultForChat("analyze", {
      summary: "Cap rate is 5.2%",
      downloadUrl: "https://storage.example.com/result.xlsx",
    });
    expect(result).toContain("Cap rate is 5.2%");
    expect(result).toContain("[Download result]");
    expect(result).toContain("https://storage.example.com/result.xlsx");
  });

  it("formats error result", () => {
    const result = formatResultForChat("analyze", {
      error: "Analysis failed. Want me to try again?",
    });
    expect(result).toBe("Analysis failed. Want me to try again?");
  });

  it("formats artifact result with preview URL", () => {
    const result = formatResultForChat("artifact", {
      summary: "Property showcase ready",
      previewUrl: "https://showcase.sprites.app",
    });
    expect(result).toContain("Property showcase ready");
    expect(result).toContain("https://showcase.sprites.app");
  });

  it("handles missing summary gracefully", () => {
    const result = formatResultForChat("analyze", {});
    expect(result).toBe("Analysis complete.");
  });
});
```

Add to `sprite-jobs.ts`:

```typescript
/** Format job result as a human-readable chat message. */
export function formatResultForChat(
  jobType: string,
  meta: Record<string, unknown>
): string {
  if (meta.error) return String(meta.error);
  const summary = String(meta.summary || "Analysis complete.");
  const link = meta.downloadUrl || meta.previewUrl || meta.publishedUrl;
  return link ? `${summary}\n\n[Download result](${link})` : summary;
}
```

**Step 6: Run all tests**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs.test.ts
```
Expected: PASS — all 7 tests green.

**Step 7: Commit**

```bash
git add src/lib/sandbox/sprite-jobs.ts src/lib/sandbox/__tests__/sprite-jobs.test.ts
git commit -m "feat(pr54a): sprite-jobs CRUD, per-job HMAC, result formatting"
```

---

## Task 4: Update CLI Args + Prompt Builders for Job-Scoped Paths

**Files:**
- Modify: `src/lib/sandbox/run-claude-in-sprite.ts`
- Modify: `src/lib/sandbox/artifact-runner.ts`
- Modify: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`
- Modify: `src/lib/sandbox/__tests__/artifact-runner.test.ts`
- Modify: `src/lib/sandbox/templates/property-showcase/build.sh` (if it hardcodes `/tmp/output.html`)

**Step 1: Write failing test — CLI args use stream-json**

Update existing test in `run-claude-in-sprite.test.ts`:

```typescript
it("uses --output-format stream-json instead of --print", () => {
  const args = buildClaudeCliArgs("test prompt", 20);
  expect(args).toContain("--output-format");
  expect(args).toContain("stream-json");
  expect(args).not.toContain("--print");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: FAIL — args still contain `--print`.

**Step 3: Update `buildClaudeCliArgs` in `run-claude-in-sprite.ts`**

Change `"--print"` to `"--output-format", "stream-json"` in the args array. Check the exact current code and swap the flag.

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: PASS.

**Step 5: Do the same for `artifact-runner.ts`**

Update `buildClaudeCliArgs` in artifact-runner.ts — same `--print` → `--output-format stream-json` swap. Update the corresponding test.

**Step 6: Update `buildAnalysisPrompt` to accept outputDir parameter**

Add an `outputDir` parameter (default `/workspace/output` for backwards compat). Update references to `/workspace/output/result.xlsx` and `/workspace/output/summary.txt` to use the parameter.

Write a test:
```typescript
it("uses custom output dir when provided", () => {
  const prompt = buildAnalysisPrompt("analyze this", ["data.xlsx"], "re-analyst", "/workspace/jobs/abc");
  expect(prompt).toContain("/workspace/jobs/abc");
  expect(prompt).not.toContain("/workspace/output");
});
```

**Step 7: Update `buildArtifactPrompt` similarly**

Add `outputDir` parameter. Update `/tmp/output.html` reference to use `${outputDir}/output.html`. Update `build.sh` template if it hardcodes the path.

**Step 8: Run all sandbox tests**

```bash
npx vitest run src/lib/sandbox/__tests__/
```
Expected: ALL PASS.

**Step 9: Commit**

```bash
git add src/lib/sandbox/run-claude-in-sprite.ts src/lib/sandbox/artifact-runner.ts \
  src/lib/sandbox/__tests__/ src/lib/sandbox/templates/
git commit -m "feat(pr54a): switch to stream-json CLI output + job-scoped output paths"
```

---

## Task 5: `launchBackgroundJob()` — The Core Async Primitive

**Files:**
- Modify: `src/lib/sandbox/run-claude-in-sprite.ts`
- Modify: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`

**Step 1: Write failing test for launchBackgroundJob**

```typescript
describe("launchBackgroundJob", () => {
  it("calls sprite.spawn with detachable: true and env", async () => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");

    const mockSpawn = vi.fn();
    const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const sprite = { spawn: mockSpawn, execFile: mockExecFile } as any;
    const jobId = "test-job-123";

    await launchBackgroundJob(sprite, jobId, { prompt: "analyze this", maxTurns: 20 });

    // Should create output directory
    expect(mockExecFile).toHaveBeenCalledWith("mkdir", ["-p", `/workspace/jobs/${jobId}`]);

    // Should call spawn with detachable: true
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("bash");
    expect(opts.detachable).toBe(true);
    expect(opts.env).toHaveProperty("ANTHROPIC_API_KEY");
    expect(opts.env).toHaveProperty("CALLBACK_URL", "https://app.example.com/api/sandbox/callback");
    expect(opts.env).toHaveProperty("JOB_ID", jobId);
  });

  it("includes done/error markers and webhook curl in the wrapper script", async () => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");

    const mockSpawn = vi.fn();
    const sprite = {
      spawn: mockSpawn,
      execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    } as any;

    await launchBackgroundJob(sprite, "job-abc", { prompt: "test", maxTurns: 10 });

    const script = mockSpawn.mock.calls[0][1][1]; // args[1] is the -c script
    expect(script).toContain(".done");
    expect(script).toContain(".error");
    expect(script).toContain("curl");
    expect(script).toContain("CALLBACK_URL");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: FAIL — `launchBackgroundJob` not exported.

**Step 3: Implement launchBackgroundJob**

Add to `run-claude-in-sprite.ts`:

```typescript
import { jobOutputDir } from "./sandbox-paths";
import { deriveJobToken } from "./sprite-jobs";

/**
 * Launch Claude Code in a detachable tmux session.
 * Returns immediately. Process runs at full speed, survives disconnect.
 * Reuses buildClaudeCliArgs() and buildClaudeEnv() from PR 52/53.
 */
export async function launchBackgroundJob(
  sprite: SpriteHandle,
  jobId: string,
  options: { prompt: string; maxTurns: number }
): Promise<void> {
  const { prompt, maxTurns } = options;
  const outputDir = jobOutputDir(jobId);
  const claudeEnv = buildClaudeEnv();
  const cliArgs = buildClaudeCliArgs(prompt, maxTurns);

  await sprite.execFile("mkdir", ["-p", outputDir]);

  const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const claudeCmd = cliArgs.map(shellEscape).join(" ");

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
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: PASS.

**Step 5: Add `launchArtifactBackgroundJob` in artifact-runner.ts**

Same pattern but with artifact-specific prompt and paths. Write a parallel test + implementation. The artifact version uses `buildArtifactPrompt` instead of `buildAnalysisPrompt`.

**Step 6: Run all sandbox tests**

```bash
npx vitest run src/lib/sandbox/__tests__/
```
Expected: ALL PASS.

**Step 7: Commit**

```bash
git add src/lib/sandbox/run-claude-in-sprite.ts src/lib/sandbox/artifact-runner.ts \
  src/lib/sandbox/__tests__/
git commit -m "feat(pr54a): launchBackgroundJob with detachable spawn + webhook callback"
```

---

## Task 6: Tool Handlers — Swap Sync → Async

**Files:**
- Modify: `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`
- Modify: `src/lib/runner/tools/sandbox/publish-artifact.ts`
- Test: `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`

**Reference:** The existing tool test uses `createAnalyzeSpreadsheetTool()` factory and mocks via `vi.hoisted()` + `vi.mock()`. See `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts` for the mock sprite factory pattern.

**Step 1: Write failing test for async analyze_spreadsheet**

Add to the existing `analyze-spreadsheet.test.ts`. Use the existing mock setup pattern (`vi.hoisted` mocks for `getOrCreateSprite`, `runClaudeInSprite`, etc.):

```typescript
it("returns immediately with status 'started' instead of blocking", async () => {
  // Add launchBackgroundJob mock alongside existing vi.hoisted mocks
  const mockLaunchBackgroundJob = vi.fn().mockResolvedValue(undefined);
  // Mock findRunningJob to return null (no concurrent job)
  const mockFindRunningJob = vi.fn().mockResolvedValue(null);

  // Use existing tool factory pattern:
  const tools = createAnalyzeSpreadsheetTool(mockSupabase as never, "client-1", "thread-1");
  const result = await tools.analyze_spreadsheet.execute({
    task: "analyze this",
    files: [{ url: "https://example.com/data.xlsx", filename: "data.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  }, { toolCallId: "test", messages: [], abortSignal: undefined as never });

  expect(result.success).toBe(true);
  expect(result.status).toBe("started");
  expect(result.message).toContain("started");
});

it("rejects if a job is already running on the same sprite", async () => {
  const mockFindRunningJob = vi.fn().mockResolvedValue({ id: "existing-job" });

  const tools = createAnalyzeSpreadsheetTool(mockSupabase as never, "client-1", "thread-1");
  const result = await tools.analyze_spreadsheet.execute({
    task: "analyze", files: [],
  }, { toolCallId: "test", messages: [], abortSignal: undefined as never });

  expect(result.success).toBe(false);
  expect(result.error).toContain("already running");
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts
```
Expected: FAIL — tool still returns sync result.

**Step 3: Modify analyze-spreadsheet.ts**

Replace the blocking section. Keep all setup code (sprite creation, file download, skill loading, dep installation) — only change the final execution:

```typescript
// BEFORE (remove):
const runResult = await runClaudeInSprite(sprite, { ... });
// ... upload, return summary

// AFTER (add):
const existingJob = await findRunningJob(supabase, spriteName);
if (existingJob) {
  return { success: false, error: "A sandbox job is already running. Please wait." };
}

const jobId = crypto.randomUUID();
await insertSpriteJob(supabase, {
  id: jobId, client_id: clientId, thread_id: threadId,
  sprite_name: spriteName, job_type: "analyze",
  job_meta: { skillSlug: SKILL_SLUG, inputFilenames },
});

try {
  const prompt = buildAnalysisPrompt(task, inputFilenames, SKILL_SLUG, jobOutputDir(jobId));
  await launchBackgroundJob(sprite, jobId, { prompt, maxTurns: 20 });
  await updateJobStatus(supabase, jobId, "running");
} catch (err) {
  await updateJobStatus(supabase, jobId, "failed");
  return { success: false, error: "Failed to start analysis." };
}

return { success: true, status: "started", message: "Analysis started. I'll share results when it's ready." };
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/
```

**Step 5: Apply same changes to publish-artifact.ts**

Same pattern: check for running job, insert row, launch background, return immediately.

**Step 6: Run all tests**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/ src/lib/sandbox/__tests__/
```
Expected: ALL PASS.

**Step 7: Commit**

```bash
git add src/lib/runner/tools/sandbox/
git commit -m "feat(pr54a): swap sandbox tools from sync to async execution"
```

---

## Task 7: Webhook Callback Endpoint

**Files:**
- Create: `app/api/sandbox/callback/route.ts`

**Step 1: Write the callback endpoint**

```typescript
// app/api/sandbox/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deriveJobToken } from "@/lib/sandbox/sprite-jobs";
import { deliverResult, failJob } from "@/lib/sandbox/sprite-jobs";
import { getSpritesClient } from "@/lib/sandbox/sprites-client";
import { getSpritesToken } from "@/lib/sandbox/env";
import { createAdminClient } from "@/lib/supabase/server";
import { jobDoneMarker, jobErrorMarker } from "@/lib/sandbox/sandbox-paths";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { jobId } = body;

  if (!jobId) {
    return NextResponse.json({ error: "missing jobId" }, { status: 400 });
  }

  // Verify per-job HMAC
  const auth = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth || auth !== deriveJobToken(jobId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminClient();

  // CAS: acquire ownership
  const { data: job } = await supabase
    .from("sprite_jobs")
    .update({ status: "delivering", claimed_by: "webhook", claimed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "running")
    .select()
    .single();

  if (!job) {
    return NextResponse.json({ ok: true }); // already delivered or not found
  }

  const sprite = getSpritesClient(getSpritesToken()).sprite(job.sprite_name);
  const outputDir = `/workspace/jobs/${jobId}`;

  try {
    // Verify markers independently — don't trust the callback status
    const isDone = await sprite.execFile("test", ["-f", jobDoneMarker(jobId)])
      .then(() => true).catch(() => false);
    const isError = await sprite.execFile("test", ["-f", jobErrorMarker(jobId)])
      .then(() => true).catch(() => false);

    if (isDone) {
      await deliverResult(job, sprite, supabase);
    } else if (isError) {
      await failJob(job, "Analysis failed. Want me to try again?", supabase);
    } else {
      // Callback fired but markers not present — release for cron
      await supabase.from("sprite_jobs")
        .update({ status: "running", claimed_by: null, claimed_at: null })
        .eq("id", job.id);
    }
  } catch {
    // Release for cron retry
    await supabase.from("sprite_jobs")
      .update({ status: "running", claimed_by: null, claimed_at: null })
      .eq("id", job.id);
  }

  return NextResponse.json({ ok: true });
}
```

**Step 2: Manual test with curl (after full integration)**

This endpoint will be tested end-to-end in Task 10. For now, commit the route.

**Step 3: Commit**

```bash
git add app/api/sandbox/callback/
git commit -m "feat(pr54a): webhook callback endpoint for async job delivery"
```

---

## Task 8: Result Delivery + Cron Fallback

**Files:**
- Modify: `src/lib/sandbox/sprite-jobs.ts` — add `deliverResult`, `failJob`, `checkActiveSpriteJobs`, `readLatestProgress`
- Create: `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts`

**Step 1: Write failing test for readLatestProgress**

```typescript
describe("readLatestProgress", () => {
  it("extracts tool_use name from stream-json NDJSON", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pip3 install pandas" } }] } }),
    ].join("\n");

    const result = parseProgressFromLines(lines);
    expect(result).toBe("Running: pip3 install pandas");
  });

  it("extracts Edit tool with file path", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/workspace/model.xlsx" } }] } }),
    ].join("\n");

    const result = parseProgressFromLines(lines);
    expect(result).toBe("Editing /workspace/model.xlsx");
  });

  it("returns null for empty input", () => {
    expect(parseProgressFromLines("")).toBeNull();
  });

  it("skips malformed JSON lines", () => {
    const lines = "not json\n" + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: {} }] } });
    const result = parseProgressFromLines(lines);
    expect(result).toBe("Using Read");
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts
```

**Step 3: Implement `parseProgressFromLines` (pure function, extracted for testing)**

```typescript
/** Parse NDJSON stream-json lines to extract a human-readable progress label. */
export function parseProgressFromLines(content: string): string | null {
  const lines = content.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_use") {
            const name = block.name;
            const input = block.input || {};
            if (name === "Bash") return `Running: ${(input.command || "").slice(0, 60)}`;
            if (name === "Write" || name === "Edit") return `Editing ${input.file_path || "file"}`;
            if (name === "Read") return `Reading ${input.file_path || "file"}`;
            return `Using ${name}`;
          }
        }
      }
    } catch { continue; }
  }
  return null;
}
```

**Step 4: Run test to verify it passes**

**Step 5: Implement `deliverResult`, `failJob`, `checkActiveSpriteJobs`, `kickAgentRun`**

These functions interact with Supabase, the Sprites SDK, and the runner. They follow patterns from:
- `src/lib/triggers/executor.ts` — how to call `runAgent()` and consume the stream
- `src/lib/runner/run-autopilot.ts` — the stream consumption pattern
- `src/lib/chat/messages.ts` — how to insert conversation_messages

Implement per the design doc sections 5 and 6. Key details:
- `deliverResult()` stores `result_meta` first, inserts `conversation_messages` row, THEN marks `completed`
- `failJob()` marks `failed`, inserts error message, kicks best-effort agent run
- `checkActiveSpriteJobs()` reclaims stale `delivering` rows (>5 min), claims `running` rows, checks markers, updates progress
- `kickAgentRun()` uses `triggerType: "cron"` and drains the stream per `run-autopilot.ts` pattern

**Step 6: Run all tests**

```bash
npx vitest run src/lib/sandbox/__tests__/
```

**Step 7: Commit**

```bash
git add src/lib/sandbox/sprite-jobs.ts src/lib/sandbox/__tests__/
git commit -m "feat(pr54a): result delivery, cron fallback, progress reading"
```

---

## Task 9: Context Assembly — Inject Active Background Jobs

**Files:**
- Modify: `src/lib/runner/context.ts` (NOT `src/lib/ai/system-prompt.ts` — runtime context is assembled here)
- Test: `src/lib/runner/__tests__/context.test.ts`

**Reference:** Dynamic context sections are injected via the `injectedMessages` array in `assembleContext()` (lines 450-466). Other dynamic sections (memory, system reminder) follow this same pattern. Tests use `createMockSupabaseClient()` from `@/test/mocks/supabase`.

**Step 1: Write failing test**

Add to `src/lib/runner/__tests__/context.test.ts`:

```typescript
describe("active background jobs", () => {
  it("injects active sprite jobs into system reminder when jobs are running", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    // Mock the sprite_jobs query to return a running job
    // (chain the mock to handle the specific from("sprite_jobs") call)
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = vi.fn((table: string) => {
      if (table === "sprite_jobs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{
              id: "job-1",
              thread_id: "thread-1",
              job_type: "analyze",
              progress_label: "Running: pip3 install pandas",
              created_at: new Date(Date.now() - 3 * 60000).toISOString(),
            }],
          }),
        } as never;
      }
      return originalFrom(table);
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello",
      clientId: "client-123",
    });

    // Active jobs should appear in injected messages (system reminder pattern)
    const allContent = result.messages.map(m =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    ).join(" ");
    expect(allContent).toContain("Active Background Jobs");
    expect(allContent).toContain("analyze job running for 3 min");
  });

  it("does not inject background jobs section when no jobs are running", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello",
      clientId: "client-123",
    });

    const allContent = result.messages.map(m =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    ).join(" ");
    expect(allContent).not.toContain("Active Background Jobs");
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```
Expected: FAIL — no active jobs query in context assembly.

**Step 3: Add active jobs query to `assembleContext()` in `src/lib/runner/context.ts`**

Insert after existing dynamic context sections (memory, system reminder) in the `assembleContext` function body (~line 450-466 area). Query `sprite_jobs` and format as part of the system reminder or as an additional injected user message:

```typescript
// Active background jobs (for agent awareness)
const activeJobs = await supabase
  .from("sprite_jobs")
  .select("id, thread_id, job_type, progress_label, created_at")
  .eq("client_id", clientId)
  .in("status", ["starting", "running"]);

if (activeJobs.data?.length) {
  let jobsContext = "\n\n## Active Background Jobs\n";
  for (const job of activeJobs.data) {
    const elapsed = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);
    const progress = job.progress_label ? ` — ${job.progress_label}` : "";
    jobsContext += `- ${job.job_type} job running for ${elapsed} min${progress}\n`;
  }
  jobsContext += "\nDo not start another sandbox job on the same thread while one is active.\n";
  // Append to system reminder or inject as separate user message (follow existing pattern)
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(pr54a): inject active background jobs into runner context assembly"
```

---

## Task 10: Frontend — Supabase Realtime for Live Message Delivery

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`
- Test: `src/components/chat/chat-panel.test.tsx` (note: NOT in `__tests__/` — test is colocated)

**Reference:**
- ChatPanel uses prop **`chatId`** (not `threadId`) — see `src/components/chat/chat-panel.tsx:37`
- Browser Supabase client: `createBrowserClient()` from `@/lib/supabase/client` (line 25) or `@/lib/supabase` (line 16)
- Message normalization: `src/lib/chat/message-normalization.ts:34` — normalizes DB rows to `UIMessage`
- Persisted messages use `message_id` field after normalization, NOT `id`
- Existing test surface: `src/components/chat/chat-panel.test.tsx:1`

**Step 1: Write failing test**

Add to `src/components/chat/chat-panel.test.tsx`:

```typescript
describe("background job delivery via Realtime", () => {
  it("subscribes to conversation_messages on mount with chatId", () => {
    // Render ChatPanel with chatId="thread-abc"
    // Assert that supabase.channel("bg-jobs-thread-abc") was called
    // Assert .on("postgres_changes", { table: "conversation_messages", filter: "thread_id=eq.thread-abc" })
  });

  it("appends normalized message from Realtime payload", () => {
    // Render ChatPanel
    // Simulate Realtime INSERT payload with a conversation_messages row:
    //   { message_id: "msg-new", thread_id: "thread-abc", role: "assistant", parts: JSON.stringify([{ type: "text", text: "Your analysis is ready" }]) }
    // Assert the text "Your analysis is ready" appears in the rendered output
  });

  it("deduplicates messages already in the list by message_id", () => {
    // Render ChatPanel with initialMessages containing a message with message_id "msg-1"
    // Simulate Realtime payload with the same message_id "msg-1"
    // Assert "msg-1" content appears only once
  });

  it("unsubscribes on unmount", () => {
    // Render ChatPanel, then unmount
    // Assert supabase.removeChannel() was called
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```
Expected: FAIL — no Realtime subscription in ChatPanel.

**Step 3: Implement Realtime subscription in ChatPanel**

Add a `useEffect` inside `ChatPanel`. Use `chatId` as the thread filter. Import the browser Supabase client from the existing seam:

```typescript
import { createBrowserClient } from "@/lib/supabase/client";
import { normalizeMessage } from "@/lib/chat/message-normalization";

// Add after existing useChat / message loading hooks
useEffect(() => {
  const supabase = createBrowserClient();

  const channel = supabase
    .channel(`bg-jobs-${chatId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_messages",
        filter: `thread_id=eq.${chatId}`,
      },
      (payload) => {
        const newRow = payload.new;
        const normalized = normalizeMessage(newRow);
        setMessages((prev) => {
          // Dedupe on message_id (the field name after normalization)
          if (prev.some((m) => m.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [chatId]);
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```
Expected: PASS.

**Step 5: Verify manually**

1. Open a chat thread in the browser
2. Via Supabase dashboard SQL editor, insert a `conversation_messages` row with `role: 'assistant'` and valid `parts` JSON for the active thread
3. Confirm the message appears live in the chat without page refresh

**Step 6: Commit**

```bash
git add src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx
git commit -m "feat(pr54a): live message delivery via Supabase Realtime subscription"
```

---

## Task 11: Add `SANDBOX_CALLBACK_SECRET` Env Var

**Files:**
- Modify: `.env.example`

**Note:** `maxDuration` is already 300 in `app/api/chat/route.ts:31`. No change needed.

**Step 1: Add `SANDBOX_CALLBACK_SECRET` to `.env.example`**

```
# Async sandbox job webhook callback auth (HMAC signing secret)
SANDBOX_CALLBACK_SECRET=your-sandbox-callback-secret-here
```

**Step 2: Generate a real secret for `.env.local`**

```bash
openssl rand -hex 32
# Add the output to .env.local as SANDBOX_CALLBACK_SECRET=<value>
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "feat(pr54a): add SANDBOX_CALLBACK_SECRET to env example"
```

---

## Task 12: Sprite Cleanup Sweep (Daily Cron)

**Files:**
- Create: `app/api/cron/cleanup-sprites/route.ts`
- Create: `src/lib/sandbox/__tests__/cleanup-sprites.test.ts`

**Reference:** Existing cron auth pattern in `app/api/cron/scan/route.ts` uses `requireCronSecret` from `@/lib/triggers/route-auth`. Follow the same structure.

**Step 1: Write failing test for cleanupStaleSprites logic**

```typescript
// src/lib/sandbox/__tests__/cleanup-sprites.test.ts
describe("cleanupStaleSprites", () => {
  it("destroys sprites inactive for more than 7 days", async () => {
    // Mock supabase to return a stale sprite session (last_active_at = 10 days ago)
    // Mock sprite.destroy()
    // Call cleanupStaleSprites()
    // Assert sprite.destroy() was called
    // Assert markSpriteDestroyed was called
  });

  it("skips sprites with running jobs", async () => {
    // Mock supabase to return a stale session BUT with a running sprite_jobs row
    // Call cleanupStaleSprites()
    // Assert sprite.destroy() was NOT called
  });

  it("handles already-destroyed sprites gracefully", async () => {
    // Mock sprite.destroy() to throw
    // Call cleanupStaleSprites()
    // Assert markSpriteDestroyed was still called (catch + continue)
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/sandbox/__tests__/cleanup-sprites.test.ts
```

**Step 3: Implement `cleanupStaleSprites` in `sprite-jobs.ts`**

Per design doc section 11. Takes `supabase` as a parameter (dependency injection, same pattern as other library functions). Queries `sprite_sessions` for stale rows, checks for running jobs, destroys sprites.

```typescript
export async function cleanupStaleSprites(supabase: SupabaseClient): Promise<{ destroyed: number }> {
  // ... implementation
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/sandbox/__tests__/cleanup-sprites.test.ts
```

**Step 5: Create the cron route**

Follow the existing cron pattern from `app/api/cron/scan/route.ts` — route owns auth + client creation, passes dependencies into library:

```typescript
// app/api/cron/cleanup-sprites/route.ts
import { requireCronSecret } from "@/lib/triggers/route-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { cleanupStaleSprites } from "@/lib/sandbox/sprite-jobs";

export async function GET(request: Request): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = await createAdminClient();
  const result = await cleanupStaleSprites(supabase);
  return Response.json(result);
}
```

**Step 6: Add Vercel Cron config**

Add to `vercel.json` crons array (check existing structure first):
```json
{ "path": "/api/cron/cleanup-sprites", "schedule": "0 3 * * *" }
```

**Step 7: Commit**

```bash
git add app/api/cron/cleanup-sprites/ src/lib/sandbox/__tests__/cleanup-sprites.test.ts \
  src/lib/sandbox/sprite-jobs.ts vercel.json
git commit -m "feat(pr54a): daily sprite cleanup sweep with cron auth + tests"
```

---

## Task 13: Integration Tests — Post-Implementation Hardening

**Note:** This task is explicitly post-implementation hardening, not part of the red-green-refactor cycle. The individual unit tests in Tasks 1-12 provide the TDD coverage. These integration tests verify the full flow end-to-end after all pieces are connected.

**Files:**
- Create: `src/lib/sandbox/__tests__/async-sandbox-integration.test.ts`

**Step 1: Write integration test — tool → cron → delivery**

```typescript
describe("async sandbox execution (integration)", () => {
  it("tool returns 'started', cron detects completion, message is delivered", async () => {
    const mockSpawn = vi.fn();
    const mockExecFile = vi.fn();
    const mockFilesystem = { readFile: vi.fn(), writeFile: vi.fn() };

    // Setup: mock sprite that "completes" when cron checks
    mockExecFile
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // mkdir
      .mockResolvedValueOnce({ stdout: "ok", stderr: "" }) // liveness check
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // test -f .done → success

    mockFilesystem.readFile.mockResolvedValue(Buffer.from("Cap rate is 5.2%"));

    // 1. Call tool → should return "started"
    const toolResult = await analyzeSpreadsheetExecute(/* ... */);
    expect(toolResult.success).toBe(true);
    expect(toolResult.status).toBe("started");

    // 2. Verify sprite_jobs row created with status "running"
    const { data: job } = await supabase.from("sprite_jobs")
      .select("*").eq("status", "running").single();
    expect(job).not.toBeNull();

    // 3. Run cron checker (simulates .done marker existing)
    await checkActiveSpriteJobs(supabase);

    // 4. Verify job is now "completed"
    const { data: completedJob } = await supabase.from("sprite_jobs")
      .select("*").eq("id", job.id).single();
    expect(completedJob.status).toBe("completed");

    // 5. Verify conversation_messages row exists
    const { data: messages } = await supabase.from("conversation_messages")
      .select("*").eq("thread_id", job.thread_id);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].parts).toContain("Cap rate");
  });

  it("webhook callback delivers result with HMAC verification", async () => {
    // 1. Insert a running sprite_jobs row
    const jobId = crypto.randomUUID();
    await supabase.from("sprite_jobs").insert({
      id: jobId, client_id: "c1", thread_id: "t1",
      sprite_name: "test", job_type: "analyze", status: "running",
    });

    // 2. POST to callback with correct HMAC
    const token = deriveJobToken(jobId);
    const response = await POST(new NextRequest("http://localhost/api/sandbox/callback", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, status: "done" }),
    }));

    expect(response.status).toBe(200);

    // 3. Verify job completed + message inserted
    const { data: job } = await supabase.from("sprite_jobs")
      .select("*").eq("id", jobId).single();
    expect(job.status).toBe("completed");
  });

  it("rejects concurrent jobs on same sprite via unique index", async () => {
    // 1. Insert a running job for sprite "thread-abc"
    await supabase.from("sprite_jobs").insert({
      id: crypto.randomUUID(), client_id: "c1", thread_id: "t1",
      sprite_name: "thread-abc", job_type: "analyze", status: "running",
    });

    // 2. Try to insert another running job for same sprite
    const { error } = await supabase.from("sprite_jobs").insert({
      id: crypto.randomUUID(), client_id: "c1", thread_id: "t2",
      sprite_name: "thread-abc", job_type: "artifact", status: "running",
    });

    // 3. Should fail with unique constraint violation
    expect(error).not.toBeNull();
  });
});
```

**Step 2: Run integration tests**

```bash
npx vitest run src/lib/sandbox/__tests__/async-sandbox-integration.test.ts --reporter=verbose
```

**Step 3: Commit**

```bash
git add src/lib/sandbox/__tests__/async-sandbox-integration.test.ts
git commit -m "test(pr54a): integration tests for async sandbox execution flow"
```

---

## Summary

**Note:** PR 54a has already been added to the v2 plan (done during tasklist generation).

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Sandbox path helpers | 2 | 0 |
| 2 | Database migration | 1 | 1 |
| 3 | Sprite jobs CRUD + HMAC | 2 | 0 |
| 4 | CLI args + path updates | 0 | 5 |
| 5 | `launchBackgroundJob()` | 0 | 2 |
| 6 | Tool handler swap | 0 | 2 |
| 7 | Webhook callback endpoint | 1 | 0 |
| 8 | Result delivery + cron | 1 | 1 |
| 9 | Context assembly: active jobs | 0 | 2 |
| 10 | Frontend Realtime | 0 | 2 |
| 11 | Env var | 0 | 1 |
| 12 | Daily cleanup sweep | 2 | 1 |
| 13 | Integration tests | 1 | 0 |
