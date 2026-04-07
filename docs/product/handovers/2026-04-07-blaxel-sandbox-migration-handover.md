# Blaxel Sandbox Migration — Handover

**Date:** 2026-04-07
**PR:** 71
**Status:** Ready for implementation

---

## What You're Building

Replace our sandbox (code execution VMs) from Vercel Sandbox to Blaxel. FUSE-mount Supabase Storage into the sandbox so the agent can read/write files directly. Delete ~1,000 lines of preload/sync code. Add block storage for tool results. Add `agent://` download links.

The user experience doesn't change. The agent still has a `bash` tool. Chat looks the same. This is a plumbing change that makes file access faster and more reliable.

## Why

Three problems users hit regularly:
1. Every bash call downloads ALL files first (~1-2s latency)
2. Files from Google Drive downloads are invisible inside a running sandbox
3. ~1,000 lines of preload/sync/hash code compensating for lack of a shared filesystem

The FUSE mount solves all three. One store (Supabase), two access paths (REST API + S3/FUSE).

## Read These In Order

### 1. Requirements Doc (source of truth)

```
docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md
```

This is the most important document. 40 requirements, 11 drift items, 2 completed spikes, 3 adversarial reviews, 11 Tasklet dev questions answered. Every design decision and trade-off is documented here with rationale. **Read the full thing before writing code.**

### 2. Implementation Plan

```
docs/product/plans/2026-04-07-001-feat-blaxel-sandbox-migration-plan.md
```

5 phases, architecture diagrams, acceptance criteria, risk analysis. Links back to the requirements doc for every decision.

### 3. TDD Tasklist (your execution guide)

```
docs/product/tasks/2026-04-07-blaxel-sandbox-migration-tasklist.md
```

11 tasks with exact file paths, test code, commands, and commit messages. Follow this step by step. TDD: write the test, watch it fail, write minimal code, watch it pass, commit.

### 4. Tasklet Reference Architecture

We reverse-engineered Tasklet's production sandbox architecture. They're the gold standard — our design replicates theirs.

```
roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md
roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/03-run_command.md
roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/04-read_file.md
roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/05-write_file.md
roadmap docs/Sunder - Source of Truth/references/sandboxes/tasklet-sandbox-architecture-trace.md
roadmap docs/Sunder - Source of Truth/references/sandboxes/tasklet-fuse-mount-investigation.md
```

### 5. Security Review

```
docs/product/reviews/2026-04-06-sandbox-tenant-isolation-review.md
```

Adversarial tenant isolation tests with seeded Alice/Bob/Carol accounts. Confirmed RLS works via JWT session tokens. Confirmed forged `service_role` JWT is catastrophic — which is why R17 says MUST use `auth.admin.generateLink()`, never sign JWTs directly.

### 6. Current Code You're Replacing

```
src/lib/runner/tools/sandbox/                  — 6 files, ~714 lines (the sandbox module)
src/lib/runner/run-agent.ts:317-350            — where sandbox wires into the runner
src/lib/storage/tool-blocks.ts                 — saveToolcallBlock() (already exists, you add runId)
src/lib/ai/system-prompt.ts:88-147             — SANDBOX_PROMPT (you rewrite this)
src/lib/storage/agent-paths.ts                 — /agent/ ↔ storage path translation
src/lib/storage/agent-files.ts:69-91           — assertWritable() read-only enforcement
```

## Key Decisions (don't re-open these)

| Decision | What we chose | Why |
|---|---|---|
| Sandbox provider | Blaxel (not Vercel) | FUSE support, Unikraft microVMs, proven by Tasklet |
| FUSE client | rclone (not s3fs) | Handles JWT session tokens, VFS caching, proven in Spike 2 |
| Backing store | Supabase Storage via S3 protocol (not Blaxel Drive) | Keep all Supabase integrations. One store, two access paths. |
| Auth model | JWT session token via `auth.admin.generateLink()` | RLS enforcement at S3 layer. Never sign JWTs directly. |
| Block storage | Synchronous write, fail-open | ~150ms per tool call, trivially correct. If write fails, return result without toolCallId. |
| Download links | `agent://` custom protocol (not `/agent/` path detection) | Avoids false positives in code examples and explanations |
| Truncation | NOT implementing (Option A) | Blocks are passive infra for now. Truncation is a future project. |
| Read-only paths | Application-level enforcement (not filesystem-level) | Single rw FUSE mount. `assertWritable()` already handles this. |
| Artifact sync | Deleted entirely | Model outputs download links. No scanning, no hashing. |

## Environment Setup

Blaxel CLI is installed and logged in (`bl login sudner`). `@blaxel/core` is in package.json. Supabase S3 access keys have been generated (rotate after implementation).

```bash
bl version          # Should show 0.1.88+
bl get sandboxes    # Should show empty table (logged in)
npm ls @blaxel/core # Should show 0.2.78
```

## Verified rclone Mount Command

This exact command was tested in Spike 2 and works:

```bash
rclone mount supabase:agent-files/{clientId}/ /agent \
  --s3-list-version 2 \
  --vfs-cache-mode writes \
  --vfs-write-back 0s \
  --allow-other \
  --no-modtime \
  --dir-cache-time 0s
```

rclone config for Supabase with JWT session token:

```ini
[supabase]
type = s3
provider = Other
access_key_id = {project_ref}
secret_access_key = {anon_key}
session_token = {jwt_access_token}
endpoint = https://{project_ref}.supabase.co/storage/v1/s3
force_path_style = true
```

## Gotchas

1. **rclone `--daemon` mode fails in Blaxel.** Use `rclone mount ... &` (backgrounded) instead. Confirmed in Spike 2.
2. **rclone config path is `/blaxel/.config/`** not `/root/.config/`. Set `--config` flag explicitly or use `RCLONE_CONFIG` env var.
3. **rclone needs `fuse3` package** (not just `fuse`). Install via `apk add fuse3`.
4. **`--vfs-write-back 0s` is critical.** Default `5s` delays writes. Set to `0s` for immediate persistence.
5. **s3fs does NOT work with JWT session tokens.** Only rclone handles them correctly. s3fs is a fallback for project-level S3 keys only.
6. **Block files use `result.json` (with extension).** Tasklet uses `result` (no extension). This is intentional drift D5.
7. **Blaxel sandbox idle timeout is ~10 minutes.** Sandbox dies, gets re-provisioned transparently. `/agent/` data survives (cloud-backed). `/tmp/` is lost.
8. **Backgrounded children survive in Blaxel.** Standard Linux reparenting to PID 1 applies. No custom reaper.
9. **Make rclone PID 1 via `exec` in entrypoint.** If the FUSE mount dies, the VM dies → clean re-provision. sandbox-api is backgrounded.
10. **Signed URLs must NEVER appear in sandbox-readable paths.** Generate them server-side at click time, not at tool-call time. See R18.

## Running the Work

Open a new Claude Code session and run:

```
/execute docs/product/tasks/2026-04-07-blaxel-sandbox-migration-tasklist.md
```

Or work through the tasks manually, committing after each one. The tasklist has exact file paths, test code, and commands for every step.
