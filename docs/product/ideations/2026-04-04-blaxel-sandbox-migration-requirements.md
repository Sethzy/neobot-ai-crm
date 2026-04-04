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

**Auth — two methods available:**

1. **Global S3 access keys** — generated from project settings. Bypass RLS, full access to all buckets. Server-side only. **NOT suitable for sandbox injection.**
2. **JWT session tokens** — authenticate with a user JWT. **RLS policies are respected.** All operations scoped to the authenticated user. Short-lived (1h expiry). This is what we use for the sandbox FUSE mount.

Session token credentials for s3fs:
```
access_key_id:     project_ref        (public)
secret_access_key: anon_key           (public)
session_token:     user JWT           (short-lived, RLS-scoped)
```

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

### Security Model (three independent layers)

- R15. **Layer 1 — RLS-scoped JWT session token:** The FUSE mount authenticates to Supabase Storage using a short-lived JWT session token (not global S3 access keys). RLS policies are enforced server-side — the sandbox can only access the current client's files regardless of what path is requested. Token expires in ~1 hour.
- R16. **Layer 2 — Hypervisor egress allowlist:** Blaxel's hypervisor-level network policy restricts the sandbox to outbound connections to Supabase Storage endpoint only. No other egress. Even with root access inside the VM, credentials cannot be exfiltrated to external servers. Unbypassable from inside the guest OS.
- R17. **Layer 3 — Filesystem prefix scoping:** s3fs mounts only `agent-files/{clientId}/` as the root of `/agent/`. Belt-and-suspenders — even without RLS, the filesystem only shows one client's files.

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
      Tasklet: Unknown
      Sunder:  JWT session token (RLS-scoped) + hypervisor egress allowlist + prefix scoping
      Why:     Three-layer security model. More secure than Vercel's networkPolicy
               (which had no RLS scoping). Global S3 keys never enter the VM.

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

## 7. Dependencies

1. Blaxel account + workspace (for sandbox compute)
2. Custom Docker image with s3fs-fuse baked in
3. Supabase Storage S3 access keys (generate from project settings)
4. `@blaxel/core` TypeScript SDK
5. **NO Blaxel Drive needed**
6. **NO Blaxel Agent Drive private preview needed**

---

## 8. Outstanding Questions (Deferred to Planning)

- Q1. [Technical] Verify s3fs-fuse works with Supabase's S3 endpoint + JWT session tokens. 30-minute spike.
- Q2. [Technical] s3fs multiple mount points — verify 6 separate s3fs mounts (3 rw, 3 ro) work concurrently in one container.
- Q3. [Technical] How to append toolCallId to tool results — AI SDK `onStepFinish` callback, or wrap each tool's execute function?
- Q4. [Technical] Blaxel sandbox cold-start with custom Docker image. Benchmark.
- Q5. [Technical] Blaxel hypervisor egress allowlist — verify configuration API and confirm Supabase endpoint whitelisting works.
- Q6. [Technical] Verify Supabase JWT session token works with s3fs `session_token` option (standard AWS STS session token flow).

---

## 9. Next Steps

-> `/plan` for structured implementation planning.
