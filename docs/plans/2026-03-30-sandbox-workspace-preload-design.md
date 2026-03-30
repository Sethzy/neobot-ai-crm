# PR 64: Sandbox Workspace Preload

**Date:** 2026-03-30
**Phase:** 7 (Documents + Connections Polish)
**Depends on:** PR 63 (unified agent filesystem)
**Status:** Design

## Problem

The sandbox can only access files that are preloaded at boot time. Currently, only current-message attachments and skill files are preloaded. Past uploads, agent-created files in `home/`, and memory files are invisible to the sandbox.

This means: user uploads a CSV last week, asks "run that through your Python analysis" today — the agent can `read_file` it (Supabase Storage) but can't `bash("python3 analyze.py ...")` it (not in sandbox).

## Context

**Vercel pattern (reference repos):** Gather all data upfront → `createBashTool({ files })` → agent processes. No mid-session file injection.

**Fintool pattern:** S3-backed mounts. All user files (`/private/{user}/uploads/`, `/private/{user}/artifacts/`) mounted directly into sandbox. Everything accessible at all times.

**Tasklet pattern:** FUSE-mounted cloud storage. `/agent/` path works identically inside and outside sandbox.

All three share the same principle: **the sandbox sees the full workspace.** The difference is implementation — real mounts (Fintool, Tasklet) vs eager preload (Vercel) vs lazy on-demand (none of them do this).

Our approach: **eager preload at boot.** Poor man's mount. Download the full agent workspace into the sandbox when it boots. Same result as Fintool/Tasklet mounts, with an upfront latency cost instead of per-access latency.

## Solution

Expand `buildPreloadFiles()` to download `uploads/` and `home/` from Supabase Storage into the sandbox alongside existing skill files and current-message attachments.

### Sandbox layout after PR 64

```
/workspace/
├── input/                    # Current message attachments + context.json (existing)
├── skills/                   # Skill files (existing)
├── agent/
│   ├── uploads/              # All user uploads (NEW)
│   │   ├── 1711792800-listing-123-main-st.pdf
│   │   └── 1711793000-deals-q1.xlsx
│   └── home/                 # All agent-created files (NEW)
│       ├── deal-analysis.csv
│       ├── meeting-notes-john.md
│       └── q1-report.pdf
└── (scratch space)           # Agent's working area, not synced
```

### Path consistency

The agent sees `/agent/uploads/` and `/agent/home/` via `read_file` (Supabase Storage). Inside the sandbox, the same files are at `/workspace/agent/uploads/` and `/workspace/agent/home/`. The `/workspace/` prefix is a sandbox implementation detail — the system prompt teaches both paths.

## Implementation

### 1. Expand buildPreloadFiles()

**File:** `src/lib/runner/tools/sandbox/build-preload-files.ts`

Add two new download sections after skill files and before current-message attachments:

```typescript
// 2. Download all files from uploads/
const { data: uploadEntries } = await bucket.list(`${clientId}/uploads`);
if (uploadEntries) {
  const uploadFiles = await Promise.all(
    uploadEntries
      .filter((e) => e.id !== null) // files only, not directories
      .map(async (entry) => {
        const { data } = await bucket.download(`${clientId}/uploads/${entry.name}`);
        if (!data) return null;
        const buffer = Buffer.from(await data.arrayBuffer());
        return { path: `agent/uploads/${entry.name}`, content: buffer };
      })
  );
  files.push(...uploadFiles.filter(Boolean));
}

// 3. Download all files from home/
const { data: homeEntries } = await bucket.list(`${clientId}/home`);
if (homeEntries) {
  const homeFiles = await Promise.all(
    homeEntries
      .filter((e) => e.id !== null)
      .map(async (entry) => {
        const { data } = await bucket.download(`${clientId}/home/${entry.name}`);
        if (!data) return null;
        const buffer = Buffer.from(await data.arrayBuffer());
        return { path: `agent/home/${entry.name}`, content: buffer };
      })
  );
  files.push(...homeFiles.filter(Boolean));
}
```

Downloads are parallelized via `Promise.all()` — same pattern as skill directory downloads.

### 1b. Remove redundant current-message attachment preload

**File:** `src/lib/runner/tools/sandbox/build-preload-files.ts`

Delete the attachment download loop (existing section 2, lines 101-131 in current code). Current-message uploads are already in `agent-files/{clientId}/uploads/` (PR 63) and get preloaded via the new uploads/ download above. The only thing that stays in `/workspace/input/` is `context.json` (tool results for sandbox scripts), which is owned by `createLazyBashTool`, not `buildPreloadFiles`.

