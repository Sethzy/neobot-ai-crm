# Async Sandbox Execution Design

**Date:** 2026-03-25
**PR:** 54a (sandbox async execution)
**Status:** Final draft (v4 — incorporates three review rounds + live spike)

## Problem

Both sandbox tools (`analyze_spreadsheet`, `publish_artifact`) currently block the chat stream while Claude Code runs inside a Fly Sprite. The Vercel Function holds open an SSE connection via `streamText()`, and the tool handler awaits `sprite.execFile('claude', [...])` synchronously.

- `maxDuration = 120` (current) — cold starts already exceed this
- `maxDuration = 300` (Vercel Pro ceiling) — covers 95% of runs but caps execution
- Cheap models like MiniMax are slower but cost-effective — we want to let them cook without a timeout ceiling

The sprite VM runs independently on Fly.io. It doesn't need the Vercel Function to stay alive. We're blocking on an RPC call to a machine that would happily run on its own.

## Reference Architecture

**Vercel coding-agent-template** (`vercel-labs/coding-agent-template`): POST handler returns immediately, `after()` fires sandbox work, agent output piped to DB, frontend polls every 3-5s. Bounded by `maxDuration` — no recovery if exceeded.

**Async subagent pattern** (Inngest, LangChain): Supervisor agent fires background subagent, gets task ID, returns immediately. Result delivered via event/callback. Standard pattern for long-running delegated work.

We follow the same decoupled pattern with unbounded execution, since the sprite is independent compute.

## Spike Results (2026-03-24)

Tested on live Fly Sprites. The winning primitive is **`spawn({ detachable: true })`**:

| Approach | Returns? | Survives? | Full Speed? | One-Shot? | `env`? |
|---|---|---|---|---|---|
| `nohup ... &` | No (60s) | N/A | N/A | N/A | N/A |
| `setsid + disown` | Yes | Yes | **No** (3-5x throttled) | Yes | N/A |
| Service | Yes | Yes | Yes | No (restarts) | **No** |
| Service + `sleep infinity` | Yes | Yes | Yes | Yes (hack) | **No** |
| **`spawn({ detachable: true })`** | **Yes** | **Yes** | **Yes** (10s = 10s) | **Yes** | **Yes** |

`spawn({ detachable: true })` creates a detachable tmux session — the Sprites-native primitive for long-running processes. The sprite stays awake while the session is active. No `sleep infinity` hack. No service restart behavior. Supports `env` for passing auth credentials directly.

**Sprite sleep after job completes:** sprite transitions to `warm` within ~60s of no activity. Zero compute cost. Filesystem preserved.

## Design

### Overview

```
User: "Analyze this spreadsheet"
  → Gemini Flash calls analyze_spreadsheet
  → Tool handler:
      1. Gets/creates sprite (existing pattern)
      2. Downloads input files, writes skills (existing pattern)
      3. Inserts sprite_jobs row (status: "starting")
      4. Fires Claude Code via spawn({ detachable: true })
      5. Updates job status to "running"
      6. Returns immediately: { success: true, status: "started" }
  → Agent tells user: "Working on your analysis, I'll share results when ready."

Sprite (detachable tmux session, no timeout, full speed):
  → Claude Code / MiniMax cooks for as long as needed
  → Writes output to /workspace/jobs/{jobId}/
  → Touches .done (or .error on failure)
  → curl webhook callback (best effort)

Webhook callback (primary, instant — treated as nudge, not trusted):
  → POST /api/sandbox/callback with jobId + HMAC
  → CAS update: status "running" → "delivering" (prevents double delivery)
  → VERIFY .done/.error markers independently (don't trust callback status)
  → Read results, upload to Storage
  → Insert durable message into conversation_messages (zero-token)
  → Best-effort: kick runAgent() so agent presents result in its voice
  → Mark status "completed" AFTER durable message succeeds

Cron fallback (every 30s, safety net):
  → Claims unclaimed running jobs (same CAS pattern)
  → Also reclaims stale "delivering" rows (claimed >5 min ago)
  → For each: probe sprite for .done / .error
  → Same deliverResult() path as webhook

Frontend (live delivery):
  → ChatPanel subscribes to Supabase Realtime on conversation_messages
  → New rows on the active thread append to the message list live
  → No refresh needed
```

