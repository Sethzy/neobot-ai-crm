---
title: "feat: Blaxel Sandbox Migration"
type: feat
status: active
date: 2026-04-07
origin: docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md
---

# feat: Blaxel Sandbox Migration

## Overview

Replace Vercel Sandbox with Blaxel for code execution. FUSE-mount Supabase Storage into the sandbox at `/agent/` via rclone + S3 protocol. Implement block storage for tool results. Replace artifact sync with model-driven download links using `agent://` protocol. Delete ~1,000 lines of preload/sync/context.json pipeline.

This replicates Tasklet's proven production architecture (see origin: `docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md`), validated via their verbatim system prompt, tool definitions, live sandbox investigation, and 11 questions answered by a Tasklet dev across 4 rounds.

## Problem Statement / Motivation

The current Vercel Sandbox architecture has three problems users hit regularly:

1. **Eager preload** — Downloads ALL files from Supabase Storage before every bash call (~1-2s latency), even when the command only touches one file
2. **No mid-session files** — Files from Google Drive downloads or other connection tools are invisible inside a running sandbox
3. **Complex sync pipeline** — ~1,000 lines of preload, hash-diff, and artifact sync code compensating for the lack of a shared filesystem

The FUSE mount solves all three at the infrastructure level. (see origin: Section 2, "Problem Frame")

## Proposed Solution

Blaxel Sandbox + rclone FUSE mount of Supabase Storage. One store (Supabase), two access paths (REST API for platform tools, S3 protocol for sandbox FUSE). Block storage replaces context.json. Model-driven `agent://` links replace artifact sync.

**Proven viable:** Two spikes confirmed (see origin: Section 7):
- Spike 1 (Apr 5): s3fs FUSE mount of Supabase Storage inside Blaxel sandbox — all tests pass
- Spike 2 (Apr 6): rclone with JWT session tokens — RLS enforcement confirmed, full interoperability

## Technical Approach

### Architecture

```
AGENT RUNNER (Vercel Functions — unchanged)
  │
  │  Platform tools → Supabase REST API (read_file, write_file, search_crm, etc.)
  │  Every tool result → saved to Supabase Storage as block file
  │
  │  bash tool → boots Blaxel Sandbox (lazy, first call only)
  │      ↓
  │  BLAXEL SANDBOX (Unikraft microVM)
  │  /agent/ ← rclone FUSE mount (Supabase Storage S3 protocol)
  │  /tmp/   ← fast local tmpfs
  │
  │  Scripts read tool results via FUSE:
  │    open('/agent/toolcalls/{runId}/{toolCallId}/result.json')
  │
  └── agent:// links in chat → frontend resolves to Supabase download
```

### Implementation Phases

#### Phase 1: Custom Docker Image + Sandbox Boot [~2 days]

Build and deploy a custom Blaxel sandbox template with rclone + fuse3 baked in.

**Tasks:**

- [ ] Create `infra/blaxel/Dockerfile` — Alpine base, copy sandbox-api binary, install rclone + fuse3 + python3 + pandas + openpyxl + matplotlib + LibreOffice + standard CLI tools
  - Match current Vercel golden snapshot toolset (see `src/lib/ai/system-prompt.ts:88-147` for preinstalled tools list)