Also remove the `fileParts` parameter from `BuildPreloadFilesOptions` — no longer needed.

### 2. Update sandbox instructions

**File:** `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

Update `extraInstructions` and tool description:

```
Agent workspace is preloaded at agent/uploads/ and agent/home/.
User uploads are at agent/uploads/ (all uploads, including current message).
Skill references at skills/.
Do all scratch work in /tmp/. To persist a file, copy the final result to /workspace/agent/home/ with a descriptive name. Only files in /workspace/agent/home/ are saved.
```

### 3. Create agent/home/ directory at preload

Ensure `/workspace/agent/home/` exists even when empty so the agent can write to it without creating the directory first. Add an empty marker or mkdir in the preload step.

### 4. Export getSandbox getter from createLazyBashTool

**File:** `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

Add `getSandbox` to the returned object so PR 65's Composio bridge can push files into an active sandbox:

```typescript
return {
  tool: bashTool,
  cleanup,
  hasInitialized: () => initialized,
  getSandbox: () => sandbox,  // NEW — returns live sandbox or null if not yet booted
};
```

Update `LazyBashToolResult` interface to include `getSandbox: () => Sandbox | null`.

### 5. Cap file tree in extraInstructions

**File:** `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

The current `generateFileTree()` lists every preloaded filename in `extraInstructions`, which gets injected into the bash tool description. With 50+ files, this adds significant token cost to every bash call.

Cap to directory summaries instead of full file listings:

```
Agent workspace preloaded:
  agent/uploads/ (15 files)
  agent/home/ (8 files)
  skills/ (3 directories)
  input/context.json

Use `ls` to discover individual files.
```

This keeps the prompt compact regardless of file count. The agent uses `ls /workspace/agent/uploads/` inside bash to discover individual files.

## Performance

**Rough math for a typical client (month 1-3):**
- 10-15 uploads, average 500KB = ~6MB
- 3-5 home files, average 200KB = ~1MB
- Total: ~7MB
- Supabase → Vercel network: ~50-100MB/s
- Parallel download: ~1s
- `sandbox.writeFiles()` in one batch: ~0.5s
- **Total added latency: ~1.5-2s on first bash call**

The sandbox already takes 1-2s to create from snapshot. Users won't notice an extra 1-2s on the lazy boot.

**Scaling concern:** A client with 200 files / 100MB would add ~5-10s. Not a launch concern. If it becomes an issue, optimize with:
- Lazy loading (download on first access, not at boot) — requires sandbox-level file interception
- File size cap on preload (skip files >5MB, agent uses `load_to_sandbox` for those)
- LRU-based preload (only recent N files)

## Known Limitation

**Files arriving after sandbox boot are not in the sandbox.** If the agent is already in a bash session and pulls a new file via a connection tool, that file lands in Supabase Storage but not in the running sandbox.

This matches the Vercel pattern — gather first, preload, process. The agent naturally works this way. For the rare iterative case (need a new file mid-sandbox), workarounds exist:
- Agent calls connection tool → returns signed URL → `bash("curl -o /tmp/file.xlsx 'url'")`
- Future: `load_to_sandbox` on-demand tool
- Future: pre-bash sync (check for new files before each bash call)

Not a launch blocker. Revisit if users hit this pattern.

## Testing

- Upload file in conversation A → start new conversation B → agent calls bash → verify file is at `/workspace/agent/uploads/`
- Agent writes file to `/agent/home/` via `write_file` → later conversation → agent calls bash → verify file is at `/workspace/agent/home/`
- Agent runs `ls /workspace/agent/uploads/` in bash → sees all past uploads
- Agent runs `python3 script.py /workspace/agent/uploads/old-deals.xlsx` → processes past upload successfully
- Agent saves result to `/workspace/agent/home/analysis.csv` → sync picks it up → persisted to storage
- Performance: measure sandbox boot time with 0, 10, 50 files preloaded

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | Eager preload at boot | Matches Vercel pattern. Simpler than real mounts. All files local = fast reads. |
| Preload scope | `uploads/` + `home/` | These are the two directories users interact with. Memory/subagents/toolcalls not needed in sandbox. |
| Parallelization | `Promise.all()` per directory | Already proven pattern for skill downloads. |
| No new tools | Correct | Preload handles it. No `load_to_sandbox` needed for v1. |
| Mid-run files | Known limitation, accepted | Vercel pattern = gather first, process second. Edge case with workarounds. |
