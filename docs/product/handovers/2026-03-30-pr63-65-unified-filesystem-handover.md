# Handover: PRs 63-65 — Unified Agent Filesystem + Sandbox Preload + Composio File Bridge

**Date:** 2026-03-30
**Author:** Seth + Claude
**Review time:** ~45-60 min
**Status:** Design complete, ready for architecture review before implementation

---

## What to review

Three design docs that form a dependency chain. Each builds on the previous. Review in order.

| PR | Design doc | What it does (one sentence) |
|---|---|---|
| 63 | `docs/plans/2026-03-30-unified-agent-filesystem-design.md` | Route all files into one bucket so the agent can find everything |
| 64 | `docs/plans/2026-03-30-sandbox-workspace-preload-design.md` | Preload the full agent workspace into sandbox at boot so bash can process any file |
| 65 | `docs/plans/2026-03-30-composio-file-bridge-design.md` | Make Composio connection tools save downloaded files to agent storage instead of dumping JSON into model context |

---

## Context: Why this exists

Today Sunder has three disconnected storage buckets (`chat-attachments`, `client-files`, `agent-files`). Uploads, generated PDFs, and sandbox artifacts each go to different places. The agent can only find files in `agent-files` — everything else is unreachable after the run that created it.

The sandbox is also disconnected — it only gets current-message attachments at boot. Past uploads, agent-created files, and connection downloads are invisible to bash/Python.

Tasklet and Fintool solve this with FUSE mounts (cloud storage mounted directly into the sandbox filesystem). We can't do FUSE on Vercel Sandbox, so we use the same pattern Vercel's own reference repos use: preload files at sandbox boot, sync results back after each bash call.

---

## Architecture model

```
Supabase Storage (source of truth)
agent-files/{clientId}/
├── uploads/        ← user uploads (read-only to agent)
├── home/           ← agent outputs, sandbox artifacts, generated PDFs
├── memory/         ← SOUL.md, USER.md, MEMORY.md, topic files
├── subagents/      ← trigger instruction files
├── skills/         ← system + connection skills
└── toolcalls/      ← tool call block storage

        │                           ▲
        │ preload at boot           │ sync after each bash
        ▼                           │

Vercel Sandbox (ephemeral, disposable)
/workspace/
├── input/context.json              ← tool results for scripts
├── agent/uploads/                  ← all user uploads
├── agent/home/                     ← agent working files
├── skills/                         ← skill files
└── /tmp/                           ← scratch (dies with sandbox)
```

**Key principle:** Cloud storage is the source of truth. Sandbox is a throwaway copy. Agent can create/modify files in sandbox but cannot permanently delete from cloud. This is the industry-standard pattern (Vercel, Cloudflare, Browser-Use all do this).

---

## Questions for the reviewer

### PR 63 (Unified filesystem)

1. **Signed URL / storagePath flow:** PR 63 introduces `storagePath` in message parts and a `/api/files/download` endpoint (section 9 of design). Verify the schema changes cover all message part schemas: `chat-composer.tsx`, `chat/schema.ts`, `runner/schemas.ts`, `chat/schemas.ts`, and `telegram/media.ts`. Check that the chat attachment renderer correctly falls back to `url` for legacy messages without `storagePath`.

2. **Upload filename format:** Design says `{timestamp}-{original-filename}` instead of current `{timestamp}-{uuid}`. Any concerns with user-provided filenames in storage paths? We sanitize, but worth checking the sanitization is sufficient.

3. **Sandbox persistence model:** We switch from auto-syncing everything in `output/` to only syncing files in `/workspace/agent/home/`. The agent must explicitly `cp` final results there. Tasklet ships this pattern to production. Are you comfortable with the "agent forgets to copy" risk?

4. **Vault cleanup completeness:** PR 63 depends on PR 60 (vault teardown). Verify the design doesn't reference vault anywhere.

### PR 64 (Sandbox preload)

5. **Performance at scale:** Preloading all uploads + home files adds ~2-3s for a typical early client. What's the upper bound we're comfortable with? Should we add a file count or total size cap?

6. **Redundant attachment preload removal:** PR 64 removes the current-message attachment download loop from `buildPreloadFiles()` since uploads are now preloaded from storage. Only `input/context.json` remains. Does anything else depend on the `/workspace/input/` path for attachments? Check sandbox skill templates and system prompt references.

7. **Recursive directory listing:** The preload uses `bucket.list()` which is non-recursive. If `home/` has subdirectories (e.g. `home/scripts/`), those files won't be preloaded. Should we use recursive listing? Check if `AgentFileClient.listDirectory()` handles this and whether we should reuse it.

### PR 65 (Composio file bridge)

