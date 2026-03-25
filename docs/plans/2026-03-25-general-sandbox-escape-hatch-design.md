# General Sandbox Escape Hatch Design

**Date:** 2026-03-25
**PR:** TBD (sandbox generalization)
**Status:** Draft (reviewed x3)
**Builds on:** PR 54a (async sandbox execution)

## Problem

Sunder's sandbox is two hardcoded tools (`analyze_spreadsheet`, `publish_artifact`) that only handle spreadsheets and web artifacts. When the agent encounters a task that needs code execution — generating a PDF, editing a Word doc, filling a form, crunching data in a novel way — it has no escape hatch. It tells the user "I can't do that."

## Goal

One general-purpose `execute_in_sandbox` tool that replaces both existing tools. Any skill can opt into sandbox execution via its description. Ported Viktor-style knowledge-work skills (PDF, Word, PowerPoint, PDF forms, PDF signing) ship as bundled defaults. Per-client persistent Sprites with auto-queuing for concurrent jobs.

## Non-Goals

- Browser automation (separate concern, different infra)
- Replacing structured CRM/memory tools with sandbox execution
- Skill marketplace or user-to-user skill sharing
- Skill creation meta-skill (follow-up PR)

## Reference Architecture

**Viktor (getviktor.com):** Code execution is the core primitive. 48 tools, but `bash` handles the long tail. Skills are markdown files that teach the agent how to write code. Persistent Modal volume per workspace. See `roadmap docs/Sunder - Source of Truth/references/viktor-ai/`.

**Fintool (Nicolas Bustamante):** S3 is the source of truth for all files (skills, memories, data). PostgreSQL `fs_files` table is a queryable index synced from S3. Sandbox reads files from S3, not from the DB. Three-tier skill shadowing (private > shared > public). See `roadmap docs/Sunder - Source of Truth/references/Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md`.

**Sunder's equivalent:** Supabase Storage is the source of truth (S3 under the hood). The `<available-skills>` catalog in the system prompt is the queryable index. The Sprite is a runtime cache synced from Supabase Storage.

---

## Design

### 1. One Tool Replaces Two

`execute_in_sandbox` replaces `analyze_spreadsheet` and `publish_artifact`.

```typescript
execute_in_sandbox({
  task: string,              // natural language task description
  skills: string[],          // skill slugs — first is primary, rest are companions
  inputFiles?: string[],     // Supabase Storage paths OR URLs (see contract below)
})
```

**Canonical contracts (referenced by tool schema, job_meta, queue promotion, and delivery):**

**skills:** array of skill slugs. First element is the primary skill (referenced first in the Claude Code prompt). Remaining elements are companions (synced to Sprite, referenced as "also read"). All are synced to `/skills/{slug}/` on the Sprite before the job launches. Outer workflow skills pass companions this way: `skills: ["excel_editing", "re-analyst"]`.

**inputFiles:** each value is either:
- A **storage-relative path** (no `://`) — e.g. `"uploads/comps.xlsx"` (clientId is NOT included; the tool handler prepends it). Downloaded via `agentFiles.downloadBinary(clientId, path)`.
- A **URL** (starts with `https://`) — e.g. a signed Supabase URL, an external photo URL. Downloaded via `fetchSafeExternalResource(url)` with SSRF protection.

The tool handler sniffs the format (`value.startsWith("https://")`) and routes accordingly. Both are written to `/workspace/jobs/{jobId}/input/{filename}` on the Sprite.

**job_meta** (persisted on the `sprite_jobs` row, used by queue promotion):
```typescript
{
  skills: string[],        // same array as tool input
  task: string,            // same string as tool input
  inputFiles: string[],    // stored as-is (paths or URLs)
  outputDir: string,       // "/workspace/jobs/{jobId}"
}
```

Queue promotion reads `job_meta` and replays the full flow: download inputFiles (sniff format), sync skills, build prompt, launch.

The tool handler:
1. `getOrCreateSprite(clientId)` — per-client, not per-thread
2. `findRunningJob()` — if busy, insert as `queued` and return early
3. `syncSkillsToSprite(skillSlugs)` — read each from Supabase Storage, write to Sprite
4. Download input files to `/workspace/jobs/{jobId}/input/` (sniff URL vs storage path)
5. Insert `sprite_jobs` row (status: `starting`, `job_meta` stores skills, task, inputFiles, outputDir)
6. `launchBackgroundJob()` via `spawn({ detachable: true })`
7. Return immediately: `{ success: true, status: "started" }`

### 2. Per-Client Persistent Sprite

Change `sprite_sessions` lookup from `(client_id, thread_id)` to `(client_id)`. One Sprite per client, reused across all threads and conversations.

The `thread_id` column stays for tracking which thread last used the Sprite but is no longer part of the unique lookup.

**Migration — two-phase rollout:**

**Phase A (this deploy):** Migration dedupes idle orphans only: for each `client_id` with multiple rows, keep the row with the most recent `last_active_at`, destroy other Sprites via the API, delete orphan rows. Skip rows whose Sprite has an active (starting/running) job. Do NOT add the `client_id`-only unique index yet — some clients may still have multiple rows if an orphan has an active job. Code changes land: tool handler uses `ORDER BY last_active_at DESC LIMIT 1` lookup instead of relying on a unique constraint.

**Phase B (follow-up deploy, after all old jobs drain):** Add the `client_id`-only unique index. By now every client has at most one row.

Benefits:
- Installed packages persist across conversations (no repeated cold starts)
- Skills accumulate on the Sprite filesystem over time
- Workspace state persists (temp files, downloaded data, etc.)

