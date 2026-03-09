# PR 22e: Absolute Agent Paths (`/agent/` prefix)

**Design doc:** `docs/designs/absolute-agent-paths.md`
**v2 plan entry:** PR 22e in Phase 2

Model-boundary-only refactor. All model-facing paths become absolute `/agent/` paths. Internal storage, DB, frontend, API routes stay relative. Thin `toStoragePath`/`toModelPath` conversion at tool boundary (~13 files).

**Canonical output rule:** Permissive input (accept both `/agent/foo` and `foo`), canonical output (always return `/agent/foo` via `toModelPath()` in every response).

---

## Commit 1 — Utility module: `agent-paths.ts`

**Files:**
- `src/lib/storage/agent-paths.ts` (new)
- `src/lib/storage/__tests__/agent-paths.test.ts` (new)

### 1.1 Write failing tests

Create `src/lib/storage/__tests__/agent-paths.test.ts`:

```ts
/**
 * Tests for agent path translation utilities.
 * @module lib/storage/__tests__/agent-paths
 */
import { describe, expect, it } from "vitest";

import { AGENT_ROOT, toModelPath, toStoragePath } from "../agent-paths";

describe("AGENT_ROOT", () => {
  it("is /agent/", () => {
    expect(AGENT_ROOT).toBe("/agent/");
  });
});

describe("toStoragePath", () => {
  it("strips /agent/ prefix from absolute model paths", () => {
    expect(toStoragePath("/agent/memory/MEMORY.md")).toBe("memory/MEMORY.md");
  });

  it("strips /agent/ prefix from directory paths", () => {
    expect(toStoragePath("/agent/vault/")).toBe("vault/");
  });

  it("strips /agent/ prefix from top-level files", () => {
    expect(toStoragePath("/agent/SOUL.md")).toBe("SOUL.md");
  });

  it("passes through relative paths unchanged for backwards compatibility", () => {
    expect(toStoragePath("memory/MEMORY.md")).toBe("memory/MEMORY.md");
  });

  it("passes through bare filenames unchanged", () => {
    expect(toStoragePath("SOUL.md")).toBe("SOUL.md");
  });

  it("does not strip /agent from paths without trailing slash in prefix", () => {
    expect(toStoragePath("/agentfoo/bar.md")).toBe("/agentfoo/bar.md");
  });
});

describe("toModelPath", () => {
  it("adds /agent/ prefix to relative storage paths", () => {
    expect(toModelPath("memory/MEMORY.md")).toBe("/agent/memory/MEMORY.md");
  });

  it("adds /agent/ prefix to bare filenames", () => {
    expect(toModelPath("SOUL.md")).toBe("/agent/SOUL.md");
  });

  it("adds /agent/ prefix to directory paths", () => {
    expect(toModelPath("vault/")).toBe("/agent/vault/");
  });

  it("is idempotent on already-absolute paths", () => {
    expect(toModelPath("/agent/memory/MEMORY.md")).toBe("/agent/memory/MEMORY.md");
  });

  it("is idempotent on already-absolute directory paths", () => {
    expect(toModelPath("/agent/vault/")).toBe("/agent/vault/");
  });
});
```

**Verify:** `pnpm vitest run src/lib/storage/__tests__/agent-paths.test.ts` — all tests fail (module not found).

### 1.2 Implement `agent-paths.ts`

Create `src/lib/storage/agent-paths.ts`:

```ts
/**
 * Model-boundary path translation for the /agent/ virtual root.
 *
 * The model sees all agent file paths as absolute (e.g. /agent/memory/MEMORY.md).
 * Internal storage, DB, and API routes use relative paths (e.g. memory/MEMORY.md).
 * These utilities convert between the two at the tool boundary.
 *
 * @module lib/storage/agent-paths
 */

/** Virtual root that the model sees for all agent file operations. */
export const AGENT_ROOT = "/agent/";

/**
 * Strips the /agent/ prefix to get an internal storage-relative path.
 *
 * Tolerates relative paths (no /agent/ prefix) by passing them through
 * unchanged for backwards compatibility during transition.
 */
export function toStoragePath(modelPath: string): string {
  if (modelPath.startsWith(AGENT_ROOT)) {
    return modelPath.slice(AGENT_ROOT.length);
  }

  return modelPath;
}

/**
 * Adds the /agent/ prefix so the model sees absolute paths.
 *
 * Idempotent — paths that already start with /agent/ are returned unchanged.
 */
export function toModelPath(storagePath: string): string {
  if (storagePath.startsWith(AGENT_ROOT)) {
    return storagePath;
  }

  return `${AGENT_ROOT}${storagePath}`;
}
```