- [ ] Create `infra/blaxel/entrypoint.sh` — start rclone mount as PID 1 via `exec`, sandbox-api backgrounded
  - rclone config written from env vars at boot: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_SESSION_TOKEN`, `S3_BUCKET`, `CLIENT_PREFIX`
  - Mount command: `rclone mount supabase:agent-files/{clientId}/ /agent --s3-list-version 2 --vfs-cache-mode writes --vfs-write-back 0s --allow-other --no-modtime --dir-cache-time 0s`
  - Health check: `while ! mountpoint -q /agent; do sleep 0.1; done`
- [ ] Create `infra/blaxel/blaxel.toml` — sandbox template config (memory: 4096, generation: mk3)
- [ ] Deploy template via `bl deploy` and note the IMAGE_ID
- [ ] Verify: boot sandbox from template, confirm `/agent/` mount is live, read/write a file

**Success criteria:** `bl run sandbox test-sandbox --path /process --data '{"command":"ls /agent/"}'` returns the client's file listing.

#### Phase 2: Rewrite create-lazy-bash-tool.ts [~2 days]

Replace the Vercel Sandbox initialization + bash-tool wrapper with Blaxel SDK + process.exec.

**Tasks:**

- [ ] Rewrite `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`:
  - Replace `import("@vercel/sandbox")` with `import { SandboxInstance } from "@blaxel/core"`
  - Replace `Sandbox.create({ source: snapshot })` with `SandboxInstance.createIfNotExists({ name, image, memory, region, envs })`
  - Inject S3 credentials as env vars: project_ref, anon_key, JWT session token, endpoint, bucket, client prefix
  - Mint JWT via `supabase.auth.admin.generateLink({ type: "magiclink", email: clientEmail })` then verify OTP to get `access_token` (see origin: R17)
  - Replace `createBashTool({ sandbox })` with direct `sandbox.process.exec({ name: toolCallId, command, waitForCompletion: true })`
  - Replace `sandbox.stop()` cleanup with `SandboxInstance.delete(name)` or let Blaxel idle-timeout handle it
  - Keep the lazy-init double-checked promise pattern (lines 84-94 — this is solid)
  - Remove: `getPreloadFiles`, `getContextEntries`, `buildContextJson`, `generateFileSummary`, `syncOutputArtifacts`, `artifactHashes`

- [ ] Implement fire-and-recover pattern (see origin: R33-R35):
  - Name processes by toolCallId to prevent double execution on Vercel retry
  - On execute: `POST /process` → get processId → stream logs via SSE
  - If process with name exists, check status instead of re-executing
  - Return stdout/stderr from process logs

- [ ] Update `src/lib/runner/run-agent.ts`:
  - Remove `toolResultAccumulator` (no longer needed for context.json)
  - Remove `getPreloadFiles` callback
  - Remove `getContextEntries` callback
  - Pass `clientId`, `supabase` (for JWT minting), and `runId` to new lazy bash tool
  - Keep `sandboxCleanup` in `onFinish`/`onError` (now calls sandbox delete or no-op)
  - Update `includeSandbox` to check for Blaxel config instead of `SANDBOX_GOLDEN_SNAPSHOT_ID`

- [ ] Update bash tool description in `src/lib/ai/system-prompt.ts`:
  - Change workspace references from `/vercel/sandbox/workspace` to `/agent/`
  - Add FUSE latency guidance: "Prefer /tmp/ for I/O-heavy work, copy final artifacts to /agent/home/"
  - Add block storage guidance: `<blocks>` section teaching model to read from `/agent/toolcalls/{runId}/{toolCallId}/result.json`
  - Add `<processing-data>` section: "Never hard-code data from tool results. Instead read from the filesystem."
  - Add download link guidance: "Output markdown links with `agent://` protocol for user-downloadable files"

**Success criteria:** Agent calls bash, sandbox boots with FUSE mount, command runs, stdout returned. No preload step. No sync step.

#### Phase 3: Block Storage [~1 day]

Every tool call result gets persisted as a file the sandbox can read via FUSE.

**Tasks:**

- [ ] Update `src/lib/storage/tool-blocks.ts`:
  - Modify `saveToolcallBlock()` to include `runId` in path: `{clientId}/toolcalls/{runId}/{toolCallId}/result.json`
  - Keep parallel upload of args.json + result.json
  - Fail-open: if upload fails, log warning but don't throw (see origin: R28)

- [ ] Wire block storage into tool execution in `src/lib/runner/run-agent.ts`:
  - In `onStepFinish` callback (lines 387-397), call `saveToolcallBlock()` for each tool result
  - Append `toolCallId` to the tool result object so the model sees it
  - Must be synchronous: block write completes BEFORE result is returned to LLM (see origin: R27)
  - NOTE: Current `onStepFinish` fires AFTER the result is returned to the model. Need to move block persistence INTO each tool's execute() function, or use AI SDK's tool result transform. Research the exact hook point during implementation.