### 1. New `sprite_jobs` Table

Proper job state machine, separate from `sprite_sessions`:

```sql
CREATE TABLE sprite_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sprite_name text NOT NULL,
  job_type text NOT NULL,              -- "analyze" | "artifact"
  job_meta jsonb NOT NULL DEFAULT '{}', -- skill slug, input files, shipIt flag, etc.
  status text NOT NULL DEFAULT 'starting',
    -- starting → running → delivering → completed
    --                     → failed
    --                     → cancelled
    --                     → timeout
  progress_label text,                 -- last known progress from stream.jsonl
  result_meta jsonb,                   -- summary, downloadUrl, previewUrl on completion
  claimed_at timestamptz,              -- claim lease for delivery idempotency
  claimed_by text,                     -- webhook instance or cron instance ID
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE sprite_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own sprite jobs"
  ON sprite_jobs FOR ALL
  USING (client_id = get_my_client_id());

-- Index for cron scanner
CREATE INDEX idx_sprite_jobs_active
  ON sprite_jobs (status) WHERE status IN ('starting', 'running');

-- Prevent concurrent jobs on the same sprite
CREATE UNIQUE INDEX idx_sprite_jobs_sprite_active
  ON sprite_jobs (sprite_name) WHERE status IN ('starting', 'running');
```

State transitions:
- `starting` → `running` (after spawn succeeds)
- `starting` → `failed` (if spawn fails)
- `running` → `delivering` (CAS — webhook or cron acquires ownership)
- `delivering` → `completed` (AFTER durable message insert succeeds)
- `delivering` → `running` (if delivery fails, or stale lease >5 min — released for retry)
- `running` → `failed` / `timeout` / `cancelled`

The `delivering` state prevents double delivery: both webhook and cron use the same CAS update (`WHERE status = 'running'`). If zero rows returned, someone else got it. Stale `delivering` rows (claimed >5 min ago) are reclaimed by cron — handles crashes during delivery.

### 2. Tool Handler Changes

Minimal diff from PR 52/53. The tool handler still does all setup synchronously — only the final `execFile("claude", ...)` line changes.

**Before (PR 52/53 — sync):**
```typescript
execute: async ({ task, files }) => {
  const sprite = await getOrCreateSprite(...);
  await downloadInputsToSprite(sprite, files);
  await writeSkillFilesToSprite(sprite, skillFiles);
  await ensureDependencies(sprite);
  const result = await runClaudeInSprite(sprite, ...);  // ← blocks 2-10 min
  const url = await uploadToStorage(result);
  return { success: true, summary: result.summary, downloadUrl: url };
}
```

**After (PR 54a — async):**
```typescript
execute: async ({ task, files }) => {
  const sprite = await getOrCreateSprite(...);

  // Block concurrent jobs on this sprite
  const existingJob = await findRunningJob(supabase, spriteName);
  if (existingJob) {
    return { success: false, error: "A sandbox job is already running. Please wait." };
  }

  // Same setup as before — unchanged
  await downloadInputsToSprite(sprite, files);
  await writeSkillFilesToSprite(sprite, skillFiles);
  await ensureDependencies(sprite);

  // Insert job row FIRST (status: "starting"), then launch
  const jobId = crypto.randomUUID();
  await insertSpriteJob(supabase, {
    id: jobId, client_id: clientId, thread_id: threadId,
    sprite_name: spriteName, job_type: "analyze",
    job_meta: { skillSlug, inputFilenames, shipIt },
  });

  try {
    await launchBackgroundJob(sprite, jobId, { prompt, maxTurns: 20 });
    await updateJobStatus(supabase, jobId, "running");
  } catch (err) {
    await updateJobStatus(supabase, jobId, "failed");
    return { success: false, error: "Failed to start analysis." };
  }

  return { success: true, status: "started", message: "Analysis started." };
}
```

**What changed:** 5 new lines (job insert + launch + try/catch). Everything above the launch line is identical to PR 52/53.

### 3. Background Execution via Detachable Spawn

The core change — one function that replaces the blocking `execFile("claude", ...)`:

