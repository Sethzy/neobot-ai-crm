---
date: 2026-04-04
topic: blaxel-sandbox-migration
---

# Blaxel Sandbox Migration — Replicating Tasklet's Architecture with Supabase Storage

## TL;DR

Move sandbox compute from Vercel Sandbox to Blaxel. FUSE-mount Supabase Storage (via its S3 protocol) into the sandbox at `/agent/`. Implement block storage so every tool result is saved to a file the sandbox can read via FUSE — replacing context.json entirely. Drop `bash-tool`. One store, two access paths. Delete preload/sync/context.json pipeline. Zero drift from Tasklet's proven production architecture where possible; all drift intentional and documented.

---

## 1. Reference Architecture: Tasklet (Production, Verified)

Everything below is verified against Tasklet's **verbatim v2 system prompt and tool definitions** captured in this repo, plus a **live execution trace** confirming the exact data flow.

### Source Documents

| Document | Path | What it proves |
|---|---|---|
| V2 system prompt (verbatim) | `roadmap docs/.../tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` | Filesystem layout, sandbox rules, tool routing, `<blocks>`, `<context-management>` |
| `run_command` tool def | `roadmap docs/.../tasklet tools/built-in/v2/03-run_command.md` | Only tool that boots a sandbox |
| `read_file` tool def | `roadmap docs/.../tasklet tools/built-in/v2/04-read_file.md` | Platform-server file I/O, never touches sandbox |
| `write_file` tool def | `roadmap docs/.../tasklet tools/built-in/v2/05-write_file.md` | Platform-server file I/O, never touches sandbox |
| FUSE mount investigation | `roadmap docs/.../sandboxes/tasklet-fuse-mount-investigation.md` | AvfsFuse, latency benchmarks, single-store proof |
| Sandbox architecture trace | `roadmap docs/.../sandboxes/tasklet-sandbox-architecture-trace.md` | Tool routing matrix, sandbox internals |
| Gmail sandbox execution trace | `roadmap docs/.../tasklet/gmail-sandbox-execution-trace.md` | Exact block → FUSE → sandbox data flow |
| CSV lead cleaning trace | `roadmap docs/.../tasklet/csv-lead-cleaning-sandbox-workflow.md` | read_file/write_file as platform tools, sandbox only for run_command |
| Live execution trace (Apr 4) | Provided by Tasklet dev | Confirmed: tool result → block file → LLM writes path into script → FUSE read |

### How Tasklet Feeds Tool Results into the Sandbox (Confirmed)

From the live execution trace, the exact flow is:

```
1. Tool call executes (e.g., web_search_web)
       ↓
2. Platform saves full result to /agent/blocks/{blockId}/result
   Platform saves args to /agent/blocks/{blockId}/args
   Platform saves metadata to /agent/blocks/{blockId}/info
       ↓
3. Platform returns full result + blockId to LLM context
       ↓
4. LLM sees the blockId in the response
       ↓
5. LLM writes a Python script containing:
   open('/agent/blocks/{blockId}/result')
       ↓
6. Sandbox executes script → FUSE serves the file from cloud storage
```

**There is no context.json. No injection step. No packaging.** The model is the bridge — it sees the blockId, writes it into the script, and the FUSE mount makes the file accessible. Confirmed with live sandbox inspection showing the block directory structure.

### Tasklet's Architecture (from verbatim sources)

**Tool routing — from system prompt and tool definitions:**

| Tool | Runs where | Evidence |
|---|---|---|
| `read_file` | Platform server | Tool def takes `path` param, returns content. No sandbox reference. |
| `write_file` | Platform server | Tool def takes `path`, `op`, `content`. No sandbox reference. |
| `run_command` | Sandbox (microVM) | System prompt: "You have access to a Linux sandbox via **run_command**" |
| All other tools | Platform server | Architecture trace: decision matrix |

**Filesystem layout — from system prompt lines 54-68:**

```
/agent/                    # FUSE-mounted cloud storage (persistent, high latency)
├── home/                  # Read-write, agent workspace
├── uploads/{filename}     # Read-only, user uploads
├── blocks/                # Read-only, tool call block storage
├── skills/                # Read-only, skill instructions
└── subagents/             # Read-write, subagent instruction files
/tmp/                      # Local tmpfs (fast, ephemeral)
```

**Sandbox filesystem rules — from system prompt lines 183-188:**

> - `/agent/` is cloud-backed (FUSE-mounted) storage. It is persistent but has higher latency than local disk and does not support symlinks.
> - `/tmp/` is fast local storage but ephemeral (lost after session).
> - Prefer `/tmp/` for I/O-heavy work such as extracting large archives, cloning git repos, or processing many files. Do the work in `/tmp/`, then copy only the final artifacts to `/agent/home/` if they need to persist.