Cleanup sweep changes from 7 days to **30 days** of inactivity before destroying a Sprite. This requires updating both the migration AND the hardcoded constant in `sprite-jobs.ts` (`cleanupStaleSprites`) plus its test assertions.

### 3. Auto-Queue for Concurrent Jobs

When a second job arrives while one is `starting` or `running`:
- Insert with `status: "queued"` instead of rejecting
- Agent tells user: "Queued — I'll start once the current job finishes"
- Delivery path of the first job checks for queued jobs and launches the next one

**Unique index:** Keep the existing constraint on BOTH `starting` and `running` statuses. `queued` rows are exempt — multiple `queued` rows per Sprite are allowed.

**Job-scoped input dirs:** Each job writes input to `/workspace/jobs/{jobId}/input/` (not shared `/workspace/input/`). This prevents race conditions when a second job is queued while the first is running.

**Queue promotion with CAS:** Use `UPDATE sprite_jobs SET status = 'starting' WHERE id = X AND status = 'queued'` to prevent race conditions. If CAS fails, skip (another promotion raced).

**job_meta must store everything needed for promotion:**
```typescript
job_meta: {
  skill: string,
  task: string,
  inputStoragePaths: string[],
  outputDir: string,
}
```

The delivery path rebuilds the launch from `job_meta` — calls `syncSkillToSprite()`, `buildSandboxPrompt()`, `launchBackgroundJob()`.

**Stranded queued rows:** Cleanup cron checks for `queued` rows older than 1 hour with no `running` sibling on the same Sprite — these are stranded and should be failed with an error message.

```typescript
// In deliverResult(), after marking current job completed:
const { data: next } = await supabase
  .from("sprite_jobs")
  .select("*")
  .eq("sprite_name", job.sprite_name)
  .eq("status", "queued")
  .order("created_at")
  .limit(1)
  .maybeSingle();

if (next) {
  // CAS claim: queued → starting
  const { count } = await supabase
    .from("sprite_jobs")
    .update({ status: "starting" })
    .eq("id", next.id)
    .eq("status", "queued");

  if (count === 1) {
    // Notify user (with source tag for Realtime subscription)
    await createMessage(supabase, {
      threadId: next.thread_id,
      role: "assistant",
      text: `Starting your ${next.job_meta.skill} task now.`,
      source: "background-job",
    });
    await syncSkillToSprite(sprite, next.job_meta.skill, supabase, next.client_id);
    const prompt = buildSandboxPrompt({ ...next.job_meta });
    await launchBackgroundJob(sprite, next.id, { prompt, maxTurns: 20 });
    await updateJobStatus(supabase, next.id, "running");
  }
}
```

### 4. No Pre-Install — Claude Code Handles Dependencies

Delete `ensureSpreadsheetDependencies()`, `ensureArtifactDependencies()`, and all pre-install logic entirely. Dependencies move from the time-limited Vercel Function into the unbounded async Sprite job.

Each SKILL.md declares its own dependencies in a Setup section:

```markdown
## Setup
First run: `pip3 install weasyprint` (cached on subsequent runs).
```

Claude Code reads the skill, installs what it needs, does the work. The persistent Sprite caches installed packages — subsequent runs skip the install automatically.