```typescript
/**
 * Launch Claude Code in a detachable tmux session.
 * Returns immediately. Process runs at full speed, survives disconnect.
 * Uses the same buildClaudeCliArgs() and buildClaudeEnv() from PR 52/53.
 */
async function launchBackgroundJob(
  sprite: Sprite,
  jobId: string,
  options: { prompt: string; maxTurns: number }
) {
  const { prompt, maxTurns } = options;
  const outputDir = `/workspace/jobs/${jobId}`;
  const claudeEnv = buildClaudeEnv(); // existing function from claude-env.ts
  const cliArgs = buildClaudeCliArgs(prompt, maxTurns); // existing function

  // Create job output directory
  await sprite.execFile("mkdir", ["-p", outputDir]);

  // Build the wrapper script — argv-safe, no shell interpolation of secrets
  const wrapperScript = [
    `cd ${outputDir}`,
    `${cliArgs.map(shellEscape).join(" ")} > stream.jsonl 2>&1`,
    `EXIT_CODE=$?`,
    `[ $EXIT_CODE -eq 0 ] && touch .done || echo $EXIT_CODE > .error`,
    // Webhook callback — best effort
    `curl -s -X POST "$CALLBACK_URL" \\`,
    `  -H "Authorization: Bearer $CALLBACK_TOKEN" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d "{\\"jobId\\":\\"$JOB_ID\\",\\"status\\":\\"$([ -f .done ] && echo done || echo error)\\"}" \\`,
    `  --max-time 10 || true`,
  ].join("\n");

  // Fire and forget — detachable tmux session
  sprite.spawn("bash", ["-c", wrapperScript], {
    detachable: true,
    env: {
      ...claudeEnv,
      CALLBACK_URL: `${process.env.NEXT_PUBLIC_APP_URL}/api/sandbox/callback`,
      CALLBACK_TOKEN: deriveJobToken(jobId), // per-job HMAC
      JOB_ID: jobId,
    },
  });
  // Don't await. Process runs independently.
}
```

**What this reuses from PR 52/53:**
- `buildClaudeCliArgs()` — same function, same args
- `buildClaudeEnv()` — same function, same auth env vars
- `getOrCreateSprite()` — same lifecycle
- `sprite.spawn()` — same SDK, different options (`detachable: true` instead of awaiting `execFile`)

### 4. Webhook Callback (Primary Delivery)

New endpoint for instant result delivery:

```typescript
// app/api/sandbox/callback/route.ts
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { jobId, status } = await request.json();

  // Verify per-job HMAC token
  const auth = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth || auth !== deriveJobToken(jobId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // CAS: acquire ownership (prevents double delivery with cron)
  const { data: job } = await supabase
    .from("sprite_jobs")
    .update({ status: "delivering", claimed_by: "webhook" })
    .eq("id", jobId)
    .eq("status", "running")  // CAS — only if still "running"
    .select()
    .single();

  if (!job) {
    return NextResponse.json({ ok: true }); // already delivered
  }

  // Treat callback as a nudge — verify markers independently
  // (sandbox has bash access, could forge the callback)
  const sprite = getSpritesClient(getSpritesToken()).sprite(job.sprite_name);
  const outputDir = `/workspace/jobs/${jobId}`;

  try {
    const isDone = await sprite.execFile("test", ["-f", `${outputDir}/.done`])
      .then(() => true).catch(() => false);
    const isError = await sprite.execFile("test", ["-f", `${outputDir}/.error`])
      .then(() => true).catch(() => false);

    if (isDone) {
      await deliverResult(job, sprite);
    } else if (isError) {
      await failJob(job, "Analysis failed. Want me to try again?");
    } else {
      // Callback fired but markers not present yet — release for cron
      await supabase.from("sprite_jobs")
        .update({ status: "running", claimed_by: null })
        .eq("id", job.id);
    }
  } catch {
    // Release for cron retry
    await supabase.from("sprite_jobs")
      .update({ status: "running", claimed_by: null })
      .eq("id", job.id);
  }

  return NextResponse.json({ ok: true });
}
```

**Per-job HMAC** (reuses pattern from `src/lib/triggers/webhook-auth.ts`):
```typescript
function deriveJobToken(jobId: string): string {
  return crypto
    .createHmac("sha256", process.env.SANDBOX_CALLBACK_SECRET!)
    .update(jobId)
    .digest("hex");
}
```