**Processing data in sandbox — from system prompt lines 220-229:**

> IMPORTANT: Never enumerate or hard-code data from tool results in code you write. Instead always read the tool result from the filesystem and process it in code.
> ```python
> with open('/agent/blocks/b_123/result', 'r') as f:
>     data = f.read()
> ```

### Fintool's Architecture (corroborating reference)

Fintool uses the same single-store pattern with S3:
- S3 as single source of truth, FUSE-mounted into sandbox
- Platform-side file tools hit the same S3 bucket
- Source: `roadmap docs/.../Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

---

## 2. Research: Supabase Storage as the Sole Store

### S3 Protocol Support

Supabase Storage supports the **S3 protocol** natively — a first-class protocol endpoint sharing the same underlying data as the REST API.

**Endpoint:** `https://{project_ref}.storage.supabase.co/storage/v1/s3`

**Auth — project-level S3 keys (matching Tasklet's model):**

Project-level S3 access keys generated from Supabase dashboard. Bypass RLS, full access to all buckets. Injected as env vars at sandbox creation. s3fs prefix scoping restricts the mount to one client's directory.

```
access_key_id:     <generated from project settings>
secret_access_key: <generated from project settings>
s3fs prefix:       agent-files/{clientId}/
```

This matches Tasklet's credential model: platform-minted credentials with broader access than the mount shows, scoped by filesystem prefix, in an ephemeral tenant-isolated VM. See `roadmap docs/.../sandboxes/tasklet-sandbox-auth-model-investigation.md` for full evidence.

**Future hardening:** Supabase is developing prefix-scoped S3 keys. When available, upgrade to keys that can only access one client's bucket prefix at the API level.

**Interoperability (from Supabase docs):**

> Storage supports standard, resumable and S3 uploads and all these protocols are interoperable. You can upload a file with the S3 protocol and list it with the REST API.

This means: a block file written via Supabase REST API is immediately readable via s3fs FUSE in the sandbox. One store, two access paths.

**Sources:**
- [S3 Authentication | Supabase Docs](https://supabase.com/docs/guides/storage/s3/authentication)
- [S3 Compatibility | Supabase Docs](https://supabase.com/docs/guides/storage/s3/compatibility)

### What We Keep on Supabase

- **Auth, Database, Realtime** — unchanged
- **Storage** — same `agent-files` bucket, same paths, same RLS
- **read_file/write_file tools** — continue hitting Supabase client SDK
- **User uploads** — go to Supabase Storage as before

The ONLY change is how the sandbox accesses files: FUSE mount via S3 protocol instead of eager download + sync.

---

## 3. Requirements

### Sandbox Compute

- R1. Replace Vercel Sandbox (`@vercel/sandbox` + `bash-tool`) with Blaxel Sandbox (`@blaxel/core`) for all code execution
- R2. Mount Supabase Storage via s3fs-fuse at `/agent/` inside the sandbox, scoped to the client's prefix (`agent-files/{clientId}/`)
- R3. Sandbox initialization remains lazy — only boot on first `bash` call
- R4. Replace `bash-tool` with a ~30-line wrapper around `sandbox.process.exec()`

### Block Storage (replaces context.json)

- R5. Every main-agent tool call result is persisted to Supabase Storage at `{clientId}/toolcalls/{toolCallId}/result.json` (and optionally `args.json`)
- R6. The toolCallId is appended to each tool result returned to the LLM, so the model can reference it
- R7. System prompt includes a `<blocks>` section teaching the model to read tool results from `/agent/toolcalls/{id}/result` when writing sandbox scripts
- R8. System prompt includes a `<processing-data>` section: "Never hard-code data from tool results. Instead read from the filesystem."
- R9. `context.json` and `build-context-json.ts` are deleted entirely

### NOT in scope (explicit)

- R10. No truncation of inline tool results. Full results continue to appear in LLM context as today.
- R11. No `<context-removed>` tags, no context compaction, no message removal. Prompt cache behavior is untouched.
- R12. No changes to how the system prompt is assembled (except adding `<blocks>` and `<processing-data>` sections)

### File Visibility

- R13. Files added to Supabase Storage mid-session (e.g., Google Drive downloads) are visible inside the running sandbox without rebooting
- R14. Files written inside the sandbox (via FUSE) are immediately readable by platform tools (read_file) via Supabase REST API

### Security Model (two layers, matching Tasklet's production model)

Investigation of Tasklet's actual auth model (see `roadmap docs/.../sandboxes/tasklet-sandbox-auth-model-investigation.md`) confirmed they use **platform-minted, agent-scoped credentials** — not user JWTs. Interactive and background runs get identical auth. This resolves the background-run credential gap (adversarial review finding #1).

- R15. **Layer 1 — Filesystem prefix scoping:** s3fs mounts only `agent-files/{clientId}/` as the root of `/agent/`. The sandbox only sees one client's files. Project-level S3 keys are injected as env vars at sandbox creation. Same risk profile as Tasklet (credentials have broader access than the mount shows, but sandbox is ephemeral and tenant-isolated at VM level).
- R16. **Layer 2 — Hypervisor egress allowlist (if available):** Blaxel's hypervisor-level network policy restricts outbound connections to Supabase Storage endpoint only. This layer is aspirational — Blaxel's egress API is unverified (Q5). If unavailable, Layer 1 is the sole enforcement mechanism, which matches Tasklet's shipped model.
- R17. **Future hardening — RLS-scoped credentials:** When Supabase ships prefix-scoped S3 keys (in development), upgrade to credentials that can only access one client's files at the API level. Until then, prefix scoping + ephemeral sandbox isolation is acceptable.

### Path Permissions (read-only enforcement)

- R18. Read-write mounts: `/agent/home/`, `/agent/memory/`, `/agent/subagents/`
- R19. Read-only mounts: `/agent/uploads/`, `/agent/toolcalls/`, `/agent/skills/` — enforced at OS level via s3fs `ro` mount option. Bash cannot write to these paths.

### Block Storage Ordering

- R20. Block files MUST be persisted to Supabase Storage synchronously BEFORE the tool result (with toolCallId) is returned to the LLM. The model must never see a toolCallId for a file that doesn't exist yet.

### Block File Path Convention

- R21. Standardize on `result.json` (with `.json` extension) everywhere — requirements, system prompt, code. Tasklet uses `result` (no extension). This is intentional drift (D5), documented in drift register.

---

## 4. Success Criteria

- Mid-session files from connection tools accessible in sandbox without workarounds
- Sandbox scripts read tool results from `/agent/toolcalls/` via FUSE (no context.json)
- All existing sandbox QA scenarios (surface 29) pass against the new backend
- No change to prompt caching behavior
- No change to how tool results appear inline in LLM context

### Code deleted

| File | Lines | Replaced by |
|---|---|---|
| `build-preload-files.ts` | 197 | FUSE mount |
| `sync-output-artifacts.ts` | 116 | FUSE write-through |
| `build-context-json.ts` | 80 | Block storage |
| `build-preload-files.test.ts` | 385 | — |
| `sync-output-artifacts.test.ts` | 96 | — |
| `build-context-json.test.ts` | 68 | — |
| SHA-256 hash tracking | ~60 | — |
| `bash-tool` dependency | — | ~30-line wrapper |
| **Total** | **~1,000+** | |

---

## 5. Target Architecture

```
═══════════════════════════════════════════════════════════════════════
  AGENT RUNNER (Vercel Functions — unchanged)
═══════════════════════════════════════════════════════════════════════
  │
  │  PLATFORM TOOLS — run on server, never boot sandbox
  │  ──────────────────────────────────────────────────
  │  read_file ──→ Supabase Storage REST API
  │  write_file ─→ Supabase Storage REST API
  │  search_crm ─→ Supabase Postgres
  │  web_search ─→ Brave API
  │  (etc.)
  │
  │  EVERY tool call result:
  │  → returned to LLM context (full, no truncation)
  │  → ALSO saved to Supabase Storage:
  │    agent-files/{clientId}/toolcalls/{toolCallId}/result.json
  │
  │  SANDBOX TOOL — only bash boots a sandbox
  │  ──────────────────────────────────────────
  │  Agent calls bash("python analyze.py")
  │      ↓
  │  Lazy init: boot Blaxel Sandbox, s3fs mounts /agent/
  │      ↓
  │  sandbox.process.exec({ command })
  │      ↓
  │  ┌─────────────────────────────────────────────────────────┐
  │  │  BLAXEL SANDBOX (Unikraft microVM)                      │
  │  │                                                         │
  │  │  /agent/  ← s3fs FUSE mount (Supabase Storage S3)      │
  │  │  ├── home/               # agent workspace              │
  │  │  ├── uploads/            # user uploads                 │
  │  │  ├── toolcalls/          # ← tool results live here     │
  │  │  │   ├── {id1}/result.json                              │
  │  │  │   ├── {id2}/result.json                              │
  │  │  │   └── ...                                            │
  │  │  ├── skills/             # skill files                  │
  │  │  ├── memory/             # SOUL.md, USER.md, MEMORY.md  │
  │  │  └── subagents/          # subagent instructions        │
  │  │                                                         │
  │  │  /tmp/  ← fast local tmpfs                              │
  │  │                                                         │
  │  │  Script reads tool results via FUSE:                    │
  │  │  with open('/agent/toolcalls/{id}/result.json') as f:   │
  │  │      data = json.load(f)                                │
  │  └─────────────────────────────────────────────────────────┘
  │
  └── One store (Supabase). Two access paths (REST + S3/FUSE).


═══════════════════════════════════════════════════════════════════════
  HOW TOOL DATA REACHES THE SANDBOX (replaces context.json)
═══════════════════════════════════════════════════════════════════════

  search_crm({ entity: "deals" })
         │
         ▼
  Platform executes query, gets 50 deals
         │
         ├──→ Returns full result to LLM context (no truncation)
         │
         └──→ Saves to Supabase Storage:
              agent-files/{clientId}/toolcalls/{toolCallId}/result.json
         │
         ▼
  LLM sees toolCallId in the response
         │
         ▼
  LLM writes Python script:
    with open('/agent/toolcalls/{toolCallId}/result.json') as f:
        deals = json.load(f)
         │
         ▼
  Sandbox runs script → FUSE reads file from Supabase → works
```

---

## 6. Drift Register

```
  D1. BACKING STORE
      Tasklet: Unknown (likely Blaxel Drive or own storage)
      Sunder:  Supabase Storage (S3 protocol for FUSE, REST for platform)
      Why:     Supabase is our platform. Same one-store pattern.

  D2. FUSE DAEMON
      Tasklet: AvfsFuse (custom, proprietary)
      Sunder:  s3fs-fuse (open source, battle-tested)
      Why:     s3fs supports any S3-compatible endpoint.

  D3. SANDBOX TOOL NAME
      Tasklet: run_command
      Sunder:  bash
      Why:     Already shipped. Same semantics.

  D4. BLOCK PATH
      Tasklet: /agent/blocks/{blockId}/
      Sunder:  /agent/toolcalls/{toolCallId}/
      Why:     Already using toolcalls/ convention. Same pattern.

  D5. BLOCK STRUCTURE
      Tasklet: args, result, info, optional attachments
      Sunder:  result.json, optionally args.json. No info file initially.
      Why:     Simpler. Add info later if debugging needs it.

  D6. TRUNCATION / CONTEXT COMPACTION
      Tasklet: Truncates large results to ~5KB, removes old messages
      Sunder:  NOT IMPLEMENTED. Full results stay in context.
      Why:     Protect prompt cache. Truncation is a future project.

  D7. CRM TOOLS
      Tasklet: None
      Sunder:  Full CRM suite
      Why:     Product differentiator.

  D8. MEMORY DIRECTORY
      Tasklet: Memories in /agent/home/ (single UserMemories.md)
      Sunder:  Separate /agent/memory/ (SOUL.md, USER.md, MEMORY.md)
      Why:     More structured memory system.

  D9. CREDENTIAL MODEL
      Tasklet: Platform-minted 128-byte bearer token, agent-scoped, injected as file
      Sunder:  Project-level S3 keys, injected as env vars, s3fs prefix-scoped to clientId
      Why:     Same pattern (platform injects scoped credential), different protocol.
               Tasklet uses custom HTTP API + bearer token. We use S3 protocol + access keys.
               Both have broader access than the mount shows; both rely on ephemeral VM isolation.
               Evidence: roadmap docs/.../sandboxes/tasklet-sandbox-auth-model-investigation.md

  ALL OTHER PATTERNS: ZERO DRIFT
  - read_file/write_file on platform, not sandbox              ✅
  - Only bash/run_command boots sandbox                        ✅
  - /agent/ FUSE-mounted, persistent, high latency             ✅
  - /tmp/ local, fast, ephemeral                               ✅
  - "Prefer /tmp/ for heavy work, copy to /agent/home/"        ✅
  - Block storage for tool results, model writes path in code  ✅
  - "Never hard-code data, read from filesystem"               ✅
```

---

## 7. Spike Results (Apr 5, 2026) — FUSE Gate Confirmed Open

### Test: s3fs FUSE mount of Supabase Storage inside Blaxel sandbox

**Script:** `scripts/spike/blaxel-fuse-test.ts`

**Environment:** Blaxel sandbox `sunder-fuse-spike-2`, image `blaxel/base-image:latest`, region `us-was-1`, 2048MB memory.

| Test | Result | Detail |
|---|---|---|
| `/dev/fuse` exists | **PASS** | `crw------- root root 10, 229` |
| FUSE in kernel | **PASS** | `fuseblk`, `fuse`, `fusectl` all registered |
| Install s3fs-fuse | **PASS** | `apk add s3fs-fuse` — v1.95, 5 packages |
| Install rclone | **PASS** | `apk add rclone` — v1.72.1 |
| s3fs mount Supabase | **PASS** | `s3fs on /mnt/supabase type fuse.s3fs (rw,nosuid,nodev,relatime,user_id=0,group_id=0,allow_other)` |
| List files via FUSE | **PASS** | Sees actual client directories (UUID prefixes) from Supabase Storage |
| Write through FUSE | **PASS** | `echo "hello from blaxel sandbox" > /mnt/supabase/fuse-test.txt` — persisted |
| Read through FUSE | **PASS** | `cat /mnt/supabase/fuse-test.txt` — content matches |
| rclone S3 list | **FAIL** | Config path issue (`/blaxel/.config/` vs `/root/.config/`) — trivially fixable, not a blocker |

**Verdict: FEASIBLE. All critical tests pass.**

Key observations:
- Blaxel's Unikraft microVM exposes `/dev/fuse` natively — no `--privileged` or `CAP_SYS_ADMIN` needed
- Blaxel already runs its own FUSE daemon (`ukp-fuse on /uk/libukp`) — FUSE is a first-class citizen
- Supabase Storage S3 protocol is fully interoperable with s3fs
- Project-level S3 keys work (used for spike). JWT session tokens to be tested in planning phase.
- The rclone config path issue is because Blaxel uses `/blaxel/` as home, not `/root/`. Fix: set `--config /blaxel/.config/rclone/rclone.conf` or `RCLONE_CONFIG` env var.

### External Research Findings (incorporated)

An independent technical evaluation confirmed the architecture and added actionable detail:

1. **rclone recommended over s3fs for production** — VFS cache (`--vfs-cache-mode writes`) solves the no-caching problem observed in Tasklet benchmarks (~220ms per read without cache). Cached repeat reads would be near-instant. s3fs has no equivalent.
2. **`--s3-list-version 2` flag** — Forces ListObjectsV2 for rclone. Avoids pagination bugs with Supabase's S3 implementation. Must-have for production.
3. **Non-atomic renames on S3** — `rename()` is emulated as COPY + DELETE. Not atomic. Agent scripts should use "write-to-temp-then-rename" pattern. Add to system prompt sandbox section.
4. **`--dir-cache-time` tuning** — Controls freshness of directory listings. Lower values (e.g. `5s`) improve mid-session file visibility at the cost of more ListObjects calls.
5. **Ghost folders** — Supabase-specific: high-concurrency deletes can leave empty "ghost" directories in the UI. Low priority but worth knowing.
6. **No `CAP_SYS_ADMIN` needed** — Confirmed by spike. Blaxel's microVM architecture gives the sandbox its own kernel, so FUSE works without elevated privileges. This is unlike Docker containers where FUSE requires `--privileged` or `--cap-add SYS_ADMIN`.

### Updated Recommendation

**Use s3fs for initial implementation** (proven in spike, simpler config), **migrate to rclone for production** (caching, resilience, better diagnostics). Both are installable via `apk add` in the same Alpine image.

---

## 8. Dependencies

1. Blaxel account + workspace (for sandbox compute)
2. Custom Docker image with s3fs-fuse baked in
3. Supabase Storage S3 access keys (generate from project settings)
4. `@blaxel/core` TypeScript SDK
5. **NO Blaxel Drive needed**
6. **NO Blaxel Agent Drive private preview needed**

---

## 8. Outstanding Questions (Deferred to Planning)

- ~~Q1. [Technical] Verify s3fs-fuse works with Supabase's S3 endpoint.~~ **RESOLVED — spike confirmed s3fs mount works.** JWT session tokens still need testing (Q6).

- Q2. [Technical] s3fs multiple mount points — verify 6 separate s3fs mounts (3 rw, 3 ro) work concurrently in one container.
- Q3. [Technical] How to append toolCallId to tool results — AI SDK `onStepFinish` callback, or wrap each tool's execute function?
- Q4. [Technical] Blaxel sandbox cold-start with custom Docker image. Benchmark.
- Q5. [Technical] Blaxel hypervisor egress allowlist — verify configuration API and confirm Supabase endpoint whitelisting works.
- ~~Q6. [Technical] Verify Supabase JWT session token works with s3fs.~~ **DROPPED — design now uses project-level S3 keys per Tasklet auth model investigation.**

---

## 9. Next Steps

-> `/plan` for structured implementation planning.
