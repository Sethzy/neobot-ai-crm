# Design: Absolute Agent Paths (`/agent/` prefix)

## Problem

Sunder's agent tools use workspace-relative paths (`memory/MEMORY.md`, `vault/doc.pdf`, `skills/connections/xxx/SKILL.md`). The model has to infer "relative to what?" — leading to occasional path confusion and wasted tool calls.

Tasklet uses absolute paths rooted at `/agent/` (`/agent/home/SOUL.md`, `/agent/skills/...`). The model has zero ambiguity. Every tool, system prompt reference, and system-reminder uses the same path space.

## Approach: Model-Boundary Translation Only

Change paths **only where the model sees them**. Internal storage, DB, frontend, and API routes stay relative. A thin strip/prefix layer at the tool boundary handles conversion.

```
Model sees:     /agent/memory/MEMORY.md
                    ↓ (strip prefix)
Internal code:  memory/MEMORY.md
                    ↓ (resolve)
Supabase:       {clientId}/memory/MEMORY.md
```

## Scope

### In scope (model-facing, ~13 files)

**Tool boundary — inputs & outputs:**

| File | What changes |
|------|-------------|
| `src/lib/runner/tools/storage/index.ts` | `read_file` + `write_file`: param descriptions → absolute with examples. Execute strips `/agent/` on input. All output `path` fields wrapped with `toModelPath()`. `search_knowledge` results prefixed with `/agent/`. |
| `src/lib/runner/tools/triggers/setup-trigger.ts` | Strip `/agent/` from `instruction_path` before DB insert. Prefix `instruction_path` on success response with `toModelPath()`. |
| `src/lib/runner/tools/triggers/manage-triggers.ts` | Prefix `instruction_path` with `toModelPath()` in all responses (list, view, edit). Prefix `instruction_path` in simulate's `buildTriggerEventMessage` call. |
| `src/lib/runner/tools/connections/manage-tools.ts` | Skill file hint in response: prefix with `/agent/` |
| `src/lib/runner/tools/connections/create-connection.ts` | Skill file reference in description: prefix with `/agent/` |
| `src/lib/runner/tools/subagents/run-subagent.ts` | Strip `/agent/` from `path` input before downloading file |

**Trigger event messages:**

| File | What changes |
|------|-------------|
| `src/lib/triggers/executor.ts` | Wrap `payload.instructionPath` with `toModelPath()` before passing to `buildTriggerEventMessage()`. |

**System prompt & context assembly:**

| File | What changes |
|------|-------------|
| `src/lib/ai/system-prompt.ts` | All path references: `SOUL.md` → `/agent/SOUL.md`, `memory/` → `/agent/memory/`, `vault/` → `/agent/vault/`, `skills/...` → `/agent/skills/...` |
| `src/lib/runner/system-reminder.ts` | Skill path construction: `skills/connections/X/SKILL.md` → `/agent/skills/connections/X/SKILL.md` |
| `src/lib/ai/platform-instructions.ts` | `<state-directory>`: `state/` → `/agent/state/`. `<context-management>`: `toolcalls/{id}/...` → `/agent/toolcalls/{id}/...` |
| `src/lib/runner/toolcall-artifacts.ts` | `buildContextRemovedMarker()`: `path:` value wrapped with `toModelPath()` |
| `src/lib/autopilot/constants.ts` | `AUTOPILOT_INSTRUCTION_PROMPT`: all bare file references → `/agent/` prefixed (`MEMORY.md` → `/agent/MEMORY.md`, `USER.md` → `/agent/USER.md`, `memory/preferences.md` → `/agent/memory/preferences.md`, etc.) |

### Out of scope (no changes needed)