### 5. Cron Fallback (30s, Safety Net)

Same `deliverResult()` path, just a different trigger. Uses the same CAS pattern:

```typescript
async function checkActiveSpriteJobs() {
  // Reclaim stale "delivering" rows (crashed during delivery >5 min ago)
  await supabase
    .from("sprite_jobs")
    .update({ status: "running", claimed_by: null, claimed_at: null })
    .eq("status", "delivering")
    .lt("claimed_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  // Claim running jobs (same CAS as webhook)
  const { data: jobs } = await supabase
    .from("sprite_jobs")
    .update({ status: "delivering", claimed_by: `cron-${Date.now()}`, claimed_at: new Date().toISOString() })
    .eq("status", "running")
    .select();

  for (const job of jobs ?? []) {
    const sprite = getSpritesClient(getSpritesToken()).sprite(job.sprite_name);

    // Liveness check
    try {
      await sprite.execFile("echo", ["ok"]);
    } catch {
      await failJob(job, "Sandbox was interrupted. Want me to try again?");
      continue;
    }

    const outputDir = `/workspace/jobs/${job.id}`;

    // Check completion
    const isDone = await sprite.execFile("test", ["-f", `${outputDir}/.done`])
      .then(() => true).catch(() => false);
    if (isDone) { await deliverResult(job, sprite); continue; }

    // Check error
    const isError = await sprite.execFile("test", ["-f", `${outputDir}/.error`])
      .then(() => true).catch(() => false);
    if (isError) { await failJob(job, "Analysis failed. Want me to try again?"); continue; }

    // Still running — update progress, release claim
    const progress = await readLatestProgress(sprite, `${outputDir}/stream.jsonl`);
    await supabase.from("sprite_jobs")
      .update({
        status: "running", // release back
        claimed_by: null,
        ...(progress ? { progress_label: progress } : {}),
      })
      .eq("id", job.id);

    // Hard timeout: 30 minutes
    const elapsed = Date.now() - new Date(job.created_at).getTime();
    if (elapsed > 30 * 60 * 1000) {
      await supabase.from("sprite_jobs")
        .update({ status: "timeout", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      await insertResultMessage(job, { error: "Analysis timed out after 30 minutes." });
      await kickAgentRun(job);
    }
  }
}
```

### 6. Result Delivery (Shared Path)

Both webhook and cron call this. Two-phase: durable message first, agent run second.