**Verify:** `pnpm vitest run src/lib/storage/__tests__/agent-paths.test.ts` — all tests pass.

**Commit:** `feat(pr22e): add agent-paths utility module with toStoragePath and toModelPath`

---

## Commit 2 — Tool boundary files: strip on input, canonicalize on output

All tool files that accept or return paths to the model. Every response path field uses `toModelPath()`.

**Files to modify:**
- `src/lib/runner/tools/storage/index.ts` — `read_file`, `write_file`, `search_knowledge`
- `src/lib/runner/tools/triggers/setup-trigger.ts` — strip `instruction_path` on input
- `src/lib/runner/tools/triggers/manage-triggers.ts` — canonicalize `instruction_path` on output
- `src/lib/runner/tools/connections/manage-tools.ts` — skill file hint
- `src/lib/runner/tools/connections/create-connection.ts` — skill file reference in description
- `src/lib/runner/tools/subagents/run-subagent.ts` — strip `path` on input
- `src/lib/triggers/executor.ts` — wrap `instructionPath` with `toModelPath()` before `buildTriggerEventMessage()`

**Test files to modify:**
- `src/lib/runner/tools/storage/__tests__/index.test.ts` (existing — add new tests)
- Trigger, connection, and subagent test files (existing or new — add tests per tool)

### 2.1 Write failing tests for storage tools

Add to `src/lib/runner/tools/storage/__tests__/index.test.ts` (existing file):

```ts
// === /agent/ path tests ===

describe("read_file /agent/ path handling", () => {
  it("strips /agent/ prefix before calling fileClient for text files", async () => {
    mockFileClient.downloadFile.mockResolvedValue("content");
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/memory/MEMORY.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("memory/MEMORY.md");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/MEMORY.md",
      content: "content",
    });
  });

  it("strips /agent/ prefix for directory paths", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/memory/" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/",
      content: "preferences.md\npatterns.md",
    });
  });

  it("strips /agent/ prefix for image paths", async () => {
    // Use existing test helpers for image buffer setup
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/vault/photo.png" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/photo.png");
    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/photo.png",
    });
  });

  it("returns canonical /agent/ path even when given a relative input", async () => {
    mockFileClient.downloadFile.mockResolvedValue("content");
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "memory/MEMORY.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("memory/MEMORY.md");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/MEMORY.md",
    });
  });
});

describe("write_file /agent/ path handling", () => {
  it("strips /agent/ prefix before storage write and returns canonical path", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "/agent/memory/preferences.md", content: "prefers short replies" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith(
      "memory/preferences.md",
      "prefers short replies",
    );
    expect(result).toMatchObject({
      success: true,
      op: "write",
      path: "/agent/memory/preferences.md",
    });
  });

  it("returns canonical /agent/ path for vault write ops", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "/agent/vault/notes.md", content: "vault content" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith("vault/notes.md", "vault content");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/vault/notes.md",
      path_kind: "vault",
    });
  });

  it("returns canonical /agent/ path for edit ops", async () => {
    mockFileClient.editFile.mockResolvedValue("updated content");
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "edit", path: "/agent/MEMORY.md", old_string: "old", new_string: "new" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.editFile).toHaveBeenCalledWith("MEMORY.md", "old", "new", false);
    expect(result).toMatchObject({
      success: true,
      op: "edit",
      path: "/agent/MEMORY.md",
    });
  });

  it("returns canonical /agent/ path for delete ops", async () => {
    mockFileClient.deleteFile.mockResolvedValue(undefined);
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "delete", path: "/agent/state/draft.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.deleteFile).toHaveBeenCalledWith("state/draft.md");
    expect(result).toMatchObject({
      success: true,
      op: "delete",
      path: "/agent/state/draft.md",
    });
  });

  it("returns canonical /agent/ path even when given relative input", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools(mockSupabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "memory/preferences.md", content: "content" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/preferences.md",
    });
  });
});

describe("search_knowledge /agent/ path handling", () => {
  it("prefixes storage_path with /agent/ in results", async () => {
    // Mock Supabase chain for search_knowledge
    const mockSearchSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      filename: "notes.md",
                      storage_path: "vault/notes.md",
                      title: "notes",
                      summary: "Some notes",
                    },
                  ],
                  error: null,
                }),
              ),
            })),
          })),
        })),
      })),
    };

    const tools = createStorageTools(mockSearchSupabase as never, CLIENT_ID);
    const result = await tools.search_knowledge.execute(
      { query: "notes" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      query: "notes",
      results: [
        {
          filename: "notes.md",
          storage_path: "/agent/vault/notes.md",
          title: "notes",
          summary: "Some notes",
        },
      ],
    });
  });
});
```

