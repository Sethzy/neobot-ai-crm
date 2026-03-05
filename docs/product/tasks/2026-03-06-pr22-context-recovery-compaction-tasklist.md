# PR 22: Context Recovery + Thread Compaction

**PR:** PR 22: Context recovery + thread compaction
**Decisions:** DATA-10, SESSION-07, RUNNER-03, TASKLET-03, TASKLET-04
**Goal:** Implement two features: (1) toolcall artifact storage — save oversized tool results to Supabase Storage and persist truncated versions in DB to reduce storage bloat; (2) thread compaction — when a thread's message history exceeds the context budget, summarize older messages into a compaction summary injected at layer 5 of the system prompt. Source history is NEVER deleted — compaction is read-time prompt assembly only.

**Architecture:** Thread compaction operates at context assembly time. When `assembleContext` runs, it checks for an existing compaction summary for the thread. If present, only messages after the summary's cutoff timestamp are loaded; the summary itself is injected as `<compaction-summary>` at layer 5 (between `<working-memory>` and `<system-reminder>`) per RUNNER-03. The post-run lifecycle checks whether the thread exceeds `COMPACTION_MESSAGE_THRESHOLD` (40 messages); if so, it generates a CRM-tuned LLM summary of older messages (preserving deal names, contacts, task statuses, decisions) via `generateText()` and persists it to `thread_compaction_summaries`. Toolcall artifact truncation runs in `onFinish` before persisting parts — any tool output exceeding `ARTIFACT_SIZE_THRESHOLD_BYTES` (5 KB) is saved to `/{clientId}/toolcalls/{toolCallId}/result.json` in Supabase Storage, and the parts array stores a truncated version with a `<context-removed>` recovery marker. The agent can recover full results via the existing `read_file` tool. Provider-native compaction (Anthropic `compact_20260112`) is wired into `prepareStep` via `providerOptions` for future model routing — currently v1 uses Gemini Flash which does not support it.

**Tech Stack:** Supabase (Postgres + RLS + Storage), Vercel AI SDK v6 (`generateText`, `streamText`, `prepareStep`, `providerOptions`), Vitest, Zod 4

**Prerequisite:** PR 15 (context assembly + utility tools) merged. The runner engine, context module, memory system, and `read_file` storage tool from earlier PRs are required.

---

## Relevant Files

### Create
- `supabase/migrations/20260306020000_create_thread_compaction_summaries.sql`
- `src/lib/runner/compaction.ts`
- `src/lib/runner/__tests__/compaction.test.ts`
- `src/lib/runner/toolcall-artifacts.ts`
- `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

### Modify
- `src/lib/runner/context.ts` — compaction-aware assembly (layer 5 injection + conditional message loading)
- `src/lib/runner/__tests__/context.test.ts` — new compaction tests
- `src/lib/runner/run-agent.ts` — artifact truncation in onFinish, post-run compaction trigger, Anthropic providerOptions
- `src/lib/runner/__tests__/run-agent.test.ts` — new artifact + compaction tests
- `src/types/database.ts` — targeted manual patch for thread_compaction_summaries table

### Reference (do not modify)
- `src/lib/runner/message-utils.ts` — `buildAssistantPartsFromSteps`, `getAssistantTextFromParts`
- `src/lib/runner/run-lifecycle.ts` — `createRun`, `completeRun`
- `src/lib/runner/system-reminder.ts` — `buildSystemReminder` (layer 6 reference)
- `src/lib/runner/schemas.ts` — `RunnerPayload`, `triggerTypeValues`
- `src/lib/memory/loader.ts` — `loadMemoryContext` (layer 3-4 reference)
- `src/lib/ai/gateway.ts` — `gateway()`, `TIER_1_MODEL`
- `src/lib/runner/tools/storage/index.ts` — `read_file` tool (recovery mechanism)
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` — DATA-10, SESSION-07, RUNNER-03
- `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` — context management reference

---

## Task 1: Compaction Module — Schemas, Constants, and CRM Instructions

