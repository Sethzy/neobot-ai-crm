# Sunder-Verified Behavior: Context Recovery and Task List Semantics

> **Status:** Active reference for Sunder v1
> **Compiled:** 2026-02-21
> **Source quality:** Tasklet system prompt + Tasklet tool schemas + runtime observation from Tasklet team

## Purpose

This file captures behavior clarifications confirmed by Tasklet and adopted for Sunder v1 implementation.

Important boundary:

1. Upstream Tasklet verbatim files remain unchanged.
2. This document is a Sunder-owned addendum inside the Tasklet reference package.
3. If this file conflicts with a Tasklet verbatim file, verbatim source wins unless Sunder records a delta in `../../architecture/01-Tasklet Delta Register.md`.

---

## 1) Context Recovery Contract

### Trigger condition

When conversation context shows `<context-removed>` markers, the agent must treat in-thread data as incomplete.

Two known system behaviors:

1. Partial truncation of a large tool result.
2. Eviction of older tool-call sequences to save context space.

### Recovery path (required)

For each referenced `blockId`:

1. Read full result from `/agent/toolcalls/{blockId}/result`.
2. If argument fidelity matters, read `/agent/toolcalls/{blockId}/args`.
3. Use recovered artifacts as the source of truth, not truncated in-thread snippets.

### Filesystem surface (read-only)

1. `/agent/toolcalls/{blockId}/args`
2. `/agent/toolcalls/{blockId}/result`
3. `/agent/toolcalls/{blockId}/info`
4. `/agent/toolcalls/{blockId}/attachment_N.ext`

### Fallback policy for Sunder (explicit product decision)

Tasklet confirms recovery mechanism, but not missing-artifact behavior. Sunder v1 policy:

1. If `result` read fails but `args` exists, re-run the original tool call when safe.
2. If safe re-run is not possible, do not invent missing data; return a constrained/partial outcome and request guidance.
3. For autonomous/trigger work blocked by unrecoverable artifacts, create/update a tracking task with resume details and notify user once.

### Known unknowns (not platform-verified)

1. Toolcall artifact retention TTL.
2. Storage/eviction guarantees across conversations.
3. Cross-session access behavior for old `blockId` values.
4. Attachment-size retention guarantees.

---

## 2) Task List Semantics Contract

### Tools and schema semantics

1. `manage_tasks` supports `add`, `update`, `delete`.
2. `list_tasks` returns all tasks, or filters by `taskIds`.
3. `add` cannot include `taskId`; system assigns it.
4. `update` and `delete` require `taskId`.
5. `delete` is the done/completed action (no separate completed state).

### Product semantics for Sunder

1. Task list is tracking-only and user-visible.
2. Tasks do not trigger execution, schedule work, or cause side effects.
3. Open task exists; completed task is removed.
4. `payload` is the structured handoff surface for blocked/resumable work.

### Operational usage rules

1. Create tasks for multi-step work.
2. Create periodic tasks during long iteration batches (roughly one per ~10 items).
3. Update payload when blocked (what is blocked, what to do next).
4. Delete task immediately when done.

### Persistence expectation

Tasklet runtime observations indicate tasks remain visible across invocations/runs and appear in agent state summaries.

Unknowns not yet guaranteed by platform docs:

1. Maximum task count.
2. Ordering guarantees for task listing.

---

## 3) Parity Acceptance Test Set (Required for Sunder v1)

### Context recovery tests

1. Single-result truncation: recover full `result` and answer from recovered data.
2. Evicted call sequence: recover omitted `blockId` results and answer correctly.
3. Multi-`blockId` eviction: recover all referenced calls, not just first.
4. Args recovery: read `/args` when the historical question is about original inputs.
5. Missing `blockId` handling: no hallucination; graceful fallback with user guidance.

### Task semantics tests

1. Persistence across runs: added task appears in later invocation.
2. No automation side effects: task creation does not execute any action.
3. Delete equals done: deleted task disappears from `list_tasks`.
4. Batch operation behavior: mixed add/update/delete in one call behaves consistently.
5. Payload continuity: structured payload remains intact for resume flow.

---

## 4) Canonical Upstream References

1. `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`
2. `references/tasklet/tools/built-in/12-manage_tasks.md`
3. `references/tasklet/tools/built-in/13-list_tasks.md`
4. `references/tasklet/core-architecture/02-state-surfaces-system-vs-agent.md`