- [ ] Verify via test: search_crm returns result with toolCallId → bash script reads `/agent/toolcalls/{runId}/{toolCallId}/result.json` via FUSE → content matches

**Success criteria:** Tool results appear as files under `/agent/toolcalls/` in the sandbox, readable by scripts.

#### Phase 4: Download Links + Frontend [~1 day]

Replace artifact sync with model-driven `agent://` links.

**Tasks:**

- [ ] Create `src/lib/chat/agent-protocol-resolver.ts`:
  - Regex: `agent:\/\/\/(.*)`
  - Resolver: `(clientId, path) => supabase.storage.from('agent-files').createSignedUrl('{clientId}/{path}', 60)`
  - Path allowlist: only serve `/home/` and `/uploads/` prefixes (see origin: R39)

- [ ] Update chat message renderer (`src/components/chat/message-bubble.tsx` or markdown renderer):
  - Detect `agent://` links in assistant message markdown
  - Replace with authenticated download URL on render
  - Use `decodeURIComponent` per path segment for encoding (see origin: R40)

- [ ] Update Telegram delivery pipeline:
  - Detect `agent://` URLs in outbound messages
  - Generate signed HTTPS download link or attach file directly via Telegram bot API (see origin: R38)

- [ ] Update system prompt with download link instructions (see origin: R25):
  - "After creating files for the user, output markdown links with `agent://` protocol"
  - "Spaces must be URL-encoded as `%20`"

**Success criteria:** Agent creates a CSV in sandbox, outputs `[results.csv](agent:///home/results.csv)` in chat, user clicks and downloads the file.

#### Phase 5: Delete Old Code + Tests [~1 day]

Clean removal of the Vercel Sandbox pipeline.

**Tasks:**

- [ ] Delete `src/lib/runner/tools/sandbox/build-preload-files.ts` (197 lines)
- [ ] Delete `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` (116 lines)
- [ ] Delete `src/lib/runner/tools/sandbox/build-context-json.ts` (80 lines)
- [ ] Delete `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts` (385 lines)
- [ ] Delete `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts` (96 lines)
- [ ] Delete `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts` (68 lines)
- [ ] Update `src/lib/runner/tools/sandbox/index.ts` to remove deleted exports
- [ ] Update `src/lib/runner/tools/sandbox/types.ts` to remove `SandboxPreloadFile`, `SandboxContextEntry` if unused
- [ ] Remove `@vercel/sandbox` and `bash-tool` from `package.json`
- [ ] Remove `SANDBOX_GOLDEN_SNAPSHOT_ID`, `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` from `.env.example`
- [ ] Add `BL_WORKSPACE`, `BL_API_KEY` (or rely on `bl login`) to `.env.example`
- [ ] Write new tests for `create-lazy-bash-tool.ts` covering: lazy init, sandbox creation, FUSE mount health check, process.exec wrapper, fire-and-recover pattern, cleanup
- [ ] Run QA surface 29 (sandbox scenarios) against new backend

**Success criteria:** `npm run test` passes. No references to `@vercel/sandbox` or `bash-tool` in codebase. QA surface 29 passes.

## Alternative Approaches Considered

1. **Stay on Vercel Sandbox, optimize preload** — Doesn't solve mid-session file gap. More patching on a fundamentally limited architecture. (see origin: Section 9)
2. **Blaxel Agent Drive instead of Supabase FUSE** — Requires private preview access. Adds a second storage system. Supabase S3 protocol gives us the same FUSE mount with zero data migration. (see origin: Section 2)
3. **MCP-native sandbox (Approach B)** — Connect agent directly to sandbox MCP endpoint for filesystem + process tools. More powerful but changes the LLM's tool interface, requires prompt retuning. Better as a follow-up. (see origin: Ideation Phase 2)

## System-Wide Impact

### Interaction Graph