**Files:**
- Create: `src/lib/runner/compaction.ts`
- Create: `src/lib/runner/__tests__/compaction.test.ts`

This task creates the compaction module skeleton with all constants, Zod schemas, and the CRM compaction instructions constant. The module will be extended in later tasks with DB operations and the summarizer.

Key constants:
- `ARTIFACT_SIZE_THRESHOLD_BYTES = 5000` — tool results larger than this get saved to Storage (DATA-10)
- `COMPACTION_MESSAGE_THRESHOLD = 40` — trigger compaction when thread has more messages than this
- `COMPACTION_KEEP_RECENT = 15` — keep the most recent N messages verbatim after compaction
- `CRM_COMPACTION_INSTRUCTIONS` — system prompt for the summarizer LLM call, tuned for real estate CRM (PR22-3): preserve contact names/numbers/emails, deal names/statuses/prices, task statuses/deadlines, decisions and rationale, commitments/follow-ups

Zod schema `compactionSummaryRowSchema` mirrors the DB row shape: `id`, `thread_id`, `client_id`, `summary_text`, `compacted_through_at` (timestamp — the `created_at` of the last message included in the summary), `model`, `tokens_used`, `created_at`.

**Step 1: Write tests for constants and Zod schema**

Create `src/lib/runner/__tests__/compaction.test.ts`. Write tests:
- `ARTIFACT_SIZE_THRESHOLD_BYTES` is a positive integer
- `COMPACTION_MESSAGE_THRESHOLD` is a positive integer greater than `COMPACTION_KEEP_RECENT`
- `COMPACTION_KEEP_RECENT` is a positive integer
- `CRM_COMPACTION_INSTRUCTIONS` is a non-empty string containing key phrases ("deal names", "contact", "task statuses")
- `compactionSummaryRowSchema` parses a valid row object
- `compactionSummaryRowSchema` rejects missing required fields

Run tests → verify they fail (module does not exist).

**Step 2: Implement the compaction module skeleton**

Create `src/lib/runner/compaction.ts`. Export:
- All constants listed above
- `compactionSummaryRowSchema` (Zod object)
- TypeScript type `CompactionSummaryRow` inferred from schema
- Add JSDoc module comment and per-export documentation

Run tests → verify they pass.

---

## Task 2: Database Migration — `thread_compaction_summaries` Table

**Files:**
- Create: `supabase/migrations/20260306020000_create_thread_compaction_summaries.sql`

This migration creates the `thread_compaction_summaries` table for persisting compaction summaries per SESSION-07. Each row stores a summary of older messages for a thread. Source messages in `conversation_messages` are NEVER deleted — this table is additive only.

**Step 1: Write the migration SQL**

Create the migration file with:

```sql
CREATE TABLE IF NOT EXISTS thread_compaction_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  summary_text TEXT NOT NULL,
  compacted_through_at TIMESTAMPTZ NOT NULL,
  model TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add index for efficient latest-summary lookup:
```sql
CREATE INDEX idx_compaction_summaries_thread_latest
  ON thread_compaction_summaries (thread_id, created_at DESC);
```

Enable RLS with `client_id` policy (same pattern as other tables):
```sql
ALTER TABLE thread_compaction_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own compaction summaries"
  ON thread_compaction_summaries
  FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