| Layer | Why unchanged |
|-------|--------------|
| `src/lib/storage/agent-files.ts` | Internal infra. Keeps using relative paths. |
| `src/lib/memory/constants.ts` | Internal constants. No model exposure. |
| `src/lib/memory/loader.ts`, `storage.ts`, `bootstrap.ts`, `templates.ts` | All internal. Use constants, never model-facing. |
| `src/lib/storage/skill-files.ts` | Internal path construction for Supabase. |
| DB (`vault_files.storage_path`, `agent_triggers.instruction_path`) | Stores relative paths. No migration needed. |
| API routes (`app/api/memory/`) | Internal API, not model-facing. |
| Frontend components | User sees clean names (`SOUL.md`, not `/agent/SOUL.md`). No change. |
| `src/lib/runner/tools/utility/send-message.ts` | Stub tool — delivery doesn't work. `attachments` param deferred until tool is functional. |
| Tests | Update only tests that assert model-facing output. |

## Implementation

### 1. New utility: `src/lib/storage/agent-paths.ts`

```ts
/** Virtual root that the model sees for all agent file operations. */
export const AGENT_ROOT = "/agent/";

/** Strip /agent/ prefix to get internal storage-relative path. */
export function toStoragePath(modelPath: string): string {
  if (modelPath.startsWith(AGENT_ROOT)) {
    return modelPath.slice(AGENT_ROOT.length);
  }
  // Tolerate relative paths for backwards compatibility during transition
  return modelPath;
}

/** Add /agent/ prefix so the model sees absolute paths. */
export function toModelPath(storagePath: string): string {
  if (storagePath.startsWith(AGENT_ROOT)) {
    return storagePath; // already absolute
  }
  return `${AGENT_ROOT}${storagePath}`;
}
```

### 2. Canonical output rule

**Permissive input, canonical output.** Every tool and context surface follows this contract:

- **Input:** Accept both `/agent/foo` and `foo` (permissive `toStoragePath()`)
- **Output:** Always return `/agent/foo` (canonical `toModelPath()` on every path in every response)

This means even if the model sends a relative path, it gets back an absolute path — converging the model onto one dialect.

### 3. Tool changes

**read_file:**
```ts
// Param description update
path: "Absolute path to the file or directory (e.g., '/agent/memory/MEMORY.md' or '/agent/vault/')"

// Execute: strip prefix before internal call, canonicalize output
const internalPath = toStoragePath(path);
const modelPath = toModelPath(internalPath);
// ...all fileClient calls use internalPath
// ...all return objects use modelPath for the `path` field
```

**write_file:**
```ts
// Param description update
path: "Absolute path to the file (e.g., '/agent/memory/topic.md' or '/agent/vault/notes.md')"

// Execute: strip prefix, canonicalize output
const internalPath = toStoragePath(path);
const normalizedPath = normalizeWorkspacePath(internalPath, false);
const modelPath = toModelPath(normalizedPath);
// ...all return objects use modelPath for the `path` field
```

**search_knowledge:**
```ts
// Results: prefix paths in response
results: (data ?? []).map(r => ({ ...r, storage_path: toModelPath(r.storage_path) }))
```

**setup_trigger:**
```ts
// Strip prefix before DB storage
const internalInstructionPath = toStoragePath(instruction_path);
// Prefix instruction_path on success response
trigger: { ...data, instruction_path: toModelPath(data.instruction_path), ... }
```

**manage_active_triggers:**
```ts
// Prefix in formatTriggerForResponse — covers list, view, edit, simulate responses
instruction_path: toModelPath(trigger.instruction_path)
```

**trigger executor (executor.ts):**
```ts
// Prefix instruction_path before injecting into trigger-event message
instructionPath: toModelPath(payload.instructionPath),
```

**manage_activated_tools_for_connections:**
```ts
// Skill file hint
skills: `Check for a connection skill file at: /agent/skills/connections/${connection.id}/SKILL.md - ...`
```

**create_new_connections:**
```ts
// Description references skill path
"If /agent/skills/system/creating-connections/SKILL.md exists, ..."
```

**run_subagent:**
```ts
// Strip prefix before downloading file
const internalPath = toStoragePath(path);
```