```typescript
async function deliverResult(job: SpriteJobRow, sprite: Sprite) {
  const outputDir = `/workspace/jobs/${job.id}`;
  const filesystem = sprite.filesystem();
  const meta = job.job_meta as Record<string, unknown>;

  // Read summary
  const summary = await filesystem.readFile(`${outputDir}/summary.txt`)
    .then(b => b.toString("utf-8")).catch(() => "Analysis complete.");

  let resultMeta: Record<string, unknown> = { summary };

  // Job-type-specific handling
  if (job.job_type === "analyze") {
    const data = await filesystem.readFile(`${outputDir}/result.xlsx`).catch(() => null);
    if (data) {
      resultMeta.downloadUrl = await uploadArtifactToStorage(
        job.client_id, job.thread_id, "result.xlsx", data
      );
    }
  } else if (job.job_type === "artifact") {
    // Wait for dev server readiness before publishing URL
    await ensureDevServerService(sprite);
    await waitForPort(sprite, 8080); // poll until HTTP 200
    await sprite.updateURLSettings({ auth: "public" });
    resultMeta.previewUrl = sprite.url;

    if (meta.shipIt) {
      const html = await filesystem.readFile(`${outputDir}/output.html`).catch(() => null);
      if (html) {
        resultMeta.publishedUrl = await uploadArtifactToStorage(
          job.client_id, job.thread_id, "showcase.html", html
        );
      }
    }
  }

  // Phase 1: Durable message FIRST (deterministic, zero-token)
  // Store result meta on the job row (but don't mark completed yet)
  await supabase.from("sprite_jobs").update({ result_meta: resultMeta }).eq("id", job.id);

  // Insert into conversation_messages (the actual table the chat uses)
  await insertResultMessage(job, resultMeta);

  // NOW mark completed — after durable message exists
  // (if we crash before this, cron reclaims the delivering row and retries)
  await supabase.from("sprite_jobs").update({
    status: "completed", completed_at: new Date().toISOString(),
  }).eq("id", job.id);

  // Phase 2: Agent run for natural voice (best-effort — user already has the message)
  await kickAgentRun(job).catch(() => {});
}

/**
 * Insert a visible message into conversation_messages (the actual table ChatPanel reads).
 * Frontend picks this up via Supabase Realtime subscription (see section 13).
 */
async function insertResultMessage(job: SpriteJobRow, resultMeta: Record<string, unknown>) {
  await supabase.from("conversation_messages").insert({
    thread_id: job.thread_id,
    role: "assistant",
    parts: JSON.stringify([{
      type: "text",
      text: formatResultForChat(job.job_type, resultMeta),
    }]),
  });
}

/** Format result as human-readable chat message. */
function formatResultForChat(jobType: string, meta: Record<string, unknown>): string {
  if (meta.error) return String(meta.error);
  const summary = meta.summary || "Analysis complete.";
  const link = meta.downloadUrl || meta.previewUrl || meta.publishedUrl;
  return link ? `${summary}\n\n[Download result](${link})` : String(summary);
}

/**
 * Kick an agent run to present the result in the agent's voice.
 * Uses the runAutopilot consumption pattern (handles the real runAgent union type).
 * See: src/lib/runner/run-autopilot.ts:29
 */
async function kickAgentRun(job: SpriteJobRow) {
  const result = await runAgent({
    clientId: job.client_id,
    threadId: job.thread_id,
    triggerType: "cron", // reuse existing type, no new runner wiring
    input: `Background sandbox job completed. Present the results to the user.`,
  });
  // Must consume the stream to finalize (same as run-autopilot.ts)
  if (result.status === "streaming" && result.streamResult) {
    for await (const _part of result.streamResult.fullStream) { /* drain */ }
  }
}

async function failJob(job: SpriteJobRow, errorMessage: string) {
  await supabase.from("sprite_jobs").update({
    status: "failed", result_meta: { error: errorMessage },
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  await insertResultMessage(job, { error: errorMessage });
  await kickAgentRun(job).catch(() => {});
}
```

### 7. Agent Awareness of Background Jobs

```typescript
// In system-prompt.ts — inject active jobs into context
const activeJobs = await supabase
  .from("sprite_jobs")
  .select("id, thread_id, job_type, progress_label, created_at")
  .eq("client_id", clientId)
  .in("status", ["starting", "running"]);

if (activeJobs.data?.length) {
  context += "\n\n## Active Background Jobs\n";
  for (const job of activeJobs.data) {
    const elapsed = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);
    const progress = job.progress_label ? ` — ${job.progress_label}` : "";
    context += `- ${job.job_type} job running for ${elapsed} min${progress}\n`;
  }
  context += "\nDo not start another sandbox job on the same thread while one is active.\n";
}
```

### 8. Cancellation

Kill the detachable session. No PID files, no service deletion:

```typescript
async function cancelSpriteJob(job: SpriteJobRow) {
  const sprite = getSpritesClient(getSpritesToken()).sprite(job.sprite_name);
  // Kill all claude processes in the sprite
  await sprite.execFile("bash", ["-c", "pkill -f claude || true"]).catch(() => {});
  await supabase.from("sprite_jobs").update({
    status: "cancelled", completed_at: new Date().toISOString(),
  }).eq("id", job.id);
}
```

### 9. Progress Updates via `stream.jsonl`

Claude Code's `--output-format stream-json` writes NDJSON. The cron reads the tail to extract a progress label:

```typescript
async function readLatestProgress(sprite: Sprite, path: string): Promise<string | null> {
  try {
    const tail = await sprite.execFile("tail", ["-c", "4096", path]);
    const lines = toUtf8String(tail.stdout).split("\n").filter(Boolean);
    // Parse backwards — find latest tool_use event
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
              return `Using ${name}`;
            }
          }
        }
      } catch { continue; } // skip incomplete lines
    }
  } catch { return null; }
  return null;
}
```