**Why this is better:**
- Tool handler exits in ~5 seconds (no `maxDuration` pressure)
- No bootstrap function to maintain
- Per-skill deps instead of fat base (first Word doc doesn't install libreoffice)
- Claude Code already knows how to `pip3 install` — it's what it does

### 5. Skill System

#### 5.1 Two-Tier Skill Model

Skills fall into two categories with different routing:

**Sandbox skills** — teach Claude Code how to do work inside the Sprite. Their description includes `execute_in_sandbox`. Two subtypes:

- **Primary sandbox skills** — the main skill for a job type. Gemini calls `execute_in_sandbox` with this slug directly.
  - `pdf_creation`, `excel_editing`, `docx_editing`, `pptx_editing`, `pdf_form_filling`, `pdf_signing`, `publish_website`

- **Companion skills** — domain context for Claude Code. NOT direct entry points. No `execute_in_sandbox` in their description. Not shown in `formatAvailableSkills()` with the tool hint. Only reach the Sprite when an outer workflow passes them in the `skills` array.
  - `re-analyst` — real estate analysis domain knowledge (passed alongside `excel_editing` by `deal-comparison`/`market-report` workflows)
  - `frontend-design` — frontend aesthetics preferences (passed alongside `publish_website` by `property-showcase` workflow)

Primary sandbox skills are NOT read by Gemini via `read_file` — they're instructions for Claude Code inside the Sprite. Companion skills are also only read by Claude Code, never by Gemini.

**Spreadsheet regression path:** User says "analyze this spreadsheet" → two possible routes:
1. Gemini matches `deal-comparison` outer workflow → reads its SKILL.md → calls `execute_in_sandbox({ skills: ["excel_editing", "re-analyst"], ... })` → both synced to Sprite → Claude Code has domain context
2. No outer workflow matches (raw request) → Gemini matches `excel_editing` (primary, has trigger phrase) → calls `execute_in_sandbox({ skills: ["excel_editing"], ... })` → works without re-analyst domain context (acceptable degradation)

**Outer workflow skills** (existing) — teach Gemini a multi-step workflow. No `execute_in_sandbox` in their description:
- `deal-comparison`, `property-showcase`, `market-report`, `call-prep`, etc.
- Gemini reads the SKILL.md via `read_file`, follows the workflow steps, and may call `execute_in_sandbox` with primary + companion skills as one step

Example: `deal-comparison` SKILL.md (outer workflow) says:
```
1. Gather deal data from CRM via list_deals and get_deal tools
2. Get property data via search_properties
3. Call execute_in_sandbox({
     skills: ["excel_editing", "re-analyst"],
     task: "Build a comparison spreadsheet with these deals: {data}",
     inputFiles: [...]
   })
4. Present the result to the user
```

The system prompt routing rule:
```
Skills whose description says "execute_in_sandbox" are sandbox skills —
invoke execute_in_sandbox with that skill's slug.

All other skills: read the SKILL.md via read_file and follow its
workflow using your structured tools (which may include calling
execute_in_sandbox with additional companion skills as one step).
```

This matches the existing system prompt contract where matched skills trigger `read_file`. Companion skills are invisible to the routing — they only appear when an outer workflow explicitly passes them in the `skills` array.

#### 5.2 Bundled Sandbox Skills (7 New)

Ported from Viktor, adapted for Sunder's context:

| Skill | Lines | What it teaches Claude Code |
|-------|-------|-----------------------------|
| `pdf_creation` | ~100 | weasyprint from HTML/CSS, fonts, page breaks, brand style extraction |
| `excel_editing` | ~190 | openpyxl + pandas, formula best practices, validation scripts, financial model standards. **Replaces current xlsx bundled skill.** |
| `docx_editing` | ~10 | python-docx, run-aware replacement to preserve formatting |
| `pptx_editing` | ~10 | python-pptx, blank layouts, read structure first |
| `pdf_form_filling` | ~10 | pymupdf, detect fillable fields first, coordinate-based fallback |
| `pdf_signing` | ~10 | Download Kalam font, overlay signature |
| `publish_website` | ~50 | here.now 3-step publish flow, HTML/CSS generation |

Content strings live in `skill-templates.ts` (same pattern as existing skills). `bootstrapSkills()` seeds them into Supabase Storage on first client onboarding.

#### 5.3 Existing Skills — Body Rewrites Required

**Outer workflow skills** with obsolete tool references in their bodies:
- `deal-comparison` — calls `analyze_spreadsheet({ files: ... })` → rewrite to `execute_in_sandbox({ skills: ["excel_editing", "re-analyst"], ... })`
- `property-showcase` — calls `publish_artifact({ propertyData: ..., photos: ... })` → rewrite to `execute_in_sandbox({ skills: ["publish_website", "frontend-design"], ... })`
- `market-report` — calls `analyze_spreadsheet({ ... })` → rewrite to `execute_in_sandbox({ skills: ["excel_editing", "re-analyst"], ... })`

**Companion skills** — body content (domain knowledge) stays largely the same. No `execute_in_sandbox` in their descriptions. Only change: remove any references to the old `analyze_spreadsheet`/`publish_artifact` tool names from their bodies.

**Migration for existing clients:** `bootstrapSkills()` uses `upsert: false` — it only creates missing slugs, so existing clients keep old bodies. Add a one-time `migrateSkillBodies()` function that force-overwrites the 5 skills above for all existing clients. Run on deploy.

#### 5.4 User-Created Skills Can Opt In

When the agent or user creates a new skill that needs code execution, the description includes the `execute_in_sandbox` trigger phrase.

#### 5.5 Supabase Storage Is the Source of Truth

Following the Fintool S3-first pattern:

- **Bundled skills:** seeded to Supabase Storage by `bootstrapSkills()` (existing mechanism)
- **User skills:** created by the agent via `write_file` tool → Supabase Storage
- **Sprite sync:** every job reads the skill from Supabase Storage and writes it to the Sprite. Always overwrites to ensure the Sprite has the latest version.
- **Sprite is a cache:** if destroyed (30-day cleanup), rebuilt from Supabase Storage on next job.

```
Supabase Storage (source of truth)
    ↓ sync on each job (always overwrite)
Sprite /skills/{slug}/ (runtime cache)
    ↓ read by Claude Code during execution
Execution
```

Skills are NOT created or edited inside the Sprite. All writes go through the main agent → Supabase Storage → synced to Sprite on next job.

#### 5.6 Property-Showcase Data Flow (Replacing Structured propertyData)

Today the `publish_artifact` tool handler receives structured `propertyData` and `photoUrls` as tool parameters, then stages them into the Sprite via `writePropertyDataToSprite()` and `downloadPhotosToSprite()`.

After: Gemini gathers CRM/property data via structured tools first (same as today), then passes it as part of the `task` string to `execute_in_sandbox`. Photo URLs are passed directly in `inputFiles` — the tool handler downloads them with SSRF protection (reuses `fetchSafeExternalResource()`) and writes them to the job-scoped input directory. No binary upload tool needed.

The `property-showcase` outer workflow skill instructs Gemini:

```
1. Gather property data via search_properties / get_property
2. Call execute_in_sandbox({
     skills: ["publish_website", "frontend-design"],
     task: "Build a property showcase for [property]. Details: [serialized data]",
     inputFiles: ["https://...photo-1.jpg", "https://...photo-2.jpg"]
   })
```

The tool handler sniffs each inputFile — URLs are fetched, storage paths are downloaded. Both end up in `/workspace/jobs/{jobId}/input/`.

**Follow-up edits (replacing the old thread-Sprite-preview model):**

Today: one thread owns one Sprite, `/workspace/app` persists across messages, and the preview URL is tied to that thread's Sprite. Follow-up edits ("change the hero photo") modify the existing app in-place.

After: the here.now slug IS the identity. First run publishes to `neobot.here.now/{slug}`. Follow-up edit: Gemini sees the existing live URL in chat history and includes it in the task string: `"Update the showcase at neobot.here.now/123-main-st — change the hero photo."` Claude Code inside the Sprite rebuilds the page (it's a single HTML file, not a complex app) and publishes to the same slug. here.now PUT overwrites the existing site.

No `/workspace/app` persistence needed. No thread-Sprite coupling. The URL in chat history is the identity. The `publish_website` skill instructions say: `"If updating an existing site, use the same slug to overwrite."`

### 6. General Prompt Builder

Replaces `buildAnalysisPrompt()` and `buildArtifactPrompt()` with one generic builder:

```typescript
function buildSandboxPrompt({
  task,
  skillSlugs,
  inputFilenames,
  outputDir,
}: {
  task: string;
  skillSlugs: string[];   // first is primary, rest are companions
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
  );

  return lines.join("\n");
}
```

Note: input files are in the job-scoped directory (`/workspace/jobs/{jobId}/input/`), not a shared `/workspace/input/`.

**Ambiguity handling:** The prompt includes two rules to mitigate the "game of telephone" between the main agent (Gemini) and the sandbox agent (Claude Code):

```
If the task is ambiguous about key decisions (which data to include,
what format to use, what assumptions to make), state your assumptions
clearly in summary.txt and produce your best-guess output.

If you are uncertain about something critical that would make the
output useless if wrong, write your question to summary.txt instead
of producing output. Start the summary with "QUESTION:" so the
delivery path can route it back to the user.
```

The delivery path checks for this:

```typescript
if (summary.startsWith("QUESTION:")) {
  // Don't upload artifacts — there aren't any
  // Insert as a question message to the user
  // Mark job as "completed" (not failed — it did its job)
  // Main agent (Gemini) presents the question, gets the answer,
  // calls execute_in_sandbox again with the answer appended to
  // the task string. Same Sprite, same deps, fast turnaround.
}
```

This keeps the main agent as the conversational loop (it already has `ask_user_question`, conversation history, client context from SOUL.md/USER.md) and the sandbox as the execution engine. No pause/resume state machine. No new tools. ~5 lines of delivery code.

### 7. General Delivery Path

Replaces the branching `deliverResult()` that checked `job_type === "analyze"` vs `"artifact"`. One simple path:

1. Read `summary.txt` → chat message body (may contain live URLs produced by the skill)
2. List output dir via `sprite.execFile("ls", ["-1", outputDir])`, skip `stream.jsonl`, `.done`, `.error`, `summary.txt`, `input/`
3. Upload every remaining file to Supabase Storage → signed download links (content type inferred from extension via simple map)
4. Append download links to the summary in the chat message
5. Insert durable message into `conversation_messages` with `source: "background-job"` tag (existing pattern from PR 54a)
6. Best-effort `kickAgentRun()` so agent presents result in its voice (existing pattern)

No file extension routing. No special handling for HTML. If a skill needs to publish to here.now (or any external service), it does that inside the Sprite and writes the live URL into `summary.txt`. The delivery path just reads the summary and uploads files.

**Failure copy:** Replace hardcoded "Analysis failed..." messages in `sprite-jobs.ts` and `callback/route.ts` with generic "Sandbox job failed" copy.

**Backward compatibility for in-flight old jobs:** On deploy, there may be `"analyze"` or `"artifact"` jobs still running. The refactored `deliverResult()` checks `job.job_type`: if `"analyze"` or `"artifact"`, fall through to legacy delivery logic (read specific output file, upload with hardcoded content type). If `"sandbox"` (new), use generic glob. This compat path can be removed in a follow-up once all old jobs have drained (max a few hours).

Example chat messages:

PDF skill:
> Here's your market report for 123 Main St. I compared 5 comps within 500m.
>
> [Download report.pdf](signed-url)

Publish website skill:
> Built your property showcase for 123 Main St.
> Live at: https://neobot.here.now/showcase-123-main-st

This eliminates the entire dev server flow: no `ensureDevServerService()`, no `waitForPort()`, no `sprite.updateURLSettings()`. Publishing is a skill concern, not a delivery concern.

### 8. Publish Website Skill

here.now is a free static hosting API (permanent with API key, 3-step publish flow). Instead of special delivery path logic, this is just another sandbox skill:

```yaml
---
name: publish_website
description: "Build and publish a shareable web page. Use execute_in_sandbox when asked to create a showcase, landing page, or any web page to share."
---
```

The SKILL.md teaches Claude Code the full here.now publish flow (POST metadata → PUT files to presigned URLs → POST finalize). Claude Code builds the HTML, publishes it, writes the live URL to summary.txt. The `HERENOW_API_KEY` env var is passed through `buildClaudeEnv()`.

This makes publishing a skill that can be improved, customized, or replaced — not hardcoded infrastructure.

### 9. System Prompt & Context Assembly Update

Replace the current `SANDBOX_PROMPT` with:

```
You have access to a persistent sandbox computer via execute_in_sandbox.
The sandbox has Python and bash. Skills declare their own package
dependencies — packages are cached after first install.

Skills whose description says "execute_in_sandbox" are sandbox skills —
invoke execute_in_sandbox with that skill's slug(s) and a task description.

All other skills: read the SKILL.md via read_file and follow its
workflow using your structured tools (which may include calling
execute_in_sandbox as one step).

For routine CRM operations, memory, and messaging — use your structured tools.
```

**Context assembly changes required:**
- `formatAvailableSkills()` in `context.ts` currently emits `→ read_file(...)` hint for every skill. Change: sandbox skills (description contains `execute_in_sandbox`) should emit `→ execute_in_sandbox("slug")` hint instead. Other skills keep the `read_file` hint.
- `formatAvailableSkills()` should emit the skill slug explicitly in the catalog entry so the model can pass it to the tool.

### 10. Context Assembly Update

`context.ts` active job injection currently renders `"analyze job running..."` and tells the model not to start another sandbox job on "the same thread." This conflicts with client-scoped Sprites and queued jobs.

**Action:** Update to say `"A sandbox job is running on your workspace"` and explain queuing: `"You can queue another job — it will start when the current one finishes."` Remove thread-scoped restriction language. Update paired tests.

---

## Gap Analysis: Current Implementation → General Sandbox

Detailed inventory of what exists today and exactly what changes. Based on full codebase exploration of the PR 52/53/54/54a sandbox implementation.

### Gap 1: Tool Layer — Two Specialized Tools → One General Tool

**Current files:**
- `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` — hardcodes `ANALYST_SKILL_SLUG = "re-analyst"`, expects `task` + `files` input, calls spreadsheet-specific setup
- `src/lib/runner/tools/sandbox/publish-artifact.ts` — hardcodes `FRONTEND_SKILL_SLUG = "frontend-design"`, expects `task` + `propertyData` + `photos`, calls artifact-specific setup (property data injection, photo downloading, template writing)
- `src/lib/runner/tools/sandbox/index.ts` — barrel that creates both tools

**Action:** Delete both tool files. Create `execute-in-sandbox.ts` with generic `{ task, skill, inputFiles? }` schema. Domain-specific input handling (property data, photos) moves into skill instructions — the outer workflow SKILL.md tells Gemini how to serialize data, and the low-level SKILL.md tells Claude Code how to work with it.

### Gap 2: Prompt Builders — Two Specialized → One Generic

**Current files:**
- `src/lib/sandbox/run-claude-in-sprite.ts` → `buildAnalysisPrompt()` — hardcodes `/skills/xlsx/SKILL.md`, `result.xlsx`, `recalc.py` paths
- `src/lib/sandbox/artifact-prompt.ts` → `buildArtifactPrompt()` — hardcodes `/workspace/data/property.json`, `/template/`, `build.sh`, `output.html`, has complex `isFollowUp`/`shipIt` logic

**Action:** Delete `artifact-prompt.ts`. Replace `buildAnalysisPrompt()` with `buildSandboxPrompt()` in `run-claude-in-sprite.ts`. All domain logic (follow-up handling, build scripts, template copying) moves into skill SKILL.md instructions.

### Gap 3: Delivery Path — Type-Branched → Generic Glob

**Current:** `deliverResult()` in `sprite-jobs.ts` (lines ~167-215) branches on `job.job_type`:
- `"analyze"` → reads hardcoded `result.xlsx`, uploads as `artifacts/sandbox/result-{timestamp}.xlsx`
- `"artifact"` → calls `ensureDevServerService()`, manages Sprite URL with `updateURLSettings({ auth: "public" })`, reads `output.html`, uploads as `artifacts/sandbox/property-showcase-{timestamp}.html`

**Also:** Failure copy in `sprite-jobs.ts` and `callback/route.ts` hardcodes "Analysis failed..." messages.

**Action:** Replace with generic glob: list all files in output dir via `sprite.execFile("ls", ...)`, skip markers/logs/summary/input, upload everything to Supabase Storage with signed URLs (content type inferred from extension). No job type branching. No dev server management. Generic failure copy ("Sandbox job failed").

### Gap 4: Sprite Session Lookup — Per-Thread → Per-Client

**Current file:** `src/lib/sandbox/sprite-session.ts` — `getOrUpsertSpriteSession()` uses `(client_id, thread_id)` as the unique key.

**Action:** Change lookup to `client_id` only. Keep `thread_id` column for tracking but remove from unique constraint. Migration to update index. Dedupe existing rows: for each `client_id`, keep most recent `last_active_at`, destroy orphan Sprites, delete orphan rows.

### Gap 5: SpriteHandle Types — Three Definitions → One

**Current:** Three different `SpriteHandle` types defined in three files:
- `run-claude-in-sprite.ts` — minimal: `execFile`, `spawn`, `filesystem` (read/write)
- `artifact-runner.ts` — full: adds `listServices`, `createService`, `startService`, `updateURLSettings`, `url`
- `sprite-jobs.ts` — even more minimal: `execFile`, `filesystem` (read only)

**Action:** Unify into one `SpriteHandle` in `types.ts`. The general tool only needs `execFile`, `spawn`, `filesystem`. Service management methods (`createService`, `startService`, `listServices`, `updateURLSettings`) are deleted with the dev server flow.

### Gap 6: Dependency Bootstrap — Pre-Install → Deleted

**Current:** `ensureSpreadsheetDependencies()` in `run-claude-in-sprite.ts` — tool handler runs `pip3 install pandas openpyxl xlsxwriter matplotlib` and `apt-get install libreoffice-calc gcc` inside the Vercel Function's `maxDuration` budget, before Claude Code starts. Also `ensureArtifactDependencies()` in `artifact-runner.ts` installs Node.js and npm.

**Action:** Delete entirely. Each SKILL.md declares its own deps in a Setup section. Claude Code installs them inside the unbounded async job. Persistent Sprite caches them.

### Gap 7: Bundled Skill Files — Server Bundle → Supabase Storage

**Current:** `src/lib/sandbox/skills/xlsx/` contains `SKILL.md`, `scripts/recalc.py`, `scripts/office/soffice.py` bundled in the server build. Loaded by `loadBundledXlsxSkillFiles()` and `getBundledXlsxSkillFiles()` in `run-claude-in-sprite.ts`.

**Action:** Delete `src/lib/sandbox/skills/xlsx/` directory. The replacement `excel_editing` skill content lives in `skill-templates.ts` and gets seeded into Supabase Storage by `bootstrapSkills()`. Synced to Sprite per-job like any other skill.

### Gap 8: Template Files — React App Template → Deleted

**Current:** `src/lib/sandbox/templates/property-showcase/` contains 18 React component files (`App.tsx`, `Hero.tsx`, `PhotoGallery.tsx`, etc.) plus `build.sh`, `vite.config.ts`, `package.json`. Loaded by `getPropertyShowcaseTemplateFiles()` in `template-files.ts` and written to `/template/` on the Sprite by the artifact tool handler.

**Action:** Delete entire `templates/property-showcase/` directory and `template-files.ts`. The `publish_website` skill instructions tell Claude Code how to build pages. If a template is needed, it lives in the skill's `references/` directory in Supabase Storage, not in the server bundle.

### Gap 9: Artifact Runner — Full File → Deleted

**Current:** `src/lib/sandbox/artifact-runner.ts` — 280+ lines containing:
- `SpriteHandle` interface (full, with service management)
- `writePropertyDataToSprite()` — writes `property.json` to `/workspace/data/`
- `downloadPhotosToSprite()` — fetches photos via `fetchSafeExternalResource()`, writes to `/workspace/photos/`
- `writeTemplateToSprite()` — writes 18 template files to `/template/`
- `writeSkillFilesToSprite()` — writes skill files to `/skills/`
- `ensureDevServerService()` — manages `dev-server` Sprite service on port 8080
- `launchArtifactBackgroundJob()` — async launch for artifact jobs
- `readBuiltHtml()` — reads `/tmp/output.html`
- `ensureArtifactDependencies()` — installs Node.js and npm

**Action:** Delete entire file. `writeSkillFilesToSprite()` is equivalent to the existing `writeSkillFiles()` in `run-claude-in-sprite.ts` — no need to port. Everything else is deleted.

### Gap 10: Job Queue — Reject → Auto-Queue

**Current:** `analyze-spreadsheet.ts` and `publish-artifact.ts` both check `findRunningJob()` and return `{ success: false, error: "A sandbox job is already running" }` if busy.

**Action:** Insert as `status: "queued"` instead. Delivery path chains to next queued job after completing the current one via CAS claim (`queued → starting`). Insert notification message with `source: "background-job"` tag for Realtime subscription compatibility. Cleanup cron handles stranded `queued` rows (>1 hour, no running sibling).

### Gap 11: Skill Templates — 13 Skills → 20 Skills (Bodies + Descriptions)

**Current:** `skill-templates.ts` defines 13 `DEFAULT_SKILL_SLUGS`. Three are sandbox-adjacent: `property-showcase`, `re-analyst`, `frontend-design`. None include `execute_in_sandbox` in their descriptions. The bodies of `deal-comparison`, `property-showcase`, and `market-report` reference the old `analyze_spreadsheet`/`publish_artifact` tools with obsolete parameter shapes.

**Action:** Add 7 new sandbox skill content strings: `pdf_creation`, `excel_editing`, `docx_editing`, `pptx_editing`, `pdf_form_filling`, `pdf_signing`, `publish_website`. Full body rewrites for existing sandbox-adjacent skills to use the two-tier model (outer workflow → `execute_in_sandbox` with low-level skill slug). Update descriptions accordingly.

### Gap 12: Claude Environment — Add here.now API Key

**Current:** `claude-env.ts` → `buildSandboxClaudeEnv()` passes `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` + `SANDBOX_MODEL_ID`.

**Action:** Also pass `HERENOW_API_KEY` for the `publish_website` skill to use inside the Sprite.

### Gap 13: External URL Safety — Keep

**Current:** `external-url.ts` → `fetchSafeExternalResource()` with SSRF protection. Used by `downloadPhotosToSprite()`.

**Action:** Keep. The general tool handler downloads input files from Supabase Storage (no SSRF risk for storage paths), but `fetchSafeExternalResource()` remains useful for any future external URL handling.

### Gap 14: Skill Loader — Keep (With Limitations Noted)

**Current:** `skill-loader.ts` → `loadSkillFilesForSandbox()` reads a skill's SKILL.md + references from Supabase Storage.

**Known limitations:** Only recurses one directory level, forces everything through UTF-8 text, and the write path (`writeSkillFiles()`) overwrites files but never removes deleted ones.

**Action:** Keep and reuse. One-level recursion covers `SKILL.md` + `references/*.md` which is sufficient for v1. Binary assets, deeper trees, and stale-file cleanup are follow-up concerns.

### Gap 15: Sync Path (runClaudeInSprite) — Delete

**Current:** `runClaudeInSprite()` in `run-claude-in-sprite.ts` is the old blocking synchronous path. It directly calls `buildAnalysisPrompt()`, `ensureSpreadsheetDependencies()`, `ensureBundledXlsxSkillFiles()`, and `clearSpreadsheetOutputs()` — all of which are being deleted.

**Action:** Delete `runClaudeInSprite()` and its paired tests in `run-claude-in-sprite.test.ts`. The async path via `launchBackgroundJob()` is the only execution path.

### Gap 16: Context Assembly — Active Job Injection

**Current:** `context.ts` (~line 468) renders `"analyze job running..."` copy, references `job_type`, and tells the model not to start another sandbox job on "the same thread."

**Action:** Update to generic copy: `"A sandbox job is running on your workspace. You can queue another — it will start when the current one finishes."` Remove thread-scoped restriction. Update paired tests in `context.test.ts`.

### Gap 17: Test Coverage — Full Fallout List

**Current:** 162 tests across 16+ files. Many are tightly coupled to the two-tool model.

**Tests to delete (files deleted):**
- `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`
- `src/lib/sandbox/__tests__/artifact-prompt.test.ts`
- `src/lib/sandbox/__tests__/artifact-runner.test.ts`

**Tests to rewrite (files modified):**
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` — remove sync path tests, update prompt builder tests
- `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts` — rewrite for glob-based delivery
- `src/lib/sandbox/__tests__/sprite-session.test.ts` — update for client-only lookup
- `src/lib/sandbox/__tests__/cleanup-sprites.test.ts` — update 7→30 day assertions
- `src/lib/sandbox/__tests__/async-sandbox-integration.test.ts` — adapt for general tool
- `src/lib/runner/__tests__/context.test.ts` — update active job injection assertions
- `src/lib/runner/__tests__/tool-registry.test.ts` — update registered tool names
- `src/lib/ai/__tests__/system-prompt.test.ts` — update SANDBOX_PROMPT assertions
- `src/lib/runner/skills/__tests__/skill-templates.test.ts` — update for new skill count + bodies
- `src/lib/runner/skills/__tests__/sandbox-skills.test.ts` — update for new skill names
- `src/lib/runner/skills/__tests__/skill-integration.test.ts` — update for new skills
- `app/api/cron/scan/__tests__/route.test.ts` — update if scan logic references job_type

**Tests to write (new files):**
- `src/lib/runner/tools/sandbox/__tests__/execute-in-sandbox.test.ts` — generic params, queue behavior, input file handling
- `src/lib/sandbox/__tests__/sandbox-delivery.test.ts` — glob-based delivery, content type inference, multi-file upload

**Tests to keep (unchanged):**
- `src/lib/sandbox/__tests__/sandbox-paths.test.ts`
- `src/lib/sandbox/__tests__/sprite-jobs.test.ts` (core state machine)
- `src/lib/sandbox/__tests__/sprites-client.test.ts`
- `src/lib/sandbox/__tests__/external-url.test.ts`
- `src/lib/sandbox/__tests__/env.test.ts`
- `src/lib/sandbox/__tests__/skill-loader.test.ts`

---

## What Changes, What Gets Deleted, What Stays

### New Files

| File | What |
|---|---|
| `src/lib/runner/tools/sandbox/execute-in-sandbox.ts` | The one general tool |
| `src/lib/sandbox/sandbox-delivery.ts` | Glob output dir, upload all artifacts to Supabase Storage |

### Modified Files

| File | Change | Gap |
|---|---|---|
| `src/lib/sandbox/types.ts` | Unified `SpriteHandle` (minimal: `execFile`, `spawn`, `filesystem`) | Gap 5 |
| `src/lib/sandbox/run-claude-in-sprite.ts` | Delete `runClaudeInSprite()`, `buildAnalysisPrompt()`, `ensureSpreadsheetDependencies()`, `ensureBundledXlsxSkillFiles()`, `clearSpreadsheetOutputs()`, `getBundledXlsxSkillFiles()`, `loadBundledXlsxSkillFiles()`. Add `buildSandboxPrompt()`. Keep `launchBackgroundJob()`, `buildClaudeCliArgs()`, `buildClaudeEnv()`, `writeSkillFiles()`. | Gaps 2, 6, 7, 15 |
| `src/lib/sandbox/sprite-jobs.ts` | Refactor `deliverResult()` to generic glob-based delivery. Add queued job chaining with CAS + notification message. Remove `job_type` branching. Generic failure copy. Update cleanup constant 7→30 days. | Gaps 3, 10 |
| `src/lib/sandbox/sprite-session.ts` | Change `getOrUpsertSpriteSession()` lookup from `(client_id, thread_id)` to `client_id` only | Gap 4 |
| `src/lib/sandbox/claude-env.ts` | Add `HERENOW_API_KEY` to env passthrough | Gap 12 |
| `src/lib/runner/tools/sandbox/index.ts` | Export `execute_in_sandbox` only | Gap 1 |
| `src/lib/runner/tool-registry.ts` | Register `execute_in_sandbox`, remove old two tools | Gap 1 |
| `src/lib/runner/skills/skill-templates.ts` | Add 7 new sandbox skill content strings. Full body rewrites for existing sandbox skills. Update descriptions with `execute_in_sandbox` trigger where appropriate. | Gap 11 |
| `src/lib/runner/skills/skill-bootstrap.ts` | Seeds new skills (more slugs). Add `migrateSkillBodies()` to force-overwrite 5 changed skills for existing clients. | Gap 11 |
| `src/lib/ai/system-prompt.ts` | Replace `SANDBOX_PROMPT` with general version (two-tier routing) | — |
| `src/lib/runner/context.ts` | Update active job injection: generic copy, remove thread-scoped restriction, explain queuing. Update `formatAvailableSkills()`: sandbox skills emit `execute_in_sandbox("slug")` hint instead of `read_file(...)`. Emit slug explicitly in catalog. | Gap 16 |
| `app/api/sandbox/callback/route.ts` | Generic failure copy | Gap 3 |
| `sprite_sessions` migration (Phase A) | Dedupe idle orphan rows per `client_id`. Do NOT add unique index yet. | Gap 4 |
| `sprite_sessions` migration (Phase B, follow-up) | Add `client_id`-only unique index after all old jobs drain. | Gap 4 |
| `app/api/cron/scan/route.ts` | Handles stranded queued rows (>1hr, no running sibling). Update any job_type references. | Gap 10, 16 |
| `app/api/cron/cleanup-sprites/route.ts` | Update if cleanup constant is referenced here (may just call sprite-jobs.ts) | Gap 2 |
| `sprite_jobs` migration | Update unique index to exempt `queued` rows. Add stranded-queue cleanup. Change cleanup sweep 7→30 days. | Gap 10 |

### Deleted Files

| File | Why | Gap |
|---|---|---|
| `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` | Replaced by general tool | Gap 1 |
| `src/lib/runner/tools/sandbox/publish-artifact.ts` | Replaced by general tool | Gap 1 |
| `src/lib/sandbox/artifact-runner.ts` | Dev server flow, property data, photos, templates — all deleted | Gap 9 |
| `src/lib/sandbox/artifact-prompt.ts` | Replaced by general prompt builder | Gap 2 |
| `src/lib/sandbox/templates/property-showcase/` | 18-file React template — skill handles page generation | Gap 8 |
| `src/lib/sandbox/templates/property-showcase/template-files.ts` | Template loader no longer needed | Gap 8 |
| `src/lib/sandbox/skills/xlsx/` | `SKILL.md`, `recalc.py`, `soffice.py` — replaced by `excel_editing` in Supabase Storage | Gap 7 |
| `src/lib/runner/tools/sandbox/__tests__/analyze-spreadsheet.test.ts` | Tests for deleted tool | Gap 17 |
| `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts` | Tests for deleted tool | Gap 17 |
| `src/lib/sandbox/__tests__/artifact-prompt.test.ts` | Tests for deleted prompt builder | Gap 17 |
| `src/lib/sandbox/__tests__/artifact-runner.test.ts` | Tests for deleted artifact runner | Gap 17 |

### Unchanged

- `sprite-jobs.ts` core state machine (HMAC, CAS claiming, webhook auth, cron fallback, progress parsing) — all from PR 54a
- `sandbox-paths.ts` — job-scoped output dirs
- `sprites-client.ts` — Sprite lifecycle (`getSpritesClient`, `getOrCreateSprite`)
- `external-url.ts` — SSRF protection (Gap 13: kept)
- `skill-loader.ts` — loads skills from Supabase Storage (Gap 14: reused for `syncSkillToSprite`)
- `env.ts` — `isSandboxConfigured()`, `getSpritesToken()`
- Frontend Realtime subscription in `chat-panel.tsx`
- Webhook callback route structure (route unchanged, copy updated via sprite-jobs.ts)
- All structured tools (CRM, memory, messaging, triggers)
- `bootstrapSkills()` mechanism — just gets more slugs

---

## Decisions

1. **One tool replaces two.** `execute_in_sandbox` is skill-driven. The skill slug tells it what to do.
2. **Per-client persistent Sprite.** One Sprite per client, reused across all threads. 30-day cleanup.
3. **Auto-queue for concurrent jobs.** Second job inserts as `queued`, auto-starts when first completes via CAS. Stranded queued rows cleaned up by cron after 1 hour.
4. **No pre-install.** Claude Code installs deps per-skill inside the async job. SKILL.md declares deps in a Setup section. Persistent Sprite caches them.
5. **Two-tier skill model with companions.** Primary sandbox skills (description says `execute_in_sandbox`) → agent calls tool directly. Companion sandbox skills (domain context) → synced alongside primary via `skills` array. Outer workflow skills → agent reads SKILL.md, may call `execute_in_sandbox` with primary + companions as one step.
6. **Supabase Storage is the source of truth.** Skills synced to Sprite on every job (always overwrite). Sprite is a cache.
7. **General delivery path.** Glob output dir via `sprite.execFile("ls", ...)`, upload everything to Supabase Storage. Summary may contain live URLs produced by the skill. Content type inferred from extension.
8. **Publishing is a skill, not infrastructure.** here.now integration lives in the `publish_website` SKILL.md, not in the delivery path. Claude Code handles the full publish flow inside the Sprite. Eliminates `ensureDevServerService`, `waitForPort`, `updateURLSettings`.
9. **Bundled skills seeded via existing `bootstrapSkills()`.** Content in `skill-templates.ts`, uploaded to Supabase Storage on onboarding. Same mechanism as existing skills.
10. **General prompt builder.** One `buildSandboxPrompt()` replaces specialized prompt builders. Skill's SKILL.md does the domain teaching.
11. **Job-scoped input dirs.** Each job gets `/workspace/jobs/{jobId}/input/` — no shared input directory. Prevents race conditions between concurrent/queued jobs.
12. **inputFiles accept both storage paths and URLs.** Tool handler sniffs format: URLs fetched via `fetchSafeExternalResource()`, storage paths via `agentFiles.download()`. Enables photos (URLs) and uploaded files (storage paths) in the same call.
13. **Backward-compatible delivery.** Old `"analyze"`/`"artifact"` jobs fall through to legacy delivery logic. New `"sandbox"` jobs use generic glob. Compat path removed in follow-up.
14. **Force-migrate existing skill bodies.** `migrateSkillBodies()` overwrites the 5 skills whose bodies changed for all existing clients. `bootstrapSkills()` only handles new slugs.
15. **QUESTION: prefix for ambiguity handling.** If Claude Code is uncertain about something critical, it writes `QUESTION: ...` to summary.txt instead of producing output. Delivery path detects this, inserts the question as a chat message. Main agent (Gemini) presents it to the user, gets an answer, calls `execute_in_sandbox` again with the answer. No pause/resume state machine — the main agent IS the conversational loop.

## Unresolved Questions

1. **Cleanup sweep storage** — 30 days of accumulated packages, skills, and output files on a persistent Sprite. Is disk space a concern on Fly Sprites?

2. **Skill creation meta-skill** — Viktor's `skill_creation` skill teaches the agent how to write new skills with correct frontmatter and sandbox trigger phrase. Follow-up PR.
