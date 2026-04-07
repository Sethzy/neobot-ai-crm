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

- R5. Every main-agent tool call result is persisted to Supabase Storage at `{clientId}/toolcalls/{runId}/{toolCallId}/result.json` (and optionally `args.json`)
- R6. The toolCallId is appended to each tool result returned to the LLM, so the model can reference it
- R7. System prompt includes a `<blocks>` section teaching the model to read tool results from `/agent/toolcalls/{id}/result` when writing sandbox scripts
- R8. System prompt includes a `<processing-data>` section: "Never hard-code data from tool results. Instead read from the filesystem."
- R9. `context.json` and `build-context-json.ts` are deleted entirely

### NOT in scope (explicit)

- R10. No truncation of inline tool results. Full results continue to appear in LLM context as today. **Acknowledged trade-off:** Tasklet dev confirmed (Apr 6) that without truncation, the model will use inline data ~30-50% of the time instead of reading from block files. The `<processing-data>` instruction helps but is not sufficient alone. Truncation is the real forcing function. We accept this — block storage is passive infrastructure for now (recovery, observability, sandbox access for large data). Truncation is a future project that will make blocks the primary data path.
- R11. No `<context-removed>` tags, no context compaction, no message removal. Prompt cache behavior is untouched.
- R12. No changes to how the system prompt is assembled (except adding `<blocks>` and `<processing-data>` sections)

### File Visibility

- R13. Files added to Supabase Storage mid-session (e.g., Google Drive downloads) are visible inside the running sandbox without rebooting
- R14. Files written inside the sandbox (via FUSE) are immediately readable by platform tools (read_file) via Supabase REST API

### Security Model (two layers, matching Tasklet's production model)

Investigation of Tasklet's actual auth model (see `roadmap docs/.../sandboxes/tasklet-sandbox-auth-model-investigation.md`) confirmed they use **platform-minted, agent-scoped credentials** — not user JWTs. Interactive and background runs get identical auth. This resolves the background-run credential gap (adversarial review finding #1).

- R15. **Layer 1 — RLS via JWT session token:** rclone uses a Supabase Auth session token in S3 SigV4 requests. Supabase enforces RLS at the S3 protocol layer — the sandbox can only see/write files belonging to the authenticated user's client. No project-level S3 keys needed. Credentials: `access_key_id = {project_ref}`, `secret_access_key = {anon_key}`, `session_token = {access_token from auth session}`. **Verified in Spike 2 (Apr 6) + adversarial review (Apr 6).**
- R16. **Layer 2 — Network isolation (confirmed via Tasklet investigation):** Blaxel sandboxes run on /30 subnets — each sandbox can only see its gateway, not other sandboxes. No lateral movement. However, **outbound egress is unrestricted** — Tasklet's sandbox can reach arbitrary internet hosts on all ports and protocols. There is no egress firewall. Tasklet relies on prompt-level convention ("do not call external APIs") which is not a security control. If Blaxel offers egress allowlisting (Q5), we would be MORE secure than Tasklet. If not, we are at parity — the real boundary is the storage credential (Layer 1).
- R17. **Credential minting — use `auth.admin.generateLink()`, NOT JWT secret signing.** The runner mints a session token via `supabase.auth.admin.generateLink({ type: "magiclink", email })` then verifies the OTP to obtain a real `access_token`. This token is a standard short-lived Supabase session (1 hour). The runner MUST NOT sign JWTs directly using the JWT secret — a leaked signing key would allow minting credentials for any user or minting `service_role` tokens that bypass RLS entirely. The blast radius of a leaked `access_token` is one client for one hour. The blast radius of a leaked JWT secret is all clients forever. **Adversarial review confirmed: forged `service_role` JWT listed all client prefixes and read victim files.**
- R18. **Signed URLs must never appear in sandbox-readable paths.** Tool results persisted to `/toolcalls/.../result.json` MUST contain storage paths only (e.g., `/agent/home/results.csv`), never signed download URLs. Signed URLs bypass RLS — anyone with the URL can download the file without a JWT. Download URLs must be generated server-side at click time, not at tool-call time. **Adversarial review confirmed: signed URL for victim's file returned 200 anonymously.**

### Path Permissions (read-only enforcement)

- R19. Single rw FUSE mount at `/agent/`. No separate ro mounts needed.
- R20. Read-only enforcement via application layer: `write_file` tool rejects writes to `/agent/uploads/`, `/agent/toolcalls/`, `/agent/skills/` (existing `assertWritable()` in `agent-files.ts`). System prompt tells agent these paths are read-only. Bash scripts *can* technically write to these paths via FUSE — accepted risk, same trade-off as Tasklet (where writes silently vanish at the backend but return exit 0 to the shell). See D10 in drift register.