**Note:** Current PR 52/53 uses `--print`, not `--output-format stream-json`. The async PR switches to `stream-json` to enable progress reading. This is a CLI flag change in `buildClaudeCliArgs()`.

### 10. Output Path Migration

PR 52/53 hardcodes `/workspace/output/` in prompts and tool handlers. Async uses `/workspace/jobs/{jobId}/`. A small `sandbox-paths.ts` helper centralizes this:

```typescript
// src/lib/sandbox/sandbox-paths.ts
export function jobOutputDir(jobId: string) { return `/workspace/jobs/${jobId}`; }
export function jobStreamLog(jobId: string) { return `/workspace/jobs/${jobId}/stream.jsonl`; }
export function jobDoneMarker(jobId: string) { return `/workspace/jobs/${jobId}/.done`; }
export function jobErrorMarker(jobId: string) { return `/workspace/jobs/${jobId}/.error`; }
```

Update prompt builders (`buildAnalysisPrompt`, `buildArtifactPrompt`) to use the job-scoped path. Update `build.sh` template to output to `${OUTPUT_DIR}/output.html` instead of `/tmp/output.html`.

### 11. Sprite Cleanup Sweep

Daily Vercel Cron (`0 3 * * *`). Destroys sprites inactive >7 days:

```typescript
async function cleanupStaleSprites() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: stale } = await supabase
    .from("sprite_sessions")
    .select("*")
    .lt("last_active_at", cutoff.toISOString())
    .neq("status", "destroyed");

  for (const session of stale ?? []) {
    // Skip if running jobs exist
    const { count } = await supabase.from("sprite_jobs")
      .select("*", { count: "exact", head: true })
      .eq("sprite_name", session.sprite_name)
      .in("status", ["starting", "running"]);
    if ((count ?? 0) > 0) continue;

    try {
      const sprite = getSpritesClient(getSpritesToken()).sprite(session.sprite_name);
      await sprite.destroy();
    } catch { /* already gone */ }
    await markSpriteDestroyed(supabase, session.sprite_name);
  }
}
```

### 12. Frontend: Live Delivery via Supabase Realtime

The current ChatPanel loads messages once from the server and only reacts to stream data parts from `useChat`. Background job results (inserted into `conversation_messages` by the delivery path) won't appear live without a Realtime subscription.

Add to `chat-panel.tsx` (~20 lines):

```typescript
// Subscribe to new messages on the active thread
useEffect(() => {
  const channel = supabase
    .channel(`thread-${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        const newMsg = payload.new as ConversationMessage;
        // Only append if it's not already in the messages array
        // (the agent run may produce a duplicate via the stream)
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, normalizeMessage(newMsg)];
        });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [threadId, supabase]);
```

This is the same Supabase Realtime pattern used elsewhere in the app. The subscription automatically handles:
- Background job results appearing live (no refresh)
- Deduplication (if the agent run also produces the same message via stream)
- Cleanup on unmount

**Note:** The durable message is inserted as `role: "assistant"` with a formatted text part, so it renders naturally in the existing message bubble component — no special rendering needed.

### 13. Sprite Filesystem Layout

```
/workspace/jobs/{jobId}/
  .done             ← touched on successful completion
  .error            ← contains exit code on failure
  stream.jsonl      ← Claude Code stream-json output (progress)
  summary.txt       ← human-readable summary (written by Claude)
  result.xlsx       ← output artifact (analyze_spreadsheet)
  output.html       ← built static page (publish_artifact shipIt)