```

Add a comment on the table explaining its purpose and the "source never deleted" invariant.

**Step 2: Verify migration applies**

Run `supabase db push` or equivalent to verify the migration SQL is valid. Check that the table, index, and RLS policy are created.

---

## Task 3: Compaction DB Operations — Fetch and Persist Summaries

**Files:**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

Add two async functions to the compaction module for reading/writing summaries. These abstract the Supabase queries so `context.ts` and `run-agent.ts` stay clean.

Functions:
- `fetchLatestCompactionSummary(supabase, threadId)` → returns `CompactionSummaryRow | null`. Queries `thread_compaction_summaries` ordered by `created_at DESC`, limit 1.
- `persistCompactionSummary(supabase, data)` → inserts a new summary row. Takes `{ threadId, clientId, summaryText, compactedThroughAt, model, tokensUsed }`.

**Step 1: Write tests for `fetchLatestCompactionSummary`**

Add tests to `compaction.test.ts`:
- Returns `null` when no summaries exist for thread
- Returns the most recent summary when multiple exist
- Returns parsed `CompactionSummaryRow` shape

Mock Supabase using the existing `createMockSupabaseClient` pattern from `src/test/mocks/supabase`.

Run tests → verify they fail.

**Step 2: Implement `fetchLatestCompactionSummary`**

Add the function to `compaction.ts`. Query pattern:
```typescript
const { data, error } = await supabase
  .from("thread_compaction_summaries")
  .select("*")
  .eq("thread_id", threadId)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Parse result through `compactionSummaryRowSchema`. Return `null` on error or no data.

Run tests → verify they pass.

**Step 3: Write tests for `persistCompactionSummary`**

Add tests:
- Inserts a row with correct fields
- Returns the inserted row
- Throws on insert failure

Run tests → verify they fail.

**Step 4: Implement `persistCompactionSummary`**

Add the function to `compaction.ts`. Insert into `thread_compaction_summaries` with all fields. Return the inserted row.

Run tests → verify they pass.

---

## Task 4: Compaction Summary Generator (LLM Call)

**Files:**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

Add the LLM-based summarizer function that generates CRM-tuned compaction summaries. Uses `generateText()` from AI SDK v6 with `gateway(TIER_1_MODEL)`. The CRM instructions (PR22-3) tell the model to preserve deal names, contact details, task statuses, and decisions.

Function:
- `generateCompactionSummary(messages)` → `Promise<{ summaryText: string; tokensUsed: number; model: string }>`. Takes an array of `{ role: string; content: string }` messages to summarize.

**Step 1: Write tests for `generateCompactionSummary`**

Add tests to `compaction.test.ts`:
- Calls `generateText` with the gateway model and CRM instructions
- Returns summary text from the LLM response
- Returns token usage and model info
- Handles empty message array (returns empty summary)

Mock `generateText` from "ai" and `gateway` from `@/lib/ai/gateway` using `vi.mock`.

Run tests → verify they fail.

**Step 2: Implement `generateCompactionSummary`**

Add to `compaction.ts`:
```typescript
import { generateText } from "ai";
import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
```

Implementation:
- If messages array is empty, return `{ summaryText: "", tokensUsed: 0, model: TIER_1_MODEL }`
- Format messages into a conversation transcript string
- Call `generateText({ model: gateway(TIER_1_MODEL), system: CRM_COMPACTION_INSTRUCTIONS, prompt: transcriptString })`
- Return `{ summaryText: result.text, tokensUsed: result.usage?.totalTokens ?? 0, model: TIER_1_MODEL }`

Run tests → verify they pass.

---