### 4. System prompt changes

```diff
- SOUL.md — Read-only. Your core personality and behavior.
+ /agent/SOUL.md — Read-only. Your core personality and behavior.

- USER.md — Read+write. What you know about the user.
+ /agent/USER.md — Read+write. What you know about the user.

- MEMORY.md — Your working notebook.
+ /agent/MEMORY.md — Your working notebook.

- Browse topic files: read_file("memory/")
+ Browse topic files: read_file("/agent/memory/")

- Files under vault/ are indexed in the Knowledge Base
+ Files under /agent/vault/ are indexed in the Knowledge Base

- skills/system/creating-connections/SKILL.md
+ /agent/skills/system/creating-connections/SKILL.md
```

### 5. System reminder changes

```diff
- skills/connections/${connectionId}/SKILL.md
+ /agent/skills/connections/${connectionId}/SKILL.md
```

### 6. Platform instructions changes

```diff
- Use the state/ directory for ephemeral working files
+ Use the /agent/state/ directory for ephemeral working files

- state/draft-email.md
+ /agent/state/draft-email.md

- read_file(path: "toolcalls/{toolCallId}/result.json")
+ read_file(path: "/agent/toolcalls/{toolCallId}/result.json")
```

### 7. Toolcall artifacts changes

```ts
// buildContextRemovedMarker: wrap path with toModelPath
return `<context-removed>Data truncated: ... path: ${toModelPath(storagePath)}</context-removed>`;
```

### 8. Autopilot constants changes

```diff
- Update MEMORY.md with a timestamped summary
+ Update /agent/MEMORY.md with a timestamped summary

- Stable new facts go to the relevant memory file (USER.md, memory/preferences.md, memory/patterns.md).
+ Stable new facts go to the relevant memory file (/agent/USER.md, /agent/memory/preferences.md, /agent/memory/patterns.md).

- If USER.md is sparse, leave one concise question
+ If /agent/USER.md is sparse, leave one concise question
```

## Backwards Compatibility

`toStoragePath()` tolerates relative paths (no `/agent/` prefix) by passing them through unchanged. This means:
- Existing triggers with relative `instruction_path` in DB continue to work
- If the model somehow sends a relative path, it still works
- No DB migration needed

## Tasklet Dev Confirmation

Validated with Tasklet developer (2026-03-09). Key takeaways:

1. **Permissive `toStoragePath()` is correct for v1.** Tasklet uses the same permissive pattern — their path resolver tolerates both `/agent/foo` and `foo`. Strict mode can come later after stabilization.

2. **`search_knowledge` results must include `/agent/` prefix.** The model sees `/agent/vault/doc.pdf` and can feed it directly to `read_file` without path gymnastics. Confirmed this is how Tasklet works.

3. **Examples in param descriptions do heavy lifting.** Tasklet dev: "The examples are what the model actually pattern-matches on." Every param description that mentions a path must include a concrete example (e.g., `"(e.g., '/agent/memory/MEMORY.md' or '/agent/vault/')"`).

4. **Tasklet dev: "I never see a relative path in my instructions."** Every model-facing surface — tool descriptions, system prompt, system-reminder, tool responses — uses absolute `/agent/` paths. Zero exceptions.

5. **Two path roots in Tasklet: `/agent/` (persistent) and `/tmp/` (ephemeral).** Not urgent for Sunder (no sandbox yet), but noted for future work when sandbox compute lands (Phase 3+ PR 42b). The `/tmp/` space is per-run ephemeral scratch.

## Resolved Questions

1. ~~Should `toStoragePath` reject paths that don't start with `/agent/`?~~ **Decided: Permissive for v1.** Pass-through for relative paths. Strict mode deferred to post-stabilization.

2. ~~Should `search_knowledge` results include the `/agent/` prefix?~~ **Decided: Yes.** Model sees `/agent/vault/doc.pdf` → feeds directly to `read_file`.
