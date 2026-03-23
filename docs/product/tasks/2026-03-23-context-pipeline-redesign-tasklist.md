# Context Pipeline Redesign Implementation Plan

**PR:** Out-of-plan work (supersedes parts of PR 22c and PR 56). Revises context management for prompt caching.
**Decisions:** DATA-10 (revised), SESSION-07 (revised)
**Goal:** Achieve 95%+ prompt cache hit rate by making context append-only, stabilizing the tool set, and enabling fraction-based compaction.

**Architecture:** Remove persistence-time text truncation that breaks cache (DATA-10 revision). Replace message-count compaction with Deep Agents' fraction-based trigger (SESSION-07 revision). Cache Composio schemas in DB. Move system reminder from system prompt to message. Always register all tools. Reference: `roadmap docs/Sunder - Source of Truth/references/deepagents/01-context-pipeline-design-doc.md`.

**Tech Stack:** Vercel AI SDK v6, Supabase (Postgres + Storage), Composio SDK, Vitest

---

## Relevant Files

**Modify:**
- `src/lib/runner/toolcall-artifacts.ts` — split: delete truncation functions, move block storage to new module
- `src/lib/runner/run-persistence.ts` — remove truncation, update imports
- `src/lib/runner/tools/subagents/run-subagent.ts` — update `saveToolcallBlock` import path
- `src/lib/runner/compaction.ts` — remove `ARTIFACT_SIZE_THRESHOLD_BYTES`, add fraction-based trigger
- `src/lib/ai/platform-instructions.ts` — remove `<context-management>` truncation instructions
- `src/lib/runner/system-reminder.ts` — slim to counts only, remove `getConnectionSkillContent()`
- `src/lib/runner/context.ts` — inject system reminder as message, move memory after cache boundary
- `src/lib/ai/system-prompt.ts` — remove system reminder and memory from prompt layers
- `src/lib/runner/tool-registry.ts` — always include all tools (browser, market)
- `src/lib/composio/activated-tools.ts` — read schemas from DB row instead of Composio API
- `src/lib/runner/tools/connections/manage-tools.ts` — persist `tool_schemas` on activation
- `src/lib/runner/run-lifecycle.ts` — add `prompt_tokens` to run completion

**Create:**
- `src/lib/storage/tool-blocks.ts` — extracted block storage functions
- DB migration — `ALTER TABLE connections ADD COLUMN tool_schemas JSONB DEFAULT '{}'`
- DB migration — `ALTER TABLE runs ADD COLUMN prompt_tokens INTEGER`

**Test files:**
- `src/lib/runner/__tests__/toolcall-artifacts.test.ts` — update for narrowed scope
- `src/lib/runner/__tests__/run-persistence.test.ts` — remove truncation expectations
- `src/lib/runner/__tests__/compaction.test.ts` — add fraction-based trigger tests
- `src/lib/runner/__tests__/system-reminder.test.ts` — update for slimmed output
- `src/lib/runner/__tests__/tool-registry.test.ts` — verify all tools always registered
- `src/lib/runner/__tests__/context.test.ts` — verify system reminder as message, memory placement
- `src/lib/composio/__tests__/activated-tools.test.ts` — verify DB-cached schema loading
- `src/lib/storage/__tests__/tool-blocks.test.ts` — extracted block storage tests

---

## Task 1: Extract block storage to new module

Split `toolcall-artifacts.ts` into two concerns: delete truncation functions, move block storage to `src/lib/storage/tool-blocks.ts`.

**Files:**
- Create: `src/lib/storage/tool-blocks.ts`
- Create: `src/lib/storage/__tests__/tool-blocks.test.ts`
- Modify: `src/lib/runner/toolcall-artifacts.ts`
- Modify: `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

**Step 1: Write test for extracted saveToolcallBlock**

```typescript
// src/lib/storage/__tests__/tool-blocks.test.ts
import { describe, test, expect, vi } from "vitest";
import { saveToolcallBlock, serializeToolOutput } from "@/lib/storage/tool-blocks";