**Verify:** Tests fail (paths not stripped, descriptions don't match, search_knowledge not prefixed).

### 2.2 Write failing tests for trigger tools

**`setup-trigger.ts`** — Add test that `/agent/` prefix is stripped before DB insert:

```ts
it("strips /agent/ prefix from instruction_path before DB insert", async () => {
  // ... setup mocks ...
  await tools.setup_trigger.execute({
    trigger_id: "schedule",
    name: "Daily briefing",
    instruction_path: "/agent/memory/briefing-instructions.md",
    params: { cron: "0 9 * * *" },
  }, EXECUTION_OPTIONS);

  // Verify the DB insert was called with the stripped path
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({
      instruction_path: "memory/briefing-instructions.md",
    }),
  );
});

it("returns /agent/ prefixed instruction_path in success response", async () => {
  // ... setup mocks returning data with relative instruction_path ...
  const result = await tools.setup_trigger.execute({
    trigger_id: "schedule",
    name: "Daily briefing",
    instruction_path: "/agent/memory/briefing-instructions.md",
    params: { cron: "0 9 * * *" },
  }, EXECUTION_OPTIONS);

  expect(result.trigger.instruction_path).toBe("/agent/memory/briefing-instructions.md");
});
```

**`manage-triggers.ts`** — Add test that `instruction_path` is prefixed in all responses:

```ts
it("prefixes /agent/ on instruction_path in view response", async () => {
  // ... setup mocks returning trigger with relative instruction_path "memory/briefing.md" ...
  const result = await tools.manage_active_triggers.execute(
    { action: "view", trigger_instance_id: triggerId },
    EXECUTION_OPTIONS,
  );

  expect(result.trigger.instruction_path).toBe("/agent/memory/briefing.md");
});

it("prefixes /agent/ on instruction_path in list response", async () => {
  // ... setup mocks returning trigger list ...
  const result = await tools.manage_active_triggers.execute(
    { action: "list" },
    EXECUTION_OPTIONS,
  );

  for (const trigger of result.triggers) {
    expect(trigger.instruction_path).toMatch(/^\/agent\//);
  }
});

it("prefixes /agent/ on instruction_path in simulate response", async () => {
  // ... setup mocks for simulate action ...
  // The buildTriggerEventMessage call should receive toModelPath(instruction_path)
  expect(mockBuildTriggerEventMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      instructionPath: expect.stringMatching(/^\/agent\//),
    }),
  );
});
```

### 2.3 Write failing tests for connection tools

**`manage-tools.ts`:**

```ts
it("includes /agent/ prefix in skill file hint", async () => {
  // ... setup mocks that return a connection with id "conn-123" ...
  const result = await tools.manage_activated_tools_for_connections.execute(
    { action: "list" },
    EXECUTION_OPTIONS,
  );

  expect(result.connections[0].skills).toContain(
    "/agent/skills/connections/conn-123/SKILL.md"
  );
});
```

**`create-connection.ts`:**

```ts
it("tool description references /agent/skills/ path", () => {
  const tools = createCreateConnectionTool(mockSupabase as never, CLIENT_ID);
  expect(tools.create_new_connections.description).toContain(
    "/agent/skills/system/creating-connections/SKILL.md"
  );
});
```

### 2.4 Write failing tests for subagent tool

```ts
it("strips /agent/ prefix from path before downloading instruction file", async () => {
  mockFileClient.downloadFile.mockResolvedValue("Do the thing.");
  // ... other mock setup ...

  await run_subagent.execute({
    action_pending: "Running...",
    action_finished: "Done",
    action_error: "Failed",
    path: "/agent/skills/connections/conn-1/SKILL.md",
  }, EXECUTION_OPTIONS);

  expect(mockFileClient.downloadFile).toHaveBeenCalledWith(
    "skills/connections/conn-1/SKILL.md"
  );
});
```

### 2.5 Write failing test for trigger executor

Add test for `executor.ts` wrapping `instructionPath` with `toModelPath()`:

```ts
it("wraps instructionPath with toModelPath before building trigger event message", async () => {
  // ... setup executor with payload containing instructionPath: "memory/briefing.md" ...
  // Verify buildTriggerEventMessage receives /agent/memory/briefing.md
  expect(mockBuildTriggerEventMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      instructionPath: "/agent/memory/briefing.md",
    }),
  );
});
```

**Verify:** All new tests fail.

### 2.6 Implement all tool boundary changes

**`src/lib/runner/tools/storage/index.ts`:**

1. Add import:
   ```ts
   import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";
   ```

2. Update `readFileInputSchema.path` description:
   ```ts
   path: z.string().describe(
     "Absolute path to the file or directory (e.g., '/agent/memory/MEMORY.md' or '/agent/vault/')."
   ),
   ```

3. Update `writeFileInputSchema.path` description:
   ```ts
   path: z.string().describe(
     "Absolute path to the file (e.g., '/agent/memory/topic.md' or '/agent/vault/notes.md')."
   ),
   ```

4. In `read_file.execute`:
   ```ts
   execute: async ({ path, start_line, end_line }) => {
     assertValidReadLineBounds(start_line, end_line);
     const internalPath = toStoragePath(path);
     const modelPath = toModelPath(internalPath);
     const fileType = classifyFileType(internalPath);

     if (fileType === "directory") {
       const directoryPath = internalPath.replace(/\/+$/, "");
       const content = await fileClient.listDirectory(directoryPath);
       return { success: true as const, path: modelPath, content };
     }

     if (fileType === "image") {
       const { buffer } = await fileClient.downloadBinary(internalPath);
       const image = await resizeForModel(buffer);
       return { success: true as const, path: modelPath, type: "image" as const, ...image };
     }

     try {
       const rawContent = await fileClient.downloadFile(internalPath);
       const storedImageArtifact = parseStoredImageArtifact(internalPath, rawContent);
       if (storedImageArtifact) {
         return { ...storedImageArtifact, path: modelPath };
       }
       const slicedContent = applyLineRange(rawContent, start_line, end_line);
       return { success: true as const, path: modelPath, content: slicedContent };
     } catch (fileError) {
       if (!shouldFallbackToDirectory(fileError)) {
         throw fileError;
       }
       try {
         const content = await fileClient.listDirectory(internalPath);
         return { success: true as const, path: modelPath, content };
       } catch {
         throw fileError;
       }
     }
   },
   ```

5. In `write_file.execute`:
   ```ts
   execute: async ({ op, path, content, old_string, new_string, replace_all }) => {
     const internalPath = toStoragePath(path);
     const normalizedPath = normalizeWorkspacePath(internalPath, false);
     const modelPath = toModelPath(normalizedPath);
     const pathKind = classifyStoragePath(normalizedPath);

     // ... switch cases remain the same but use normalizedPath for fileClient calls
     // ... and modelPath for all return objects:
     // return { success: true, op, path: modelPath, path_kind: pathKind };
   },
   ```

6. In `search_knowledge.execute`:
   ```ts
   return {
     success: true as const,
     query,
     results: (data ?? []).map((r) => ({
       ...r,
       storage_path: toModelPath(r.storage_path),
     })),
   };
   ```

**`src/lib/runner/tools/triggers/setup-trigger.ts`:**

1. Add import: `import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";`
2. Strip prefix from `instruction_path` before DB insert:
   ```ts
   const internalInstructionPath = toStoragePath(instruction_path);
   // Use internalInstructionPath in all buildXxxInsertRow calls
   ```
3. Canonicalize in success response:
   ```ts
   trigger: { ...data, instruction_path: toModelPath(data.instruction_path) }
   ```

**`src/lib/runner/tools/triggers/manage-triggers.ts`:**

1. Add import: `import { toModelPath } from "@/lib/storage/agent-paths";`
2. In `formatTriggerForResponse`:
   ```ts
   instruction_path: toModelPath(trigger.instruction_path),
   ```
3. In simulate action, wrap the `buildTriggerEventMessage` call:
   ```ts
   instructionPath: toModelPath(trigger.instruction_path),
   ```

**`src/lib/runner/tools/connections/manage-tools.ts`:**

Update the skill hint string:
```ts
// Before:
skills: `Check for a connection skill file at: skills/connections/${connection.id}/SKILL.md - ...`
// After:
skills: `Check for a connection skill file at: /agent/skills/connections/${connection.id}/SKILL.md - ...`
```

**`src/lib/runner/tools/connections/create-connection.ts`:**

Update the tool description:
```ts
// Before:
"If skills/system/creating-connections/SKILL.md exists, ..."
// After:
"If /agent/skills/system/creating-connections/SKILL.md exists, ..."
```

**`src/lib/runner/tools/subagents/run-subagent.ts`:**

1. Add import: `import { toStoragePath } from "@/lib/storage/agent-paths";`
2. Strip prefix before download:
   ```ts
   const internalPath = toStoragePath(path);
   instructionMarkdown = await fileClient.downloadFile(internalPath);
   ```

**`src/lib/triggers/executor.ts`:**

1. Add import: `import { toModelPath } from "@/lib/storage/agent-paths";`
2. Wrap `instructionPath` before `buildTriggerEventMessage`:
   ```ts
   const triggerEventMessage = buildTriggerEventMessage({
     triggerId: payload.triggerId,
     triggerType: payload.triggerType,
     triggerName: payload.triggerName,
     instructionPath: toModelPath(payload.instructionPath),
     triggerPayload: triggerEventPayload,
     invocationMessage: payload.invocationMessage,
   });
   ```

**Verify:** `pnpm vitest run` all tool test files — all tests pass (both new and existing).

**Commit:** `feat(pr22e): add /agent/ path conversion to all tool boundary files`

---

## Commit 3 — Prompt and context surfaces: all model-facing path references

All non-tool files where the model sees path strings.

**Files to modify:**
- `src/lib/ai/system-prompt.ts` — all path references in `SYSTEM_PROMPT`
- `src/lib/runner/system-reminder.ts` — skill path construction
- `src/lib/ai/platform-instructions.ts` — `state/`, `toolcalls/` references
- `src/lib/runner/toolcall-artifacts.ts` — `buildContextRemovedMarker()`
- `src/lib/autopilot/constants.ts` — `AUTOPILOT_INSTRUCTION_PROMPT` memory file references

**Test files to modify:**
- `src/lib/ai/__tests__/system-prompt.test.ts` (existing — update + add tests)
- Other test files as needed

### 3.1 Write failing tests for system prompt

Update existing tests in `src/lib/ai/__tests__/system-prompt.test.ts` (this file already exists — **do not create a new file**):

Add a new describe block:

```ts
describe("SYSTEM_PROMPT /agent/ paths", () => {
  it("references SOUL.md with /agent/ prefix", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/SOUL.md");
  });

  it("references USER.md with /agent/ prefix", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/USER.md");
  });

  it("references MEMORY.md with /agent/ prefix", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/MEMORY.md");
  });

  it("references memory/ directory with /agent/ prefix in read_file example", () => {
    expect(SYSTEM_PROMPT).toContain('read_file("/agent/memory/")');
  });

  it("references vault/ directory with /agent/ prefix", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/vault/");
  });

  it("references skills/ directory with /agent/ prefix", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/skills/");
  });

  it("does not contain bare SOUL.md path reference (without /agent/)", () => {
    const bareReferences = SYSTEM_PROMPT.match(/(?<!\/agent\/)SOUL\.md/g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });

  it("does not contain bare memory/ directory reference (without /agent/)", () => {
    const bareReferences = SYSTEM_PROMPT.match(/(?<!\/agent\/)memory\//g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });

  it("does not contain bare vault/ directory reference (without /agent/)", () => {
    const bareReferences = SYSTEM_PROMPT.match(/(?<!\/agent\/)vault\//g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });
});
```

Also update existing tests that assert bare paths (these will break after the change):

- Line 127: `"If skills/system/creating-connections/SKILL.md exists"` → `"If /agent/skills/system/creating-connections/SKILL.md exists"`
- Line 193: `'read_file("memory/")'` → `'read_file("/agent/memory/")'`
- Lines 162-172: Tests asserting `"SOUL.md"`, `"USER.md"`, `"MEMORY.md"`, `"memory/preferences.md"` etc. still pass because `/agent/SOUL.md` contains `"SOUL.md"`. Check if any exact-match assertions need updating.

### 3.2 Write failing tests for platform instructions

```ts
describe("platform instructions /agent/ paths", () => {
  it("uses /agent/state/ in state-directory section", () => {
    const instructions = buildPlatformInstructions();
    expect(instructions).toContain("/agent/state/");
    expect(instructions).toContain("/agent/state/draft-email.md");
    expect(instructions).toContain("/agent/state/research-notes.md");
  });

  it("uses /agent/toolcalls/ in context-management section", () => {
    const instructions = buildPlatformInstructions();
    expect(instructions).toContain("/agent/toolcalls/");
  });

  it("does not contain bare state/ directory reference (without /agent/)", () => {
    const instructions = buildPlatformInstructions();
    const bareReferences = instructions.match(/(?<!\/agent\/)state\//g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });

  it("does not contain bare toolcalls/ reference (without /agent/)", () => {
    const instructions = buildPlatformInstructions();
    const bareReferences = instructions.match(/(?<!\/agent\/)toolcalls\//g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });
});
```

### 3.3 Write failing test for toolcall-artifacts

```ts
describe("buildContextRemovedMarker /agent/ paths", () => {
  it("wraps storage path with /agent/ prefix in marker", () => {
    const marker = buildContextRemovedMarker("toolcalls/abc/result.json", 51200);
    expect(marker).toContain("path: /agent/toolcalls/abc/result.json");
  });

  it("does not double-prefix already-absolute paths", () => {
    const marker = buildContextRemovedMarker("/agent/toolcalls/abc/result.json", 51200);
    expect(marker).toContain("path: /agent/toolcalls/abc/result.json");
    expect(marker).not.toContain("/agent//agent/");
  });
});
```

### 3.4 Write failing tests for autopilot constants

```ts
describe("AUTOPILOT_INSTRUCTION_PROMPT /agent/ paths", () => {
  it("uses /agent/MEMORY.md", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/MEMORY.md");
  });

  it("uses /agent/USER.md", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/USER.md");
  });

  it("uses /agent/memory/ prefix for topic files", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/memory/preferences.md");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/memory/patterns.md");
  });

  it("does not contain bare MEMORY.md reference (without /agent/)", () => {
    const bareReferences = AUTOPILOT_INSTRUCTION_PROMPT.match(/(?<!\/agent\/)MEMORY\.md/g) ?? [];
    expect(bareReferences).toHaveLength(0);
  });
});
```

**Verify:** All new tests fail.

### 3.5 Implement all prompt/context surface changes

**`src/lib/ai/system-prompt.ts`:**

Prefix all model-facing path references in `SYSTEM_PROMPT`:
- `SOUL.md` → `/agent/SOUL.md`
- `USER.md` → `/agent/USER.md`
- `MEMORY.md` → `/agent/MEMORY.md`
- `memory/preferences.md` → `/agent/memory/preferences.md`
- `memory/growth-plan.md` → `/agent/memory/growth-plan.md`
- `memory/patterns.md` → `/agent/memory/patterns.md`
- `memory/key-decisions.md` → `/agent/memory/key-decisions.md`
- `read_file("memory/")` → `read_file("/agent/memory/")`
- `vault/` → `/agent/vault/`
- `skills/system/creating-connections/SKILL.md` → `/agent/skills/system/creating-connections/SKILL.md`

**`src/lib/runner/system-reminder.ts`:**

Update skill pointer construction (line ~129):
```ts
// Before:
const skillPointer = skillContent
  ? ` (skill: skills/connections/${escapedConnectionId}/SKILL.md)`
  : "";
// After:
const skillPointer = skillContent
  ? ` (skill: /agent/skills/connections/${escapedConnectionId}/SKILL.md)`
  : "";
```

**`src/lib/ai/platform-instructions.ts`:**

Update `BASE_PLATFORM_INSTRUCTIONS` string:
```diff
 <state-directory>
-Use the state/ directory for ephemeral working files during multi-step workflows.
+Use the /agent/state/ directory for ephemeral working files during multi-step workflows.

 Examples:
-- state/draft-email.md
-- state/research-notes.md
+- /agent/state/draft-email.md
+- /agent/state/research-notes.md

-Clean up state/ files after the work is complete.
+Clean up /agent/state/ files after the work is complete.
 </state-directory>

 <context-management>
-<context-removed>Data truncated: 50KB -> 5KB. path: toolcalls/{toolCallId}/result.json</context-removed>
+<context-removed>Data truncated: 50KB -> 5KB. path: /agent/toolcalls/{toolCallId}/result.json</context-removed>

-read_file(path: "toolcalls/{toolCallId}/result.json")
-read_file(path: "toolcalls/{toolCallId}/args.json")
+read_file(path: "/agent/toolcalls/{toolCallId}/result.json")
+read_file(path: "/agent/toolcalls/{toolCallId}/args.json")
 </context-management>
```

**`src/lib/runner/toolcall-artifacts.ts`:**

1. Add import: `import { toModelPath } from "@/lib/storage/agent-paths";`
2. Update `buildContextRemovedMarker` (line ~58):
   ```ts
   return `<context-removed>Data truncated: ${originalKB}KB -> ${thresholdKB}KB. path: ${toModelPath(storagePath)}</context-removed>`;
   ```

**`src/lib/autopilot/constants.ts`:**

Update `AUTOPILOT_INSTRUCTION_PROMPT` (line ~30-57):
- `MEMORY.md` → `/agent/MEMORY.md`
- `USER.md` → `/agent/USER.md`
- `memory/preferences.md` → `/agent/memory/preferences.md`
- `memory/patterns.md` → `/agent/memory/patterns.md`
- `If USER.md is sparse` → `If /agent/USER.md is sparse`

**Verify:** `pnpm vitest run` all prompt/context test files — all tests pass.

**Commit:** `feat(pr22e): update all prompt/context surfaces to /agent/ prefix`

---

## Final verification

```bash
pnpm vitest run \
  src/lib/storage/__tests__/agent-paths.test.ts \
  src/lib/runner/tools/storage/__tests__/index.test.ts \
  src/lib/ai/__tests__/system-prompt.test.ts \
  src/lib/runner/__tests__/system-reminder.test.ts \
  src/lib/runner/tools/connections/__tests__/ \
  src/lib/runner/tools/triggers/__tests__/ \
  src/lib/runner/tools/subagents/__tests__/ \
  src/lib/ai/__tests__/platform-instructions.test.ts \
  src/lib/runner/__tests__/toolcall-artifacts.test.ts \
  src/lib/autopilot/__tests__/constants.test.ts
```

All tests pass. No DB migration, no frontend changes, no API route changes.

**Summary of changes:**
| Commit | Files changed | What |
|--------|--------------|------|
| 1 | 2 (1 new + 1 test) | `agent-paths.ts` utility — `AGENT_ROOT`, `toStoragePath()`, `toModelPath()` |
| 2 | ~7 source + tests | All tool boundary files — strip `/agent/` on input, canonicalize on output |
| 3 | ~5 source + tests | All prompt/context surfaces — `/agent/` prefix on every model-facing path |