```
Tool call → saveToolcallBlock() → Supabase Storage upload
                                      ↓
bash tool → SandboxInstance.createIfNotExists() → Blaxel API
                                      ↓
         → sandbox.process.exec() → Blaxel sandbox-api → shell process
                                      ↓
         → rclone FUSE → Supabase Storage S3 → same bucket
                                      ↓
         → Model outputs agent:// link → Frontend resolver → Supabase download
```

### Error & Failure Propagation

| Failure | Current behavior | New behavior |
|---|---|---|
| Blaxel sandbox boot fails | N/A | Tool returns error, no sandbox created. Retry on next bash call (initPromise resets). |
| rclone FUSE mount fails | N/A | Sandbox boots but `/agent/` is empty. Health check in entrypoint blocks until mount is ready. |
| Supabase Storage down | Preload fails, bash tool returns error | FUSE reads/writes fail with I/O errors. Scripts see `errno.EIO`. |
| Block write fails | N/A | Fail-open: tool result returned without toolCallId (R28). Model uses inline data. |
| JWT token expired mid-session | N/A | FUSE operations fail. Sandbox idle-timeout (~10 min) recycles VM with fresh token. |
| Vercel Function timeout on long bash | Command runs, result lost | Fire-and-recover: reconnect via processId, get full logs (R33). |

### State Lifecycle Risks

| State | Risk | Mitigation |
|---|---|---|
| Block files in Supabase Storage | Accumulate ~2MB/month per client | Scoped by runId. No cleanup needed. (see origin: R30) |
| Sandbox VM | Blaxel idle timeout kills VM after ~10 min | Entrypoint is idempotent — fresh VM gets fresh mount. `/agent/` data survives (cloud-backed). |
| JWT session token | 1-hour expiry | Sessions rarely exceed 30 min. Sandbox recycle on idle gives fresh token. Token rotation deferred. |

### API Surface Parity

| Interface | Change needed? |
|---|---|
| `read_file` / `write_file` tools | No — continue hitting Supabase REST API |
| `bash` tool (LLM-facing) | No — same input/output shape |
| Chat message renderer | Yes — add `agent://` link resolution |
| Telegram bot delivery | Yes — add `agent://` link rewriting |
| System prompt sandbox section | Yes — rewrite for FUSE mount + block storage |

### Integration Test Scenarios

1. **Mid-session file visibility:** Google Drive download → file appears in sandbox on next bash call (without reboot)
2. **Block storage round-trip:** search_crm → block file created → bash script reads it via FUSE → correct data
3. **Download link end-to-end:** bash creates CSV → model outputs `agent://` link → frontend resolves → user downloads correct file
4. **Fire-and-recover:** Start 60s bash command → kill Vercel Function → restart → reconnect to process → get full output
5. **Subagent sandbox sharing:** Parent installs package → subagent uses it → same VM confirmed

## Acceptance Criteria

### Functional Requirements
- [ ] Agent can run bash commands in Blaxel sandbox with FUSE-mounted `/agent/`
- [ ] Mid-session files from connection tools visible in running sandbox (R13)
- [ ] Files written in sandbox immediately readable via platform `read_file` tool (R14)
- [ ] Tool results saved as block files, readable in sandbox scripts via FUSE (R5-R9)
- [ ] Model outputs `agent://` links for generated files, users can download them (R22-R26)
- [ ] Telegram delivery rewrites `agent://` links to working download URLs (R38)
- [ ] Download endpoint only serves `/home/` and `/uploads/` paths (R39)
- [ ] Subagents share parent sandbox (R36-R37)