## Task 5: Compaction-Aware Context Assembly

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`

Modify `assembleContext` to check for an existing compaction summary and integrate it into the context. This is the core integration for SESSION-07.

Changes to `assembleContext`:
1. When `clientId` is present, call `fetchLatestCompactionSummary(supabase, threadId)` in the existing `Promise.all` alongside memory/reminder loading
2. If a summary exists, filter the message query to only load messages after `compacted_through_at`
3. Pass the summary text to `buildSystemPrompt` for layer 5 injection

Changes to `buildSystemPrompt`:
1. Add optional `compactionSummary?: string` parameter
2. Insert `<compaction-summary>` block at layer 5 (after `<working-memory>`, before `<system-reminder>`)
3. Layer order becomes: platform → SYSTEM_PROMPT → soul → user → memory → **compaction** → system-reminder

**Step 1: Write tests for compaction summary injection in system prompt**

Add tests to `context.test.ts`:
- When compaction summary exists, system string contains `<compaction-summary>` block
- Compaction summary appears after `<working-memory>` and before `<system-reminder>`
- When no compaction summary exists, system string does not contain `<compaction-summary>`

Mock `fetchLatestCompactionSummary` (add new `vi.mock` for `@/lib/runner/compaction`).

Run tests → verify they fail.

**Step 2: Implement compaction-aware `buildSystemPrompt`**

Add `compactionSummary?: string` parameter to `buildSystemPrompt`. Insert the `<compaction-summary>` section after `<working-memory>` and before `systemReminder`.

Run tests → verify they pass.

**Step 3: Write tests for conditional message loading**

Add tests:
- When compaction summary exists, messages query uses `gt("created_at", compactedThroughAt)` filter
- When no compaction summary exists, messages query uses existing behavior (no date filter)
- `fetchLatestCompactionSummary` is called with correct threadId

Run tests → verify they fail.

**Step 4: Implement conditional message loading in `assembleContext`**

Modify `assembleContext`:
1. Import `fetchLatestCompactionSummary` from `./compaction`
2. Add to `Promise.all` when clientId is present:
   ```typescript
   [memoryContext, systemReminder, compactionSummary] = await Promise.all([
     loadMemoryContext(supabase, clientId),
     buildSystemReminder(supabase, clientId, threadId),
     fetchLatestCompactionSummary(supabase, threadId),
   ]);
   ```
3. Build message query conditionally:
   ```typescript
   let query = supabase
     .from("conversation_messages")
     .select("role, content, parts")
     .eq("thread_id", threadId);

   if (compactionSummary) {
     query = query.gt("created_at", compactionSummary.compacted_through_at);
   }

   query = query
     .order("created_at", { ascending: false })
     .order("message_id", { ascending: false })
     .limit(MAX_CONTEXT_MESSAGES);
   ```
4. Pass `compactionSummary?.summary_text` to `buildSystemPrompt`

Run tests → verify all pass (new + existing).

---

## Task 6: Post-Run Compaction Trigger

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

After a run completes, check if the thread needs compaction. If total messages exceed `COMPACTION_MESSAGE_THRESHOLD`, generate a summary of older messages and persist it. This runs asynchronously after the stream finishes — it does NOT block the response.

The check runs in `onFinish` after `drainAndContinue`. It:
1. Counts total messages in the thread
2. If count > `COMPACTION_MESSAGE_THRESHOLD`:
   a. Loads all messages except the most recent `COMPACTION_KEEP_RECENT`
   b. Calls `generateCompactionSummary` to summarize them
   c. Persists via `persistCompactionSummary` with `compacted_through_at` set to the `created_at` of the last summarized message
3. Errors are caught and logged — compaction failure must never break the run lifecycle

**Step 1: Write tests for post-run compaction trigger**

Add tests to `run-agent.test.ts` (or a new `run-agent-compaction.test.ts` if the file is large):
- When message count > `COMPACTION_MESSAGE_THRESHOLD`, compaction is triggered
- When message count <= `COMPACTION_MESSAGE_THRESHOLD`, compaction is NOT triggered
- Compaction errors do not propagate (caught and logged)
- `generateCompactionSummary` receives messages excluding the most recent `COMPACTION_KEEP_RECENT`
- `persistCompactionSummary` is called with correct `compacted_through_at`

Mock the compaction module functions.

Run tests → verify they fail.

**Step 2: Implement post-run compaction trigger**

Add a helper function (either in `compaction.ts` or inline in `run-agent.ts`):
```typescript
async function maybeCompactThread(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
): Promise<void> {
  // 1. Count messages
  // 2. If > threshold, load older messages (exclude recent N)
  // 3. Generate summary
  // 4. Persist summary
}
```

Call it from `onFinish` after `drainAndContinue`, wrapped in a try/catch that logs but does not throw:
```typescript
onFinish: async ({ text, steps, totalUsage }) => {
  // ... existing persist + completeRun + drainAndContinue ...

  try {
    await maybeCompactThread(supabase, clientId, threadId);
  } catch (compactionError) {
    console.error("[runner] post-run compaction failed:", compactionError);
  }
},
```

Consider whether to export `maybeCompactThread` from `compaction.ts` for testability.

Run tests → verify they pass.

---

## Task 7: Toolcall Artifact Storage + Truncation Integration

**Files:**
- Create: `src/lib/runner/toolcall-artifacts.ts`
- Create: `src/lib/runner/__tests__/toolcall-artifacts.test.ts`
- Modify: `src/lib/runner/run-agent.ts`

Implements DATA-10: save oversized tool results to Supabase Storage, replace with truncated versions in the persisted parts array. The agent recovers full results via the existing `read_file` tool when it encounters `<context-removed>` markers per TASKLET-04.

Functions in `toolcall-artifacts.ts`:
- `shouldTruncateToolResult(output: unknown): boolean` — checks serialized byte size against `ARTIFACT_SIZE_THRESHOLD_BYTES`
- `saveToolcallArtifact(supabase, clientId, toolCallId, output): Promise<string>` — uploads JSON to Storage at `/{clientId}/toolcalls/{toolCallId}/result.json`, returns the storage path
- `buildContextRemovedMarker(storagePath: string, originalSizeBytes: number): string` — returns `<context-removed>` XML marker string with recovery path and reason
- `truncateOversizedParts(supabase, clientId, parts): Promise<PersistedPart[]>` — scans parts for tool outputs exceeding threshold, saves artifacts, returns parts with truncated outputs

Integration in `run-agent.ts`:
- In `onFinish`, after `buildAssistantPartsFromSteps`, call `truncateOversizedParts` before persisting to DB

**Step 1: Write tests for `shouldTruncateToolResult`**

Create `src/lib/runner/__tests__/toolcall-artifacts.test.ts`. Write tests:
- Returns `false` for small outputs (< 5000 bytes)
- Returns `true` for large outputs (>= 5000 bytes)
- Returns `false` for `null` and `undefined`
- Handles string outputs (checks string byte length)
- Handles object outputs (checks JSON serialized byte length)

Run tests → verify they fail.

**Step 2: Implement `shouldTruncateToolResult`**

Create `src/lib/runner/toolcall-artifacts.ts`. Import `ARTIFACT_SIZE_THRESHOLD_BYTES` from `./compaction`. Implement the byte-size check using `JSON.stringify` + `Buffer.byteLength` (or `new TextEncoder().encode().length` for edge-safe).

Run tests → verify they pass.

**Step 3: Write tests for `saveToolcallArtifact` and `buildContextRemovedMarker`**

Add tests:
- `saveToolcallArtifact` uploads to correct Storage path `/{clientId}/toolcalls/{toolCallId}/result.json`
- `saveToolcallArtifact` returns the storage path
- `saveToolcallArtifact` throws on upload failure
- `buildContextRemovedMarker` returns string containing `<context-removed>` XML with path and reason attributes

Mock Supabase Storage (`supabase.storage.from().upload()`).

Run tests → verify they fail.

**Step 4: Implement `saveToolcallArtifact` and `buildContextRemovedMarker`**

`saveToolcallArtifact`: upload JSON blob to Supabase Storage bucket (use the same bucket as memory files).

`buildContextRemovedMarker`: return an XML string:
```
<context-removed path="{storagePath}" reason="Result exceeded size threshold ({originalSizeBytes} bytes). Use read_file to recover full content." />
```

Run tests → verify they pass.

**Step 5: Write tests for `truncateOversizedParts`**

Add tests:
- Parts with small outputs are unchanged
- Parts with oversized outputs get their `output` replaced with the `<context-removed>` marker
- Oversized outputs are saved to Storage
- Parts without `output` field (e.g., `step-start`, `text`) are unchanged
- Multiple oversized parts in one array are all truncated

Run tests → verify they fail.

**Step 6: Implement `truncateOversizedParts`**

Iterate through parts. For each part with `state: "output-available"` and an `output` field, check `shouldTruncateToolResult`. If true, save artifact and replace `output` with the marker. Return new parts array (do not mutate input).

Run tests → verify they pass.

**Step 7: Integrate into run-agent.ts onFinish**

Add test to `run-agent.test.ts`:
- When a step produces an oversized tool result, the persisted parts contain the truncated marker instead of the full output

Mock `truncateOversizedParts`.

Modify `run-agent.ts` `onFinish`:
```typescript
const rawParts = buildAssistantPartsFromSteps(steps);
const parts = await truncateOversizedParts(supabase, clientId, rawParts);
```

Run all tests → verify they pass.

---

## Task 8: Provider-Native Compaction + DB Type Patch + Verification

**Files:**
- Modify: `src/lib/runner/run-agent.ts` — Anthropic `providerOptions` in `prepareStep`
- Modify: `src/types/database.ts` — manual patch for `thread_compaction_summaries`

This task adds provider-native compaction support via Anthropic's `compact_20260112` (PR22-4) and finalizes the PR with type patches and full verification.

Currently v1 uses Gemini Flash (Tier 1) which does not support `compact_20260112`. This wiring is forward-compatible for when multi-tier model routing is added and Anthropic models are used. The implementation checks if the model ID starts with an Anthropic prefix; if so, it includes `providerOptions.anthropic.contextManagement.edits` in `prepareStep`.

**Step 1: Write test for Anthropic providerOptions in prepareStep**

Add a test (in `run-agent.test.ts` or a focused test file):
- When model ID indicates Anthropic (e.g., `"anthropic:claude-sonnet-4-6"`), `prepareStep` returns `providerOptions` with `anthropic.contextManagement.edits` containing `compact_20260112`
- When model ID is non-Anthropic (e.g., current Gemini Flash), `prepareStep` does NOT include Anthropic providerOptions
- The compact edit includes `CRM_COMPACTION_INSTRUCTIONS` as instructions

Note: This test may need to verify the shape returned by `prepareStep` rather than the actual `streamText` call, depending on how testable the callback is. Consider extracting the prepareStep logic into a named function for testability.

Run tests → verify they fail.

**Step 2: Implement Anthropic providerOptions in prepareStep**

Extract prepareStep logic into a helper function:
```typescript
function buildPrepareStep(modelId: string) {
  const isAnthropic = modelId.startsWith("anthropic:");
  return ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};
    if (stepNumber >= MAX_STEPS_TIER_1 - 1) {
      result.activeTools = [];
    }
    if (isAnthropic) {
      result.providerOptions = {
        anthropic: {
          contextManagement: {
            edits: [{
              type: "compact_20260112",
              trigger: { tokenCount: 50000 },
              instructions: CRM_COMPACTION_INSTRUCTIONS,
            }],
          },
        },
      };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };
}
```

Use `buildPrepareStep(modelId)` in the `streamText` call.

Run tests → verify they pass.

**Step 3: Patch database types**

Manually add the `thread_compaction_summaries` table type to `src/types/database.ts`. Follow the existing pattern for other tables. Include:
- `Tables` entry with `Row`, `Insert`, `Update` types
- All columns from the migration

**Step 4: Run full test suite**

```bash
npx vitest run
```

Verify:
- All new tests pass (compaction, toolcall-artifacts, context, run-agent)
- All existing tests still pass
- No TypeScript errors (`npx tsc --noEmit`)
- No lint errors

**Step 5: Manual verification checklist**

- [ ] `thread_compaction_summaries` migration applies cleanly
- [ ] Context assembly injects `<compaction-summary>` at layer 5 when summary exists
- [ ] Context assembly loads only post-compaction messages when summary exists
- [ ] Post-run compaction trigger fires when message count exceeds threshold
- [ ] CRM compaction instructions preserve deal names, contacts, tasks, decisions
- [ ] Oversized tool results saved to Storage, truncated in parts
- [ ] `<context-removed>` marker includes valid recovery path for `read_file`
- [ ] Compaction failure does not break the run lifecycle
- [ ] Provider-native compaction wired for Anthropic models (future-proofing)
- [ ] All tests green, no type errors, no lint errors
