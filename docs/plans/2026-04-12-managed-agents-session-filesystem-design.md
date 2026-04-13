---
title: Managed Agents Session Filesystem Design
date: 2026-04-12
status: proposed
owners:
  - codex
  - seth
---

# Managed Agents Session Filesystem Design

## Summary

Sunder currently mixes two different file systems during Managed Agents execution:

- Anthropic's sandbox/session filesystem (`/mnt/session/uploads/*`, `/mnt/session/outputs/*`)
- Sunder's durable Supabase-backed filesystem (`/agent/*`)

This creates prompt ambiguity and tool misuse. The agent keeps treating `/agent/*` like a writable execution workspace even though Anthropic's built-in sandbox tools cannot see it. Recent failures around CSV analysis and output generation are all downstream of this mismatch.

This design adopts a stricter model:

- Anthropic's sandbox filesystem owns all ephemeral execution.
- Sunder's `/agent/*` filesystem owns all durable product state.
- Session outputs remain session-only by default.
- Crossing from session output to durable state requires an explicit persistence step.

This matches Anthropic's official Managed Agents references:

- mounted inputs under `/mnt/session/uploads/*`
- generated artifacts written to `/mnt/session/outputs/*`
- persisted session outputs retrieved through the Files API with `scope_id=<session_id>`

## Recommended Approach

Three approaches were considered:

1. Session filesystem for execution, `/agent/*` for durable state.
2. Auto-save every session output into `/agent/home/*`.
3. Let the model decide what to persist.

The recommended approach is option 1.

Option 2 creates storage bloat and weakens the meaning of "saved". Option 3 leaves too much product behavior up to prompt drift. Option 1 is the cleanest architecture because it gives each filesystem one job:

- `/mnt/session/*` is for doing work
- `/agent/*` is for keeping work

This aligns with Anthropic's cookbook and reduces the number of places where the model has to reason about backend implementation details.

## User Workflow

### Upload and analyze now

When a user uploads a file in chat:

1. Sunder stores the raw upload durably in `uploads/` for auditability and later reuse.
2. The same file is mounted into the current Anthropic session at `/mnt/session/uploads/<filename>`.
3. The agent uses built-in sandbox tools to inspect, parse, or transform the file.

The mounted session file is the execution copy. The durable upload is not the working file.

### Generate a result

If the agent generates a script, cleaned CSV, HTML report, or other artifact during the run:

- it writes that artifact to `/mnt/session/outputs/*`
- it does not write temporary working files to `/agent/tmp/*`
- it does not use `storage_write` on `/mnt/session/*`

### Save for later

If the user says "save this", "keep this", or "store this in Sunder":

1. Sunder promotes a chosen file from `/mnt/session/outputs/*`
2. The file is persisted into `/agent/home/*`
3. It becomes part of the user's durable file workspace

### Attach to CRM

If the user says "attach this to the deal/contact/company":

1. The file must already exist durably under `/agent/home/*` or another durable `/agent/*` path
2. The CRM attachment tool links/copies that durable file into `attachments/...`

Session files are not attached directly to CRM.

## Architecture

## Filesystem roles

### Anthropic session filesystem

- Inputs: `/mnt/session/uploads/*`
- Outputs: `/mnt/session/outputs/*`
- Ownership: Anthropic Managed Agents session/container
- Tools: built-in `read`, `write`, `edit`, `bash`, `glob`, `grep`
- Lifetime: tied to the session

### Sunder durable filesystem

- Durable paths: `/agent/home/*`, `/agent/memory/*`, `/agent/uploads/*`, `/agent/skills/*`
- Ownership: Supabase Storage + Sunder app semantics
- Tools: `storage_read`, `storage_write`, CRM attachment tools, memory tools
- Lifetime: durable across runs and chats

### Product publishing layer

- CRM attachments
- download links
- user-visible Files surfaces

This layer should only operate on durable files, not sandbox-only paths.

## Tool responsibilities

### Built-in Anthropic tools

Use built-in tools for:

- inspecting mounted uploads
- creating temp scripts
- transforming files
- writing session outputs
- any scratch work during the run

### Sunder custom tools

Use custom tools for:

- durable reads and writes under `/agent/*`
- memory files
- CRM attach/publish actions
- product-specific persistence

Custom storage tools should not be used as the session scratchpad.

## New bridge capability

Add an explicit bridge tool:

### `persist_session_output`

Proposed input:

- `session_path`: source path under `/mnt/session/outputs/*`
- `target_path`: destination under `/agent/home/*`
- optional `filename` or display name

Rules:

- source must be inside `/mnt/session/outputs/*`
- target must be inside `/agent/home/*`
- no arbitrary source or target namespaces

Implementation:

1. After the session reaches idle, resolve session files using Anthropic `files.list(scope_id=session_id)`.
2. Match the requested session output by filename/path convention.
3. Download with `files.download(file_id)`.
4. Upload to Supabase Storage at the requested durable destination.
5. Return the durable `/agent/home/*` path.

This keeps the boundary explicit and auditable.

## Prompt and Tool Contract

The agent prompt and tool descriptions need a stricter contract:

- "Use built-in tools for `/mnt/session/*`."
- "Use `storage_*` only for durable `/agent/*` paths."
- "Session outputs are not saved by default."
- "If the user wants to keep a generated file, persist it into `/agent/home/*`."
- "Attach only durable files to CRM."

Remove any prompt language that implies `/agent/*` is the writable sandbox filesystem.

## Error Handling

Errors should direct the next correct action.

### Wrong tool on session path

If the agent calls `storage_read` or `storage_write` on `/mnt/session/*`, return:

- a clear explanation that `/mnt/session/*` is the sandbox filesystem
- instruction to use built-in tools for sandbox files
- instruction to persist outputs into `/agent/home/*` if the user wants durability

### Attempt to attach session file directly

Return an error that says:

- session files must be persisted first
- then attached from durable storage

### Missing session output

If the app cannot find the requested file in session outputs after idle:

- retry Files API listing briefly to account for indexing lag
- then fail with a message that the expected output was not persisted by the session

## Edge Cases

### Mid-run uploads

Mid-run uploads should:

- be stored durably in `uploads/`
- be mounted into the existing session under `/mnt/session/uploads/*`
- be treated as new session inputs, not durable working files

### Duplicate filenames

Mounted filenames may be de-duplicated for the sandbox path. The UI should preserve the user's original display name where possible.

### Session-only outputs

Outputs may remain session-only if the user never asks to save them. They are retrievable through Anthropic's Files API for that session, but they are not part of the long-term Sunder workspace.

### Product surfaces

Files shown in CRM or Files UI should distinguish:

- uploaded input
- saved artifact
- CRM attachment

They should not expose sandbox-only paths directly.

## Testing

Add or update coverage for:

1. Upload -> analyze using `/mnt/session/uploads/*`
2. Generate output into `/mnt/session/outputs/*`
3. Persist session output into `/agent/home/*`
4. Attach persisted file to CRM
5. Reject `storage_*` on `/mnt/session/*`
6. Ensure session outputs are listed/downloaded via Anthropic Files API after idle
7. Mid-run file upload mounts correctly onto existing session

Add at least one end-to-end regression scenario for the CSV cleanup flow:

- upload raw CSV
- built-in `read` on mounted file
- built-in `write` or `bash` to create cleaned CSV in `/mnt/session/outputs/*`
- optional persistence into `/agent/home/*`

## Implementation Plan

1. Tighten prompt/tool descriptions so the sandbox vs durable split is explicit.
2. Remove model guidance that encourages `/agent/*` as a temp execution space.
3. Add `persist_session_output` bridge tool.
4. Implement server-side Anthropic Files API retrieval for session outputs.
5. Update CRM/file actions to operate on durable files only.
6. Add tests for session output persistence and session-vs-durable path misuse.

## Unresolved Questions

1. What exact file naming contract should `persist_session_output` use when the same filename appears multiple times in one session?
2. Should session-only outputs be visible in the UI before they are saved, or only mentioned in assistant text?
3. Do we want a generic "Save this output" UI affordance in chat, or should persistence stay fully agent/tool-driven?
4. Should uploaded inputs remain in `/agent/uploads/*` forever, or do we need retention/cleanup rules later?