### Non-Functional Requirements
- [ ] Sandbox boot time < 3s (benchmark against Vercel's ~2s)
- [ ] Block storage write < 200ms per tool call (synchronous, absorbed into tool latency)
- [ ] FUSE read latency ~200ms per file open (acceptable per Tasklet benchmarks)
- [ ] No change to prompt cache behavior (R11)

### Quality Gates
- [ ] All QA surface 29 scenarios pass against new backend
- [ ] ~1,000 lines of preload/sync code deleted
- [ ] `@vercel/sandbox` and `bash-tool` removed from dependencies
- [ ] New tests for lazy bash tool, block storage, `agent://` resolver
- [ ] Security: JWT minted via `auth.admin.generateLink()`, no signed URLs in sandbox-readable paths (R17-R18)

## Dependencies & Prerequisites

1. Blaxel account and workspace (`sudner`) — already set up
2. `@blaxel/core` SDK — already installed (v0.2.78)
3. Supabase S3 access keys — generated (rotate after spike)
4. Custom Docker image deployed to Blaxel — Phase 1 deliverable
5. Supabase Auth service-role client for JWT minting — already available in runner

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Blaxel reliability issues | Medium | High — sandbox outages = no code execution | Keep Vercel Sandbox code on a branch for quick rollback. Feature flag on `SANDBOX_PROVIDER` env var. |
| rclone VFS edge cases (partial writes, rename) | Low | Medium — corrupted files | System prompt teaches "write to /tmp/, copy to /agent/home/". Non-atomic renames documented in origin D11. |
| JWT expiry during long sessions | Low | Medium — FUSE operations fail silently | Sessions rarely exceed 30 min. Sandbox idle recycle gives fresh token. Monitor for auth errors in Langfuse traces. |
| Model ignores block files (uses inline data) | High | Low — works fine, just doesn't use the new path | Accepted trade-off (origin R10). Truncation is future work that forces block file usage. |
| `agent://` false negatives (model forgets to link files) | Medium | Low — prompt quality issue | Same as Tasklet. No auto-discovery by design (origin R26). |

## Future Considerations

- **Truncation + context compaction** — When implemented, makes block storage the primary data path (model forced to read from filesystem). Currently deferred (origin R10-R11).
- **Token rotation** — If sessions grow beyond 1 hour, implement token file watcher pattern (~50 lines, matches Tasklet's `watch_config_for_token`). Currently deferred.
- **Blaxel egress allowlisting** — Check if available (origin Q5). Would add a security layer beyond Tasklet's architecture.
- **MCP-native sandbox (Approach B)** — Give agent direct filesystem + process tools from sandbox MCP endpoint. Deeper simplification but changes tool interface. Evaluate after Blaxel is stable in production.

## Sources & References

### Origin
- **Origin document:** [docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md](../ideations/2026-04-04-blaxel-sandbox-migration-requirements.md) — 40 requirements, 11 drift items, 2 spikes, 11 Tasklet dev questions answered. Key decisions: Supabase as sole store, rclone for FUSE, block storage replaces context.json, agent:// protocol for downloads, fire-and-recover for bash execution.

### Internal References
- Sandbox code: `src/lib/runner/tools/sandbox/` (6 files, ~714 lines)
- Runner integration: `src/lib/runner/run-agent.ts:317-350` (lazy bash tool wiring)
- Tool blocks: `src/lib/storage/tool-blocks.ts` (saveToolcallBlock, 66 lines)
- System prompt: `src/lib/ai/system-prompt.ts:88-147` (SANDBOX_PROMPT)
- Agent paths: `src/lib/storage/agent-paths.ts` (toStoragePath/toModelPath)
- Protected paths: `src/lib/storage/agent-files.ts:69-91` (assertWritable)
- Tenant isolation review: `docs/product/reviews/2026-04-06-sandbox-tenant-isolation-review.md`

### External References
- [Supabase S3 Authentication](https://supabase.com/docs/guides/storage/s3/authentication)
- [Supabase S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Blaxel SDK docs](https://docs.blaxel.ai)
- [rclone mount docs](https://rclone.org/commands/rclone_mount/)

### Related Work
- Vercel Sandbox migration handover: `docs/product/handovers/2026-03-28-vercel-sandbox-migration-handover.md`
- Sandbox workspace preload tasklist: `docs/product/tasks/2026-03-30-pr64-sandbox-workspace-preload-tasklist.md`
- Tasklet reference architecture: `roadmap docs/.../sandboxes/tasklet-sandbox-architecture-trace.md`
- Tasklet FUSE investigation: `roadmap docs/.../sandboxes/tasklet-fuse-mount-investigation.md`