/workspace/input/    ← input files (unchanged from PR 52/53)
/workspace/data/     ← property data (unchanged)
/workspace/photos/   ← photos (unchanged)
/skills/             ← skill files (unchanged)
```

## What Changes vs What Doesn't

**Changes:**
- `analyze-spreadsheet.ts` — swap `await runClaudeInSprite()` → job insert + `launchBackgroundJob()` + return
- `publish-artifact.ts` — same swap
- `run-claude-in-sprite.ts` — new `launchBackgroundJob()` (reuses `buildClaudeCliArgs` + `buildClaudeEnv`)
- `artifact-runner.ts` — new `launchArtifactBackgroundJob()` (same pattern)
- `buildClaudeCliArgs()` — switch `--print` to `--output-format stream-json`
- Prompt builders (`buildAnalysisPrompt`, `buildArtifactPrompt`) — use job-scoped output paths
- `build.sh` template — output to `${OUTPUT_DIR}/output.html` instead of `/tmp/output.html`
- `artifact-runner.ts` `ensureDevServerService()` — called from delivery path, remove `isNew` requirement
- `chat-panel.tsx` — add Supabase Realtime subscription for live message delivery (~20 lines)
- New `src/lib/sandbox/sprite-jobs.ts` — job CRUD, claim/lease, progress reading, delivery
- New `src/lib/sandbox/sandbox-paths.ts` — centralized output path helpers
- New migration — `sprite_jobs` table + RLS + indexes
- New `app/api/sandbox/callback/route.ts` — webhook endpoint (nudge pattern)
- Cron scanner — new `checkActiveSpriteJobs()` (30s) with stale lease recovery
- New daily cron — sprite cleanup sweep
- System prompt — inject active background jobs
- `chat/route.ts` — bump `maxDuration` to 300
- New env var — `SANDBOX_CALLBACK_SECRET`

**Does NOT change:**
- Runner (`run-agent.ts`) — same loop, same trigger types (`cron` reused)
- Tool registry — same tools, same names, same input schemas
- `sprite_sessions` — untouched
- Sprite lifecycle — same `getOrCreateSprite`
- Skills system — same loading, same bootstrap
- Dev server Services — still used for preview (unchanged from PR 53)
- Message normalization / bubble rendering — durable message uses `role: "assistant"` + text parts

**Known caveat (accepted):** Sync setup (pip3/apt-get on cold sprite) still runs before spawn and eats into `maxDuration = 300`. This PR removes the Claude runtime ceiling, not the startup ceiling. Startup optimization is a follow-up.

## Decisions

1. **`spawn({ detachable: true })` is the execution primitive.** Native Sprites feature. Full speed, survives disconnect, supports `env`, one-shot. No Services hack. Verified in spike.
2. **Both tools go async, always.**
3. **Webhook callback as nudge, cron (30s) as fallback.** Webhook triggers delivery but verifies `.done`/`.error` markers independently — doesn't trust the sandbox to declare itself finished. Standard webhook + polling reconciliation pattern.
4. **CAS-based `delivering` state prevents double delivery.** Both webhook and cron use same `UPDATE ... WHERE status = 'running'`. Stale `delivering` rows (>5 min) reclaimed by cron.
5. **DB row inserted BEFORE spawn.** Status `starting` → `running` after spawn succeeds. No orphaned processes.
6. **Durable message into `conversation_messages` first, `completed` status second.** Crash between the two → cron reclaims and retries. User always gets the result.
7. **Agent run is best-effort polish.** The durable message is the correctness path. `kickAgentRun()` adds agent voice but failure doesn't lose the result.
8. **Reuse `cron` trigger type** for agent runs. Uses `runAutopilot` stream consumption pattern. No new runner wiring.
9. **Per-job HMAC for callback auth.** Reuses webhook-auth.ts pattern. No shared secret.
10. **Job-scoped output dirs** + `sandbox-paths.ts` helper.
11. **`--output-format stream-json`** replaces `--print` to enable progress reading.
12. **Daily sprite cleanup** for stale sprites >7 days.
13. **`maxDuration = 300`** for sync setup phase.
14. **Frontend Realtime subscription** on `conversation_messages` for live delivery in ChatPanel. ~20 lines.
15. **Sync startup ceiling accepted for this PR.** Cold-start pip3/apt-get runs before spawn. Follow-up optimization.

## Unresolved Questions

1. **Detachable session max lifetime:** Does Fly have a hard timeout on how long a detachable tmux session can run? Our hard timeout is 30 min, so likely fine.

2. **Artifact preview readiness:** `waitForPort(sprite, 8080)` in the delivery path — need to implement the HTTP poll loop. How long to wait before giving up?

3. **`stream.jsonl` prompt injection:** Progress labels are advisory-only and never executed, but a malicious spreadsheet could produce misleading labels. Low risk.