### File Download Links (replaces artifact sync — confirmed via Tasklet dev)

Tasklet's pattern: no scanning, no diffing, no signed URL generation. The model outputs a link with a custom protocol (`avfs://`), and the frontend resolves it to an authenticated download. Confirmed by Tasklet dev with live sandbox testing (Apr 6).

- R22. **Model-driven download links, not scan-based.** The agent outputs markdown links with a custom `agent://` protocol (e.g. `[report.pdf](agent:///home/report.pdf)`) when it creates files. The model knows what it created because it issued the commands. No filesystem scan needed. The custom protocol avoids false positives — `/agent/` paths appear naturally in code examples and explanations, but `agent://` only appears in intentional download links. (Tasklet uses `avfs://` for the same reason — confirmed by Tasklet dev, Apr 7.)
- R23. **Frontend resolves `agent://` links to Supabase Storage downloads.** The chat message renderer matches `agent://` links in assistant messages and resolves them to authenticated Supabase Storage download calls using the user's session. Simple regex: `agent:\/\/\/(.*)`  → `supabase.storage.download('{clientId}/{path}')`. No signed URLs, no expiry management.
- R24. **`syncOutputArtifacts()` is deleted entirely.** No post-command scan. No hash diffing. No signed URL generation. No `artifacts[]` in the bash tool response. FUSE write-through means files are already in Supabase Storage the moment they're written.
- R25. **System prompt instructs the agent to output download links.** Add to `<sandbox>` section: "After creating files for the user, output markdown links with `agent://` protocol, e.g. `[report.pdf](agent:///home/report.pdf)`. Spaces in filenames must be URL-encoded as `%20`."
- R26. **No auto-discovery of "forgotten" files.** If the model creates a file and doesn't link it, the user doesn't see it. This is a prompt quality issue, not a platform issue. Same trade-off Tasklet makes.
- R38. **Telegram delivery: server-side rewriting of `agent://` links.** The Telegram bot delivery pipeline detects `agent://` URLs in assistant messages and either generates a signed HTTPS download link or attaches the file directly via Telegram bot API. Custom protocol links are dead outside the web client — confirmed by Tasklet dev (avfs:// links don't work in email or Telegram).
- R39. **Path allowlist for `agent://` downloads.** The download endpoint only serves files from `/home/` and `/uploads/`. Requests for `/memory/`, `/skills/`, `/toolcalls/`, `/subagents/` are rejected. Prevents the model from accidentally linking to internal files. One prefix check in the resolver.
- R40. **URL-encode path segments in `agent://` links.** System prompt instructs the model to encode spaces (`%20`), `#` (`%23`), `%` (`%25`), and parentheses (`%28`/`%29`). Frontend resolver uses `decodeURIComponent` per segment. Covers 99.9% of real filenames.

**Tasklet's exact flow (verified):**

```
Agent writes file:
  run_command("python generate_report.py")
      │
      └─ FUSE write() → cloud storage (file exists immediately)

Agent outputs in chat:
  "Here's your report: [report.pdf](avfs:///agent/home/report.pdf)"
      │
      └─ Frontend resolves avfs:// → authenticated download

Sunder equivalent:
  bash("python generate_report.py")
      │
      └─ FUSE write() → Supabase Storage (via S3 protocol)

  Agent outputs in chat:
  "Here's your report: [report.pdf](agent:///home/report.pdf)"
      │
      └─ Frontend matches agent:// → supabase.storage.download()
```

### Block Storage Ordering (confirmed via Tasklet dev, Apr 6)

Tasklet persists block files **synchronously, block-on-confirm** — the platform writes to cloud storage and waits for the write to succeed before returning the blockId to the model. ~150ms per tool call, absorbed into existing tool call latency (2-5s total). No async coordination, no race conditions, trivially correct.

The async alternative (fire-and-forget + wait-before-bash) was considered and rejected:
- Adds complexity: what if the async write fails silently? What if bash races ahead of a slow upload?
- Requires health checks, retries, and ordering guarantees
- Saves ~150ms that nobody notices inside a 2-5s tool call cycle

Tasklet's evidence: a block from a just-completed parallel tool call was immediately readable by the concurrent second tool call. The blockId is not surfaced to the model until the block is confirmed persisted.

- R27. Block files are persisted **synchronously** via `saveToolcallBlock()` (already exists in `src/lib/storage/tool-blocks.ts`). The upload must complete before the tool result (with toolCallId appended) is returned to the LLM.
- R28. If the block write fails, the tool call still returns its result to the LLM but WITHOUT a toolCallId. The model can still use the inline result; it just can't reference it from sandbox code. Fail-open, not fail-closed.
- R29. No async write queue. No "wait for pending writes before bash." Synchronous is boring and correct.

### Bash Execution Model (confirmed via Tasklet dev, Apr 7)

Blaxel's sandbox-api supports SSE streaming + named processes. This solves the Vercel Function timeout problem — the Function is an observer, not a blocker.

- R33. **Fire-and-recover pattern for bash execution.** Start process via `POST /process`, get back a processId immediately. Stream logs via SSE (`GET /process/{id}/logs/stream`). If Vercel Function dies, reconnect via `GET /process/{id}` on retry.
- R34. **Name processes by toolCallId.** Prevents double execution if Vercel retries. If a process with that name already exists, check its status instead of re-executing.
- R35. **Scale-to-zero is paused while processes run.** Blaxel's sandbox-api keeps the VM alive during execution (600s keepalive). A 300-second bash command doesn't risk the sandbox dying underneath it.

### Subagent Sandbox Sharing (confirmed via Tasklet dev, Apr 7)

- R36. **Subagents share the parent's sandbox.** Same VM, same `/tmp/`, same installed packages, same FUSE mount. No cold-start per subagent. Matches Tasklet's production behavior.
- R37. **`/tmp/` state is shared between parent and subagent.** This is a feature — parent `pip install`s, subagent uses the package. System prompt does not need to address this (subagent instructions are self-contained).

### Block File Path Convention

- R30. Block paths scoped to runId: `toolcalls/{runId}/{toolCallId}/result.json`. Keeps listing manageable per-run. No cleanup job. ~2MB/month per client is negligible.
- R31. System prompt tells the agent to reference blocks by exact path, never `ls` the toolcalls directory.
- R32. Standardize on `result.json` (with `.json` extension) everywhere — requirements, system prompt, code. Tasklet uses `result` (no extension). This is intentional drift (D5), documented in drift register.

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
| `sync-output-artifacts.ts` | 116 | FUSE write-through + model-driven links |
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
  │    agent-files/{clientId}/toolcalls/{runId}/{toolCallId}/result.json
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
  │  │  │   └── {runId}/                                       │
  │  │  │       ├── {id1}/result.json                          │
  │  │  │       ├── {id2}/result.json                          │
  │  │  │       └── ...                                        │
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
  HOW USERS DOWNLOAD SANDBOX-GENERATED FILES (replaces artifact sync)
═══════════════════════════════════════════════════════════════════════

  bash("python generate_report.py")
         │
         ▼
  Sandbox writes /agent/home/report.pdf
         │
         └──→ FUSE write-through → Supabase Storage (immediate)
         │
         ▼
  Agent outputs in chat:
    "Here's your report: [report.pdf](/agent/home/report.pdf)"
         │
         ▼
  Frontend sees /agent/ link in markdown
         │
         └──→ supabase.storage.from('agent-files')
              .download('{clientId}/home/report.pdf')
         │
         ▼
  User clicks, gets the file.

  No scanning. No hashing. No signed URLs. No expiry.
  The model is the index — it knows what it created.


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
              agent-files/{clientId}/toolcalls/{runId}/{toolCallId}/result.json
         │
         ▼
  LLM sees toolCallId in the response
         │
         ▼
  LLM writes Python script:
    with open('/agent/toolcalls/{runId}/{toolCallId}/result.json') as f:
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
      Sunder:  /agent/toolcalls/{runId}/{toolCallId}/
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
      Fintool: AWS STS AssumeRole with ABAC session tags, prefix-scoped S3 credentials
      Sunder:  Supabase session token via auth.admin.generateLink() → rclone S3 session_token.
               RLS enforced at S3 layer per-request.
      Why:     STRONGER than Tasklet (their credentials have broader access than the mount shows).
               COMPARABLE to Fintool (both enforce at the storage layer, not just the mount).
               Key constraint: MUST use auth.admin.generateLink() to mint tokens, NOT JWT secret signing.
               Leaked access_token = one client, one hour. Leaked JWT secret = all clients, forever.
               Verified: Spike 2 + adversarial review (Apr 6).
               s3fs also works with session tokens (needs -o use_session_token -o sigv4 flags).
               rclone recommended for production (VFS cache, simpler config).

  D10. FILE DOWNLOAD PROTOCOL
       Tasklet: avfs:// custom protocol. Frontend resolves to AVFS API download.
       Sunder:  agent:// custom protocol. Frontend resolves to Supabase Storage download.
       Why:     Same pattern, different scheme name. Custom protocol avoids false-positive
               link detection (plain /agent/ paths appear in code examples and explanations).
               Confirmed via Tasklet dev (Apr 7) — avfs:// was chosen specifically for
               unambiguous link detection.

  D11. READ-ONLY PATH ENFORCEMENT
       Tasklet: Single rw FUSE mount. Server-side rejects writes to /uploads/, /skills/, /blocks/.
                FUSE driver has write-back cache — create() and write() succeed locally (exit 0),
                but flush() to backend is rejected. File silently vanishes. Cache entry invalidated.
                No error propagated to calling process.
       Sunder:  Supabase Storage RLS policies + application-level enforcement in write_file tool.
                s3fs/rclone don't have Tasklet's write-back-then-reject pattern.
                Two options: (a) multiple mounts with ro flag (heavy, 6 FUSE daemons),
                (b) single rw mount + application-level enforcement (current approach, simpler).
       Decision: Option (b) — single mount, application enforcement. Matches what we already do.
                 write_file tool already rejects writes to protected paths (assertWritable() in agent-files.ts).
                 Bash scripts CAN write to read-only paths via FUSE (no server rejection like Tasklet),
                 but the system prompt tells the agent not to. Acceptable risk — same as Tasklet's
                 approach where exit code 0 is returned even on rejected writes.

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
4. **`--dir-cache-time 0s`** — Tasklet dev confirmed their `readdir()` has zero caching (always hits backend). Set to `0s` to match. Cost is one extra ListObjects call per `ls`, acceptable given scripts rarely enumerate directories.
5. **Ghost folders** — Supabase-specific: high-concurrency deletes can leave empty "ghost" directories in the UI. Low priority but worth knowing.
6. **No `CAP_SYS_ADMIN` needed** — Confirmed by spike. Blaxel's microVM architecture gives the sandbox its own kernel, so FUSE works without elevated privileges. This is unlike Docker containers where FUSE requires `--privileged` or `--cap-add SYS_ADMIN`.

### Spike 2: rclone with JWT Session Tokens (Apr 6, 2026)

Detailed adversarial test log for the seeded Alice/Bob/Carol accounts:
[`docs/product/reviews/2026-04-06-sandbox-tenant-isolation-review.md`](../reviews/2026-04-06-sandbox-tenant-isolation-review.md)

**Script:** Manual CLI tests via `bl run sandbox sunder-rls-final-2`

**Goal:** Determine if rclone handles Supabase S3 session tokens (project_ref as access_key, anon_key as secret, JWT as session_token) — s3fs failed with `InvalidAccessKeyId` using the same credential triple.

**Credential model tested:**
```
access_key_id     = {project_ref}
secret_access_key = {anon_key}
session_token     = {user_jwt}  (authenticated via Supabase Auth password grant)
endpoint          = https://{project_ref}.supabase.co/storage/v1/s3
```

| Test | Result | Detail |
|---|---|---|
| rclone lsd (list buckets) | **PASS** | No error, empty list (expected — Supabase S3 scopes to RLS-visible buckets) |
| rclone lsd agent-files (list dirs) | **PASS** | Sees only `d66bc1b7-...` (the authenticated user's client). RLS enforced. |
| rclone lsd client dir (list subdirs) | **PASS** | All 12 subdirectories visible (attachments, home, instructions, meetings, memory, skills, state, subagents, tmp, toolcalls, uploads, vault) |
| rclone ls (list files) | **PASS** | Full file tree with sizes — SOUL.md (852B), MEMORY.md (138B), USER.md (253B), skills/, memory/, home/, etc. |
| rclone copy (download file) | **PASS** | SOUL.md downloaded, content verified correct. 0.3s elapsed. |
| rclone copy (upload file) | **PASS** | 47-byte file uploaded, verified via rclone ls and Supabase REST API |
| rclone mount FUSE (read) | **PASS** | `ls /mnt/agent-rclone/` shows all files and dirs. `cat SOUL.md` returns correct content. `ls memory/` works. |
| rclone mount FUSE (write) | **PASS** | `echo > /mnt/agent-rclone/home/file.txt` succeeds. With `--vfs-write-back 0s`, upload is immediate. Verified via Supabase REST API. |
| Supabase REST read-back | **PASS** | All 3 test files written via rclone (direct + 2x FUSE) readable via Supabase REST API. Full interoperability confirmed. |

**Key findings:**

1. **rclone handles session tokens correctly; s3fs does not.** Same credential triple (project_ref / anon_key / JWT). rclone includes the session token in the SigV4 `X-Amz-Security-Token` header. s3fs constructs the signature differently and fails.

2. **RLS is enforced via session token.** The authenticated JWT scopes visibility — only the user's own client directory appears. This means we can use JWT session tokens instead of project-level S3 keys, getting RLS enforcement at the S3 layer for free.

3. **rclone mount requires `fuse3` package.** Default Alpine install has `fuse` (v2) but rclone needs `fusermount3`. Fix: `apk add fuse3`.

4. **`--daemon` mode fails in Blaxel.** Blaxel's process model doesn't support daemonization. Fix: run `rclone mount` in foreground, backgrounded with `&`. Works perfectly.

5. **VFS write-back timing matters.** Default `--vfs-write-back 5s` delays uploads. Set `--vfs-write-back 0s` for immediate persistence. Critical for tool result blocks that must be readable immediately.

6. **rclone config requires `session_token` key.** The env var `AWS_SESSION_TOKEN` is NOT read by rclone's S3 backend. Must use config key `session_token` or env var `RCLONE_S3_SESSION_TOKEN`.

**Production rclone mount command (verified):**
```bash
rclone mount supabase:agent-files/{clientId}/ /agent \
  --s3-list-version 2 \
  --vfs-cache-mode writes \
  --vfs-write-back 0s \
  --allow-other \
  --no-modtime \
  --dir-cache-time 0s
```

**Verdict: rclone with JWT session tokens is the production path.** It provides:
- RLS enforcement at the S3 layer (no project-level keys needed)
- VFS caching for read performance
- Immediate write-through with `--vfs-write-back 0s`
- Full FUSE mount with read/write/list confirmed
- Full interoperability with Supabase REST API

### Updated Recommendation

**Use rclone for production** — proven with JWT session tokens, VFS caching, and FUSE mount. s3fs is a fallback for project-level S3 keys only (it cannot handle session tokens). Both are installable via `apk add` in the same Alpine image.

---

## 8. Dependencies

1. Blaxel account + workspace (for sandbox compute)
2. Custom Docker image with rclone + fuse3 baked in (`apk add rclone fuse3`)
3. Supabase Auth JWT (minted per-session via password grant or service role) — no project-level S3 keys needed
4. `@blaxel/core` TypeScript SDK
5. **NO Blaxel Drive needed**
6. **NO Blaxel Agent Drive private preview needed**

---

## 8. Outstanding Questions (Deferred to Planning)

- ~~Q1. [Technical] Verify s3fs-fuse works with Supabase's S3 endpoint.~~ **RESOLVED — spike confirmed s3fs mount works.** JWT session tokens still need testing (Q6).

- ~~Q2. [Technical] s3fs multiple mount points — verify 6 separate mounts work concurrently.~~ **RESOLVED — not needed.** Tasklet uses single rw mount + server-side write rejection. We'll use single rw mount + application-level enforcement (already implemented in `assertWritable()`). See D10 in drift register.
- ~~Q3. [Technical] How to append toolCallId to tool results?~~ **RESOLVED — synchronous write inside tool execution boundary.** `saveToolcallBlock()` already exists in `tool-blocks.ts`. Call it at the end of each tool's `execute()`, before returning. Append toolCallId to the result object. If write fails, return result without toolCallId (fail-open).
- Q4. [Technical] Blaxel sandbox cold-start with custom Docker image. Benchmark.
- Q5. [Technical] Blaxel egress allowlist — check if available. Tasklet investigation confirmed their sandbox has NO egress restrictions (arbitrary outbound HTTP, raw TCP, POST all work). If Blaxel offers it, it's a security bonus over Tasklet. If not, we're at parity. Not blocking.
- ~~Q6. [Technical] Verify Supabase JWT session token works with s3fs.~~ **RESOLVED (Apr 6) — s3fs fails with InvalidAccessKeyId. rclone works perfectly.** JWT session tokens with rclone provide RLS enforcement at the S3 layer. See Spike 2 results in Section 7.

---

## 9. Next Steps

-> `/plan` for structured implementation planning.