describe("serializeToolOutput", () => {
  test("returns string as-is", () => {
    expect(serializeToolOutput("hello")).toBe("hello");
  });

  test("returns null for null input", () => {
    expect(serializeToolOutput(null)).toBeNull();
  });

  test("returns null for undefined input", () => {
    expect(serializeToolOutput(undefined)).toBeNull();
  });

  test("JSON-serializes objects with indentation", () => {
    const result = serializeToolOutput({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/storage/__tests__/tool-blocks.test.ts
```
Expected: FAIL — module `@/lib/storage/tool-blocks` does not exist yet.

**Step 3: Create the new module with extracted functions**

```typescript
// src/lib/storage/tool-blocks.ts
/**
 * Block storage for tool call args and results (observability/recovery).
 * Extracted from toolcall-artifacts.ts — truncation functions removed.
 * @module lib/storage/tool-blocks
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const AGENT_FILES_BUCKET_ID = "agent-files";

type ChatSupabaseClient = SupabaseClient<Database>;

/** Serializes tool output to a string for storage. Returns null for nullish input. */
export function serializeToolOutput(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === "string") return output;
  return JSON.stringify(output, null, 2);
}

/**
 * Stores both the tool call arguments and result to the tenant workspace.
 * Called for observability and subagent block persistence.
 */
export async function saveToolcallBlock(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  const argsContent = serializeToolOutput(args);
  if (argsContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(
          `${clientId}/toolcalls/${toolCallId}/args.json`,
          argsContent,
          { upsert: true, contentType: "application/json; charset=utf-8" },
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  const resultContent = serializeToolOutput(result);
  if (resultContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(
          `${clientId}/toolcalls/${toolCallId}/result.json`,
          resultContent,
          { upsert: true, contentType: "application/json; charset=utf-8" },
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  await Promise.all(uploads);
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/storage/__tests__/tool-blocks.test.ts
```
Expected: PASS

**Step 5: Update imports in run-persistence.ts**

Change `import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts"` to `import { saveToolcallBlock } from "@/lib/storage/tool-blocks"` in `src/lib/runner/run-persistence.ts:27`.

**Step 6: Update imports in run-subagent.ts**

Change `import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts"` to `import { saveToolcallBlock } from "@/lib/storage/tool-blocks"` in `src/lib/runner/tools/subagents/run-subagent.ts:15`.

**Step 7: Run all runner tests to verify no breakage**

```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: All existing tests PASS with new import paths.

**Step 8: Commit**

```bash
git add src/lib/storage/tool-blocks.ts src/lib/storage/__tests__/tool-blocks.test.ts src/lib/runner/run-persistence.ts src/lib/runner/tools/subagents/run-subagent.ts
git commit -m "refactor: extract saveToolcallBlock to src/lib/storage/tool-blocks.ts"
```

---

## Task 2: Remove text truncation from persistence

Delete `truncateOversizedParts()`, `saveToolcallArtifact()`, `buildContextRemovedMarker()`, and `serializeWithSize()` from `toolcall-artifacts.ts`. Remove all truncation from `finalizeRun()`. Remove `<context-management>` truncation instructions from platform-instructions.

**Files:**
- Modify: `src/lib/runner/toolcall-artifacts.ts` — delete truncation functions (keep file for now if any re-exports remain, or delete entirely)
- Modify: `src/lib/runner/run-persistence.ts:100-131` — remove `truncateOversizedParts()` call and block storage call
- Modify: `src/lib/runner/compaction.ts:25` — remove `ARTIFACT_SIZE_THRESHOLD_BYTES`
- Modify: `src/lib/ai/platform-instructions.ts:48-71` — remove `<context-management>` section
- Test: `src/lib/runner/__tests__/run-persistence.test.ts`
- Test: `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

**Step 1: Write test asserting finalizeRun saves full parts without truncation**

In `src/lib/runner/__tests__/run-persistence.test.ts`, add or update a test:

```typescript
test("finalizeRun saves full tool output to DB without truncation", async () => {
  const largeOutput = "x".repeat(50_000); // 50KB — well above old 5KB threshold
  const steps = [makeStepWithToolResult("search_crm", { query: "test" }, largeOutput)];

  await finalizeRun({
    supabase: mockSupabase,
    clientId: "client-1",
    threadId: "thread-1",
    runId: "run-1",
    modelId: "google/gemini-3-flash",
    steps,
    text: "",
    totalUsage: { inputTokens: 100, outputTokens: 50 },
    logLabel: "test",
  });

  // Verify the message was created with full output, not truncated
  const savedParts = mockCreateMessages.mock.calls[0]?.[1]?.[0]?.parts;
  const toolPart = savedParts?.find((p: any) => p.state === "output-available");
  expect(toolPart?.output).toBe(largeOutput);
  expect(toolPart?.output).not.toContain("<context-removed>");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-persistence.test.ts -t "saves full tool output"
```
Expected: FAIL — output is truncated to 5KB with `<context-removed>` marker.

**Step 3: Remove truncation from finalizeRun**

In `src/lib/runner/run-persistence.ts`, remove:
- Lines 102-138: the entire block storage + truncation section
- Line 27-28: `import { saveToolcallBlock, truncateOversizedParts } from "@/lib/runner/toolcall-artifacts"`
- Change `let parts: PersistedPart[] = rawParts;` (line 124) to `const parts = rawParts;`

The function now goes directly from `buildAssistantPartsFromSteps(steps)` to building `contentText`.

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-persistence.test.ts -t "saves full tool output"
```
Expected: PASS

**Step 5: Delete toolcall-artifacts.ts**

The file is now empty of useful exports (block storage moved to `tool-blocks.ts`). Delete:
- `src/lib/runner/toolcall-artifacts.ts`
- `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

**Step 6: Remove ARTIFACT_SIZE_THRESHOLD_BYTES from compaction.ts**

Delete `src/lib/runner/compaction.ts:20-25` (the `ARTIFACT_SIZE_THRESHOLD_BYTES` constant and its JSDoc). Search for any other imports of this constant and remove them.

**Step 7: Remove `<context-management>` truncation instructions**

In `src/lib/ai/platform-instructions.ts`, remove lines 48-71 (the entire `<context-management>` section). Keep the rest of `<platform-instructions>`.

**Step 8: Run all tests**

```bash
npx vitest run src/lib/runner/__tests__/ src/lib/ai/__tests__/
```
Expected: All PASS. Some tests may need updating if they asserted truncation behavior — update those to expect full output.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: remove text truncation from persistence — append-only for cache stability"
```

---

## Task 3: DB-cache Composio tool schemas

Cache tool schemas in the `connections` table at activation time. Load from DB on every run instead of calling Composio API.

**Files:**
- Create: DB migration file
- Modify: `src/lib/composio/activated-tools.ts:34-38`
- Modify: `src/lib/runner/tools/connections/manage-tools.ts`
- Modify: `src/lib/connections/schemas.ts` (if schema types need updating)
- Test: `src/lib/composio/__tests__/activated-tools.test.ts`

**Step 1: Create migration**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_tool_schemas_to_connections.sql
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS tool_schemas JSONB NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.connections.tool_schemas IS 'Cached Composio tool schemas, persisted at activation time to avoid external API calls on every run.';
```

**Step 2: Write test for loading tools from cached schemas**

```typescript
// In src/lib/composio/__tests__/activated-tools.test.ts
test("loadActivatedConnectionTools reads schemas from DB row, not Composio API", async () => {
  const connections: ConnectionRow[] = [{
    id: "conn-1",
    client_id: "client-1",
    composio_connected_account_id: "cac-1",
    toolkit_slug: "gmail",
    display_name: null,
    account_identifier: "test@gmail.com",
    status: "active",
    activated_tools: ["gmail_send_email"],
    tool_count: 15,
    tool_schemas: {
      gmail_send_email: {
        description: "Send an email via Gmail",
        inputParameters: {
          type: "object",
          properties: { to: { type: "string" }, subject: { type: "string" } },
          required: ["to", "subject"],
        },
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const tools = await loadActivatedConnectionTools(connections);

  expect(Object.keys(tools)).toEqual(["conn-1__gmail_send_email"]);
  // Verify NO Composio API calls were made
  expect(mockComposioGetRawTools).not.toHaveBeenCalled();
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts -t "reads schemas from DB"
```
Expected: FAIL — current code calls `composio.tools.getRawComposioTools()`.

**Step 4: Update loadActivatedConnectionTools to read from DB**

```typescript
// src/lib/composio/activated-tools.ts
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
): Promise<ToolSet> {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active" && connection.activated_tools.length > 0,
  );

  if (activeConnections.length === 0) {
    return {};
  }

  const composio = getComposio();
  const loadedTools: ToolSet = {};

  for (const connection of activeConnections) {
    try {
      const schemas = connection.tool_schemas ?? {};

      for (const slug of connection.activated_tools) {
        const schema = schemas[slug];
        if (!schema) {
          console.warn(`[composio] No cached schema for ${slug} on connection ${connection.id}, skipping`);
          continue;
        }

        loadedTools[`${connection.id}__${slug}`] = tool({
          description: schema.description ?? slug,
          inputSchema: jsonSchema(
            schema.inputParameters ?? EMPTY_TOOL_INPUT_SCHEMA,
          ),
          execute: async (args) =>
            composio.tools.execute(slug, {
              connectedAccountId: connection.composio_connected_account_id,
              arguments: args,
              dangerouslySkipVersionCheck: true,
            }),
        });
      }
    } catch (error) {
      console.error(`[composio] Failed to load tools for connection ${connection.id}:`, error);
    }
  }

  return loadedTools;
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
```
Expected: PASS

**Step 6: Update manage-tools.ts to persist schemas on activation**

In `src/lib/runner/tools/connections/manage-tools.ts`, after the existing `getRawComposioTools()` call that validates tool slugs, add schema persistence:

```typescript
// After validating tools and computing nextActivatedTools:
const schemasToCache: Record<string, { description: string | null; inputParameters: unknown }> = {};
for (const rawTool of rawTools) {
  if (nextActivatedTools.has(rawTool.slug)) {
    schemasToCache[rawTool.slug] = {
      description: rawTool.description ?? null,
      inputParameters: rawTool.inputParameters ?? null,
    };
  }
}

await updateConnection(supabase, clientId, {
  id: connection.id,
  activated_tools: Array.from(nextActivatedTools),
  tool_schemas: schemasToCache,
});
```

**Step 7: Update ConnectionRow type**

Add `tool_schemas` to the connection schema/type in `src/lib/connections/schemas.ts` if not already present:

```typescript
tool_schemas: Record<string, { description: string | null; inputParameters: unknown }>;
```

**Step 8: Run all connection + composio tests**

```bash
npx vitest run src/lib/composio/__tests__/ src/lib/runner/__tests__/
```
Expected: All PASS

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: cache Composio tool schemas in DB — eliminate external API call from hot path"
```

---

## Task 4: Slim system reminder and move to message

Remove connection skill content fetching from system reminder. Move system reminder from system prompt to a user message after the cache boundary.

**Files:**
- Modify: `src/lib/runner/system-reminder.ts:117-162` — remove connection skill content
- Modify: `src/lib/runner/context.ts` — inject system reminder as message
- Modify: `src/lib/ai/system-prompt.ts` — remove system reminder from prompt layers
- Test: `src/lib/runner/__tests__/system-reminder.test.ts`
- Test: `src/lib/runner/__tests__/context.test.ts`

**Step 1: Write test for slimmed system reminder**

```typescript
// In src/lib/runner/__tests__/system-reminder.test.ts
test("buildSystemReminder does not call getConnectionSkillContent", async () => {
  const result = await buildSystemReminder(mockSupabase, "client-1", "thread-1");

  expect(result).toContain("<system-reminder>");
  expect(result).toContain("Current time:");
  expect(result).toContain("Active connections:");
  // Should NOT contain skill file paths (no content fetching)
  expect(mockGetConnectionSkillContent).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -t "does not call getConnectionSkillContent"
```
Expected: FAIL — current code calls `getConnectionSkillContent()` at line 134.

**Step 3: Remove connection skill content fetching**

In `src/lib/runner/system-reminder.ts`, replace lines 129-148 (the `Promise.all` that fetches skill content for each connection) with a simple map that only outputs counts:

```typescript
const activeConnectionLines = activeConnections.map((connection) => {
  const escapedToolkitSlug = escapeXml(connection.toolkit_slug);
  const escapedConnectionId = escapeXml(connection.id);
  const activatedToolCount = connection.activated_tools.length;
  return `  ${escapedToolkitSlug} (${escapedConnectionId}): ${activatedToolCount}/${connection.tool_count} tools active`;
});
```

Remove the `import { getConnectionSkillContent } from "@/lib/storage/skill-files"` import.

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```
Expected: PASS

**Step 5: Write test verifying system reminder is injected as a message, not in system prompt**

```typescript
// In src/lib/runner/__tests__/context.test.ts
test("assembleContext injects system reminder as a user message, not in system string", async () => {
  const { system, messages } = await assembleContext({
    supabase: mockSupabase,
    threadId: "thread-1",
    currentMessage: "hello",
    clientId: "client-1",
  });

  // System prompt should NOT contain <system-reminder>
  expect(system).not.toContain("<system-reminder>");

  // A message should contain <system-reminder>
  const reminderMessage = messages.find(
    (m) => typeof m.content === "string" && m.content.includes("<system-reminder>")
  );
  expect(reminderMessage).toBeDefined();
  expect(reminderMessage?.role).toBe("user");
});
```

**Step 6: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "injects system reminder as a user message"
```
Expected: FAIL — system reminder is currently in the system string.

**Step 7: Move system reminder from system prompt to message in context.ts**

In `src/lib/runner/context.ts`, modify `assembleContext()`:
- Remove `systemReminder` from the `buildSystemPrompt()` call
- Instead, prepend a user message with the system reminder content before the conversation messages

In `src/lib/ai/system-prompt.ts`, remove the system reminder parameter from `buildSystemPrompt()`.

**Step 8: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```
Expected: PASS

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: slim system reminder + move to message for cache stability"
```

---

## Task 5: Stable tool set — always register all tools

Remove conditional tool registration for browser and market tools. Always register them. Return runtime error if not configured.

**Files:**
- Modify: `src/lib/runner/tool-registry.ts:63-65, 81-85`
- Modify: `src/lib/runner/tools/browser/browse-website.ts` — add runtime check
- Modify: `src/lib/runner/tools/market/` — add runtime check (if applicable)
- Test: `src/lib/runner/__tests__/tool-registry.test.ts`

**Step 1: Write test asserting browser tools are always registered**

```typescript
// In src/lib/runner/__tests__/tool-registry.test.ts
test("createRunnerTools includes browse_website even when BROWSER_USE_API_KEY is unset", () => {
  // Ensure env var is not set
  delete process.env.BROWSER_USE_API_KEY;

  const tools = createRunnerTools(mockSupabase, "client-1", "thread-1", {
    includeBrowserTools: true,
  });

  expect(tools).toHaveProperty("browse_website");
});

test("createRunnerTools includes market tools even when property DB is not configured", () => {
  delete process.env.PROPERTY_SUPABASE_URL;

  const tools = createRunnerTools(mockSupabase, "client-1", "thread-1", {
    includeMarketTools: true,
  });

  expect(tools).toHaveProperty("search_market_data");
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/tool-registry.test.ts -t "includes browse_website"
```
Expected: FAIL — tools are conditionally excluded.

**Step 3: Remove conditional registration**

In `src/lib/runner/tool-registry.ts`, replace:

```typescript
// Line 63-65: BEFORE
const shouldIncludeMarketTools = options?.includeMarketTools === true && isPropertySupabaseConfigured();
const marketTools = shouldIncludeMarketTools ? createMarketTools() : {};

// AFTER
const marketTools = createMarketTools();
```

```typescript
// Line 81-85: BEFORE
const shouldIncludeBrowserTools = options?.includeBrowserTools === true && isBrowserUseConfigured();
const browserTools = shouldIncludeBrowserTools ? createBrowserTools(supabase, clientId) : {};

// AFTER
const browserTools = createBrowserTools(supabase, clientId);
```

The runtime check for configuration now lives inside each tool's `execute` function — `browse-website.ts` already does this (lines 70-78 check `getBrowserUseClient()` and return error if unconfigured).

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/tool-registry.test.ts
```
Expected: PASS

**Step 5: Remove unused options and imports**

Remove `includeBrowserTools` and `includeMarketTools` from `CreateRunnerToolsOptions`. Remove `isBrowserUseConfigured` and `isPropertySupabaseConfigured` imports from `tool-registry.ts`.

**Step 6: Run full test suite**

```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: All PASS. Update any tests that asserted conditional tool absence.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: always register all tools for cache-stable tool set"
```

---

## Task 6: Fraction-based compaction trigger

Replace fixed `COMPACTION_MESSAGE_THRESHOLD = 80` with Deep Agents' fraction-based trigger using token count from previous run.

**Files:**
- Create: DB migration for `prompt_tokens` on `runs`
- Modify: `src/lib/runner/compaction.ts:27-31` — replace constants and trigger logic
- Modify: `src/lib/runner/run-persistence.ts` or `run-lifecycle.ts` — persist `prompt_tokens`
- Test: `src/lib/runner/__tests__/compaction.test.ts`

**Step 1: Create migration**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_prompt_tokens_to_runs.sql
ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER;
COMMENT ON COLUMN public.runs.prompt_tokens IS 'Input token count from the LLM response, used for fraction-based compaction trigger.';
```

**Step 2: Write test for fraction-based trigger**

```typescript
// In src/lib/runner/__tests__/compaction.test.ts
describe("fraction-based compaction trigger", () => {
  test("triggers compaction when prompt tokens exceed 85% of model context window", async () => {
    // 850K tokens = 85% of 1M window
    const shouldCompact = shouldTriggerCompaction({
      promptTokens: 860_000,
      modelId: "google/gemini-3-flash",
    });
    expect(shouldCompact).toBe(true);
  });

  test("does not trigger compaction below 85% threshold", async () => {
    const shouldCompact = shouldTriggerCompaction({
      promptTokens: 800_000,
      modelId: "google/gemini-3-flash",
    });
    expect(shouldCompact).toBe(false);
  });

  test("falls back to fixed token threshold for unknown models", async () => {
    const shouldCompact = shouldTriggerCompaction({
      promptTokens: 180_000,
      modelId: "unknown/model",
    });
    expect(shouldCompact).toBe(true); // 180K > 170K fallback
  });

  test("falls back to message count when no token data available", async () => {
    const shouldCompact = shouldTriggerCompaction({
      promptTokens: 0,
      modelId: "google/gemini-3-flash",
      messageCount: 85,
    });
    expect(shouldCompact).toBe(true); // 85 > 80 fallback
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/compaction.test.ts -t "fraction-based"
```
Expected: FAIL — `shouldTriggerCompaction` function doesn't exist yet.

**Step 4: Implement fraction-based trigger**

In `src/lib/runner/compaction.ts`, add:

```typescript
/** Fraction of context window that triggers compaction. Deep Agents default: 0.85 */
const COMPACTION_TRIGGER_FRACTION = 0.85;

/** Fallback: fixed token count if model profile unavailable. Deep Agents default: 170000 */
const COMPACTION_TRIGGER_TOKENS_FALLBACK = 170_000;

/** Fallback: message count if no token data. Preserves existing behavior. */
const COMPACTION_MESSAGE_FALLBACK = 80;

/** Known context windows for our models */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "google/gemini-3-flash": 1_000_000,
  "google/gemini-2.5-flash-lite": 1_000_000,
};

export function shouldTriggerCompaction(input: {
  promptTokens: number;
  modelId: string;
  messageCount?: number;
}): boolean {
  const { promptTokens, modelId, messageCount } = input;

  // If we have token data, use fraction-based or fixed-token trigger
  if (promptTokens > 0) {
    const contextWindow = MODEL_CONTEXT_WINDOWS[modelId];
    if (contextWindow) {
      return promptTokens >= contextWindow * COMPACTION_TRIGGER_FRACTION;
    }
    return promptTokens >= COMPACTION_TRIGGER_TOKENS_FALLBACK;
  }

  // No token data — fall back to message count
  if (messageCount != null) {
    return messageCount >= COMPACTION_MESSAGE_FALLBACK;
  }

  return false;
}
```

Remove the old `COMPACTION_MESSAGE_THRESHOLD` constant.

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/compaction.test.ts -t "fraction-based"
```
Expected: PASS

**Step 6: Wire token persistence into run completion**

In `src/lib/runner/run-persistence.ts`, update `finalizeRun` to pass `promptTokens` through `completeRun`:

```typescript
await completeRun(supabase, {
  ...baseRunCompletion,
  status: "completed",
  promptTokens: totalUsage.inputTokens ?? 0,
});
```

Update `CompleteRunInput` in `run-lifecycle.ts` to accept optional `promptTokens: number`.

**Step 7: Update maybeCompactThread to use new trigger**

In `src/lib/runner/compaction.ts`, update `maybeCompactThread` to query the last run's `prompt_tokens` and use `shouldTriggerCompaction()` instead of the old message-count check.

**Step 8: Run all compaction tests**

```bash
npx vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: All PASS

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: fraction-based compaction trigger — 85% of context window (Deep Agents pattern)"
```

---

## Task 7: Move memory outside cached prefix

Move memory context (SOUL.md, USER.md, MEMORY.md) from the system prompt to a message injected after the cache boundary. This follows Deep Agents' ordering: caching before memory.

**Files:**
- Modify: `src/lib/runner/context.ts` — move memory from system prompt to message
- Modify: `src/lib/ai/system-prompt.ts` — remove memory parameters from `buildSystemPrompt()`
- Test: `src/lib/runner/__tests__/context.test.ts`

**Step 1: Write test verifying memory is NOT in system prompt**

```typescript
// In src/lib/runner/__tests__/context.test.ts
test("assembleContext does not include memory content in system string", async () => {
  // Mock loadMemoryContext to return known content
  mockLoadMemoryContext.mockResolvedValue({
    soul: "I am the CRM agent",
    user: "User profile here",
    memory: "Working memory here",
  });

  const { system } = await assembleContext({
    supabase: mockSupabase,
    threadId: "thread-1",
    currentMessage: "hello",
    clientId: "client-1",
  });

  expect(system).not.toContain("I am the CRM agent");
  expect(system).not.toContain("User profile here");
  expect(system).not.toContain("Working memory here");
});

test("assembleContext injects memory as a message after system reminder", async () => {
  mockLoadMemoryContext.mockResolvedValue({
    soul: "I am the CRM agent",
    user: "User profile here",
    memory: "Working memory here",
  });

  const { messages } = await assembleContext({
    supabase: mockSupabase,
    threadId: "thread-1",
    currentMessage: "hello",
    clientId: "client-1",
  });

  const memoryMessage = messages.find(
    (m) => typeof m.content === "string" && m.content.includes("I am the CRM agent")
  );
  expect(memoryMessage).toBeDefined();
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "does not include memory"
```
Expected: FAIL — memory is currently in the system string.

**Step 3: Move memory from system prompt to message**

In `src/lib/runner/context.ts`, modify `assembleContext()`:
- Remove `memory` parameter from `buildSystemPrompt()` call
- Instead, inject a user message with memory content (soul, user profile, working memory) before the conversation messages but after the system reminder message

In `src/lib/ai/system-prompt.ts`, remove the memory-related parameters and sections from `buildSystemPrompt()`.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```
Expected: PASS

**Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: All PASS. Update any tests that asserted memory in the system string.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: move memory outside cached prefix — follows Deep Agents cache ordering"
```

---

## Task 8: Prompt caching spike (investigation, not TDD)

**This is an investigation task, not a code task.** Verify Gemini caching behavior before implementing Part 2B.

**Step 1: Test Gemini implicit caching**

Create a throwaway test script that:
1. Calls `streamText()` with a stable system prompt + tools
2. Makes 3 sequential calls with the same system prompt, adding one message each time
3. Logs `result.usage` after each call to check for `cachedInputTokens` or equivalent

```bash
npx tsx scripts/test-gemini-caching.ts
```

Check: does Gemini return cached token metrics? Does the second call show cached input tokens?

**Step 2: Test system-reminder-as-user-message**

In the same script, inject a `{ role: "user", content: "<system-reminder>..." }` message. Verify Gemini handles it correctly and the system prompt cache isn't affected.

**Step 3: Document findings**

Write results to `roadmap docs/Sunder - Source of Truth/references/prompt-caching/12-gemini-caching-spike-results.md`:
- Does implicit caching work automatically?
- What token metrics are returned?
- Is explicit `CachedContent` needed?
- Does system-reminder-as-user-message work?

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: Gemini prompt caching spike results"
```

---

## Task 9: Session reset for stale threads (Dorabot pattern)

Skip loading old message history when a thread hasn't been used in 4+ hours. The agent starts fresh with system prompt + memory files + new message. Old messages stay in DB — user can still scroll back in the UI. The agent just doesn't see them.

Reference: Dorabot's idle timeout at `/Users/sethlim/Documents/dorabot-1/src/gateway/server.ts:1357-1368`.

**Files:**
- Create: DB migration — add `context_reset_at` to `conversation_threads`
- Modify: `src/lib/runner/context.ts` — add stale check, filter messages by `context_reset_at`
- Test: `src/lib/runner/__tests__/context.test.ts`

**Step 1: Create migration**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_context_reset_at_to_threads.sql
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS context_reset_at TIMESTAMPTZ;
COMMENT ON COLUMN public.conversation_threads.context_reset_at IS 'When set, context assembly only loads messages after this timestamp. Set automatically when a thread is stale (4h idle). User still sees full history in UI.';
```

**Step 2: Write test for stale thread reset**

```typescript
// In src/lib/runner/__tests__/context.test.ts
describe("session reset for stale threads", () => {
  test("does not load messages older than context_reset_at", async () => {
    const resetAt = new Date("2026-03-23T10:00:00Z");
    const oldMessage = { created_at: "2026-03-23T08:00:00Z", role: "user", content: "old message" };
    const newMessage = { created_at: "2026-03-23T10:05:00Z", role: "user", content: "new message" };

    mockGetThread.mockResolvedValue({ context_reset_at: resetAt.toISOString() });
    mockLoadMessages.mockResolvedValue([oldMessage, newMessage]);

    const { messages } = await assembleContext({
      supabase: mockSupabase,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-1",
    });

    const contents = messages.map((m) => m.content).filter(Boolean);
    expect(contents).not.toContain("old message");
  });

  test("sets context_reset_at when thread is stale (4h idle)", async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockGetThread.mockResolvedValue({ updated_at: fiveHoursAgo, context_reset_at: null });

    await assembleContext({
      supabase: mockSupabase,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-1",
    });

    expect(mockSupabaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ context_reset_at: expect.any(String) })
    );
  });

  test("does not reset when thread was recently active", async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    mockGetThread.mockResolvedValue({ updated_at: oneHourAgo, context_reset_at: null });

    await assembleContext({
      supabase: mockSupabase,
      threadId: "thread-1",
      currentMessage: "hello",
      clientId: "client-1",
    });

    expect(mockSupabaseUpdate).not.toHaveBeenCalled();
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "session reset"
```
Expected: FAIL — no stale check exists yet.

**Step 4: Implement stale check in assembleContext**

In `src/lib/runner/context.ts`, add at the start of `assembleContext()`:

```typescript
const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4h — matches Dorabot pattern

// Check if thread is stale
const thread = await getThread(supabase, threadId);
const gap = Date.now() - new Date(thread.updated_at).getTime();
let contextResetAt = thread.context_reset_at;

if (gap > IDLE_TIMEOUT_MS && !contextResetAt) {
  contextResetAt = new Date().toISOString();
  await supabase
    .from("conversation_threads")
    .update({ context_reset_at: contextResetAt })
    .eq("thread_id", threadId);
}
```

Then when loading messages, add the filter:

```typescript
let historyQuery = supabase
  .from("conversation_messages")
  .select("message_id, created_at, role, content, parts")
  .eq("thread_id", threadId);

if (contextResetAt) {
  historyQuery = historyQuery.gt("created_at", contextResetAt);
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "session reset"
```
Expected: PASS

**Step 6: Run full test suite**

```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: All PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: session reset for stale threads — skip old messages after 4h idle (Dorabot pattern)"
```

---

## Notes

- **Task ordering matters:** Tasks 1-2 must be done sequentially (2 depends on 1). Tasks 3-5 can be done in parallel. Task 6 is independent. Task 7 depends on Task 4 (system reminder move). Task 8 is a spike that can run anytime. Task 9 is independent — can be done anytime after Task 4 (it modifies `context.ts` which Task 4 also touches).
- **Compaction summary overwrite:** Verified that `conversation_threads.compaction_summary` is a single column that overwrites — no "summaries of summaries" risk. Summary tagging (Deep Agents' `lc_source` pattern) is not needed.
- **`toModelPath` stays:** Used in 20+ files for skills, triggers, storage. Not artifact-specific. Do not delete.
- **PR 56 overlap:** Tasks in PR 56 (parallelize Composio loading, dedup connections query) are partially superseded by Task 3 (DB-cached schemas eliminates Composio API from hot path). PR 56-2 (connections dedup) may still be useful for system reminder — evaluate after Task 4.
- **Prompt caching implementation (Part 2B):** Blocked on Task 8 spike results. Will be a separate tasklist once spike confirms mechanism.