8. **Composio TypeScript SDK file handling:** Design has been updated to target the actual installed `@composio/core@0.6.4` API. The TS SDK uses `autoUploadDownloadFiles: boolean` (default `true`, no config change needed) and its `FileToolModifier` rewrites results to `{ uri, file_downloaded, s3url, mimeType }`. Verify this matches what you see in `node_modules/@composio/core/dist/utils/modifiers/FileToolModifier.node.mjs`.

9. **File detection robustness:** We walk the result for objects matching `{ uri, file_downloaded }` shape (one level deep). Is this sufficient, or could the downloaded file be nested deeper? Check a few actual Composio tool result shapes by testing with a connected Google Drive account.

10. **Sandbox getter pattern:** `getSandbox()` is exported from `createLazyBashTool` (added in PR 64, section 4) and passed into `loadActivatedConnectionTools()`. This couples connection tools to sandbox awareness. Is there a cleaner way, or is this acceptable?

11. **Upload direction:** PR 65 also handles agent → connection uploads (detecting `/agent/` paths in arguments, downloading from storage, passing local path to Composio). Review whether the argument detection (`args.file_to_upload`) is robust across different connection tools, or if we need a schema-based approach (check for `file_uploadable: true` in the tool schema instead).

---

## Key design decisions already made

| Decision | Choice | Why |
|---|---|---|
| One bucket for everything | `agent-files` | Matches Tasklet/Fintool. Agent can browse all files. |
| Uploads read-only | `assertWritable()` blocks writes to `uploads/` | Matches Tasklet. Protects user files from agent. |
| Sandbox persistence | Agent explicitly saves to `/workspace/agent/home/` | Matches Tasklet's FUSE pattern. No junk from scratch files. |
| Preload everything at boot | Download uploads/ + home/ on first bash call | "Poor man's FUSE mount." Same result as Vercel reference repos. |
| One-way sync only (sandbox → cloud) | Sync creates/updates but never deletes | Industry standard (Vercel, Cloudflare, Browser-Use). Agent can't destroy source of truth. |
| No migration | All existing bucket data is test data | Pre-launch, no real users. |

---

## Reference material

Read these in order of relevance:

1. **Tasklet v2 system prompt** — `roadmap docs/.../tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` (lines 53-68 for filesystem, 183-188 for sandbox persistence guidance)
2. **Tasklet Google Drive tools** — `roadmap docs/.../tasklet tools/gmail-connection/google-drive.md` (tools 12-13 for upload/download with `/agent/` paths)
3. **Fintool lessons** — `roadmap docs/.../Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md` (S3-first architecture, sandbox mounts, skill shadowing)
4. **Current upload flow** — `app/api/files/upload/route.ts`, `src/lib/runner/tools/sandbox/build-preload-files.ts`, `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
5. **Current storage tools** — `src/lib/runner/tools/storage/index.ts`, `src/lib/storage/agent-files.ts`
6. **Current Composio tools** — `src/lib/composio/activated-tools.ts`, `src/lib/composio/client.ts`
7. **Sandbox comparison** — `roadmap docs/.../sandboxes/sandbox-environments-comparison.md`
8. **Harrison Chase two patterns** — `roadmap docs/.../sandboxes/two-patterns-agents-sandboxes-harrison-chase.md`

---

## Files changed per PR (estimated)

**PR 63 (~12 files):**
- `app/api/files/upload/route.ts` — bucket + path change, add storagePath to response
- `app/api/files/download/route.ts` — NEW endpoint for on-demand signed URL resolution
- `src/lib/channels/telegram/media.ts` — bucket + path change
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` — OUTPUT_DIR + artifactPath change
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — sandbox instructions
- `src/lib/runner/tools/sandbox/build-preload-files.ts` — create agent/home/ dir, fetch by storagePath
- `src/lib/storage/agent-files.ts` — assertWritable uploads check
- `src/lib/ai/system-prompt.ts` — filesystem tree, tool-usage, sandbox prompt, sunder:// link guidance
- Chat message component — resolve storagePath on render for attachment previews
- Chat markdown renderer — rewrite sunder:// links to /api/files/download
- Message part schemas — add storagePath field (chat-composer, chat/schema, runner/schemas, chat/schemas)
- Cleanup: remove chat-attachments/client-files references

**PR 64 (~4 files):**
- `src/lib/runner/tools/sandbox/build-preload-files.ts` — add uploads/ + home/ preload, remove attachment loop, remove fileParts param
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — update instructions, cap file tree in prompt, export getSandbox getter
- `src/lib/runner/tools/sandbox/types.ts` — update LazyBashToolResult interface
- `src/lib/runner/run-agent.ts` — remove fileParts from preload options

**PR 65 (~2 files):**
- `src/lib/composio/activated-tools.ts` — file bridge wrapper with findDownloadedFile helper (download + upload directions)
- `src/lib/runner/run-agent.ts` — pass fileClient + getSandbox to loadActivatedConnectionTools
