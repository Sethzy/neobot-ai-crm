# Context Management Alignment (Zero Tasklet Drift) Implementation Plan

**PR:** PR 22c: Block storage + context management alignment (extends PR 22 — Context recovery + thread compaction)
**Decisions:** DATA-10, SESSION-07
**Goal:** Align Sunder's context management with Tasklet's proven production patterns for permanent sessions — zero architectural drift.

**Architecture:** Two separate layers, matching Tasklet exactly: (1) Size-based truncation at persistence time — every tool call's args + result saved to Supabase Storage, results above threshold replaced with `<context-removed>` marker permanently (DATA-10). (2) Compaction-time handling — trigger events mechanically pruned to title + source, conversation summarized into structured sections (SESSION-07). Agent receives `<context-management>` instructions for recovery via `read_file`.

**Tech Stack:** TypeScript, Vitest, Supabase Storage, Vercel AI SDK (`generateText`)

**Key references:**
- Tasklet `<context-management>` verbatim: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` (lines 31-51)
- Tasklet block structure: `/agent/blocks/{blockId}/` → `args`, `result`, `info`, `{filename}.ext`
- Empirical Tasklet testing: truncation is persistence-time, fixed size threshold (~5KB inline retention), permanent marker, not budget-based. A 617KB scrape was truncated to ~5KB inline. Tasklet's threshold matches Sunder's 5KB.
- Sunder's current threshold: 5KB (`ARTIFACT_SIZE_THRESHOLD_BYTES`) — confirmed match with Tasklet
- Trigger event message format: `src/lib/triggers/trigger-event.ts` — `<trigger-event>` XML with trigger_name, trigger_type, payload

---

## Relevant Files

**Modify:**
- `src/lib/runner/toolcall-artifacts.ts` — add `saveToolcallBlock` (args + result for ALL calls) + update `buildContextRemovedMarker` format
- `src/lib/runner/__tests__/toolcall-artifacts.test.ts` — tests for new block storage + updated marker format
- `src/lib/runner/run-persistence.ts` — wire block storage, remove `appendArtifactRecoveryNote`
- `src/lib/runner/compaction.ts` — structured summary prompt, trigger event partitioning, threshold JSDoc
- `src/lib/runner/__tests__/compaction.test.ts` — tests for structured summary + trigger pruning
- `src/lib/ai/platform-instructions.ts` — add `<context-management>` section (Tasklet verbatim adapted)
- `src/lib/ai/__tests__/platform-instructions.test.ts` — test for `<context-management>`

**Read (reference only):**
- `src/lib/triggers/trigger-event.ts` — trigger message format for detection during compaction
- `src/lib/runner/context.ts` — context assembly (no changes needed — summary format is consumed here)
- `src/lib/runner/message-utils.ts` — `getTextFromParts` used by compaction

---

## Task 1: Block Storage — Save ALL Tool Call Args + Results

Store every tool call's args and result to Supabase Storage on every run, regardless of size. Fire-and-forget (non-blocking, errors logged). The existing `truncateOversizedParts` continues to handle inline truncation for results above 5KB — this task adds a parallel "store everything" path.

**Files:**
- Modify: `src/lib/runner/toolcall-artifacts.ts`
- Modify: `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

### Step 1: Write failing test for `saveToolcallBlock`

```typescript
// src/lib/runner/__tests__/toolcall-artifacts.test.ts — add to existing file

describe("saveToolcallBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads both args.json and result.json to the toolcalls directory", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      { query: "John" },
      { success: true, contacts: [{ name: "John Tan" }] },
    );

    expect(supabase.upload).toHaveBeenCalledTimes(2);
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-abc/args.json",
      expect.any(String),
      expect.objectContaining({ upsert: true }),
    );
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-abc/result.json",
      expect.any(String),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("skips args upload when args is nullish", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      null,
      { success: true },
    );

    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledWith(
      expect.stringContaining("result.json"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("skips result upload when result is nullish", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      { query: "John" },
      null,
    );

    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledWith(
      expect.stringContaining("args.json"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("does nothing when both args and result are nullish", async () => {
    const supabase = createStorageSupabaseMock();

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      null,
      null,
    );

    expect(supabase.upload).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```
Expected: FAIL — `saveToolcallBlock` is not exported.

### Step 3: Implement `saveToolcallBlock`

```typescript
// src/lib/runner/toolcall-artifacts.ts — add new export

/**
 * Saves a tool call's args and result to block storage (fire-and-forget).
 * Both are optional — only non-nullish values are uploaded.
 * This stores ALL tool call data regardless of size, matching Tasklet's block storage pattern.
 */
export async function saveToolcallBlock(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  const argsContent = getSerializedArtifact(args);
  if (argsContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(`${clientId}/toolcalls/${toolCallId}/args.json`, argsContent, {
          upsert: true,
          contentType: "application/json; charset=utf-8",
        })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  const resultContent = getSerializedArtifact(result);
  if (resultContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(`${clientId}/toolcalls/${toolCallId}/result.json`, resultContent, {
          upsert: true,
          contentType: "application/json; charset=utf-8",
        })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  await Promise.all(uploads);
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```
Expected: PASS

### Step 5: Commit

```bash
git add src/lib/runner/toolcall-artifacts.ts src/lib/runner/__tests__/toolcall-artifacts.test.ts
git commit -m "feat(pr22c): add saveToolcallBlock for full block storage of all tool calls"
```

---

## Task 2: Wire Block Storage into `finalizeRun`

Call `saveToolcallBlock` for every tool call in the assistant's response, fire-and-forget. This runs in parallel with the existing `truncateOversizedParts` — block storage saves everything, truncation only replaces the inline version for large results.

**Files:**
- Modify: `src/lib/runner/run-persistence.ts`

### Step 1: Write failing test for block storage wiring in `finalizeRun`

Create a new test file or add to existing run-persistence tests. Since `finalizeRun` has many side effects and the existing codebase tests it through integration tests in `run-agent.test.ts`, we'll test `saveToolcallBlock` wiring by verifying it's called.

Actually — `saveToolcallBlock` is fire-and-forget (errors logged, not thrown). The cleanest approach is to extract tool call parts from the raw parts and call `saveToolcallBlock` for each. No new test file needed — the unit test in Task 1 covers `saveToolcallBlock` itself.

### Step 2: Wire `saveToolcallBlock` into `finalizeRun`

In `src/lib/runner/run-persistence.ts`, after `buildAssistantPartsFromSteps`, iterate over parts to find tool calls and fire `saveToolcallBlock` for each:

```typescript
// src/lib/runner/run-persistence.ts — add import
import { saveToolcallBlock, truncateOversizedParts } from "@/lib/runner/toolcall-artifacts";

// Inside finalizeRun, after: const rawParts = buildAssistantPartsFromSteps(steps);
// Add fire-and-forget block storage for ALL tool calls:
const toolPartsForBlockStorage = rawParts.filter(
  (part) =>
    typeof part.toolCallId === "string" &&
    part.state === "output-available",
);

if (toolPartsForBlockStorage.length > 0) {
  Promise.all(
    toolPartsForBlockStorage.map((part) =>
      saveToolcallBlock(
        supabase,
        clientId,
        part.toolCallId as string,
        part.input ?? null,
        part.output ?? null,
      ),
    ),
  ).catch((blockStorageError) => {
    console.error(`[${logLabel}] block storage persistence failed:`, blockStorageError);
  });
}
```

### Step 3: Run existing tests to verify no regression

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```
Expected: PASS (fire-and-forget doesn't affect existing flow)

### Step 4: Commit

```bash
git add src/lib/runner/run-persistence.ts
git commit -m "feat(pr22c): wire saveToolcallBlock into finalizeRun for all tool calls"
```

---

## Task 3: Remove `appendArtifactRecoveryNote`

The `appendArtifactRecoveryNote` function appends recovery paths to the `content` column text. This is a hack — recovery instructions belong in `<context-management>` platform instructions (Task 6), not in message content.

**Files:**
- Modify: `src/lib/runner/run-persistence.ts`

### Step 1: Write failing test — `appendArtifactRecoveryNote` is no longer called

The function is only used in `finalizeRun`. After removal, `contentText` should NOT contain recovery notes.

```typescript
// Verify in run-persistence.ts that the contentText no longer appends recovery notes.
// No separate test needed — just verify existing tests pass after removal.
```

### Step 2: Remove `appendArtifactRecoveryNote` from `finalizeRun`

In `src/lib/runner/run-persistence.ts`:

1. Remove the `appendArtifactRecoveryNote` function definition entirely
2. Remove the import/usage — change:
   ```typescript
   const contentText = appendArtifactRecoveryNote(
     contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText,
     recoveryPaths,
   );
   ```
   To:
   ```typescript
   const contentText = contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
   ```
3. The `recoveryPaths` variable is still needed for logging (optional) but no longer injected into content.

### Step 3: Run existing tests to verify no regression

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```
Expected: PASS

### Step 4: Commit

```bash
git add src/lib/runner/run-persistence.ts
git commit -m "refactor(pr22c): remove appendArtifactRecoveryNote — replaced by <context-management> instructions"
```

---

## Task 4: Structured Compaction Summary Format

Change the compaction summarizer prompt from free-form narrative to Tasklet's structured section format. The summary should have four sections: `## User Instructions`, `## Workflow`, `## Resources`, `## Current Focus`.

**Files:**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Step 1: Write failing test for structured summary prompt

```typescript
// src/lib/runner/__tests__/compaction.test.ts — add new test

describe("STRUCTURED_SUMMARY_INSTRUCTIONS", () => {
  it("requires four structured sections", () => {
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## User Instructions");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Workflow");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Resources");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Current Focus");
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: FAIL — `STRUCTURED_SUMMARY_INSTRUCTIONS` is not exported.

### Step 3: Implement structured summary instructions

Replace `SUMMARIZATION_PROMPT` and `CRM_COMPACTION_INSTRUCTIONS` with a unified structured prompt:

```typescript
// src/lib/runner/compaction.ts — replace SUMMARIZATION_PROMPT and CRM_COMPACTION_INSTRUCTIONS

/**
 * Structured compaction summary instructions matching Tasklet's "Previous conversation summary" format.
 * The summarizer must produce exactly four sections — no free-form narrative.
 */
export const STRUCTURED_SUMMARY_INSTRUCTIONS = [
  "You are performing a CONTEXT CHECKPOINT COMPACTION for a real estate CRM agent.",
  "Create a structured handoff summary for another LLM that will resume the work.",
  "",
  "You MUST use exactly these four sections:",
  "",
  "## User Instructions",
  "Explicit user preferences, boundaries, communication style, and standing orders.",
  "Include any constraints the user has stated (e.g., 'never call before 9am', 'always CC manager').",
  "",
  "## Workflow",
  "Current progress, key decisions made, and what remains to be done.",
  "Preserve deal names, deal stages, prices, and rationale.",
  "Preserve contact names, phone numbers, emails, and relationship context.",
  "Preserve task statuses, deadlines, commitments, and follow-up obligations.",
  "",
  "## Resources",
  "Important data, file paths, references, trigger configurations, and connection state.",
  "Include any tool call IDs or storage paths the agent may need to recover data from.",
  "",
  "## Current Focus",
  "Clear next steps for the resuming LLM. What should it do first?",
  "",
  "Be concise. Omit filler. Keep concrete facts that affect future work.",
].join("\n");
```

Update `generateCompactionSummary` to use the new instructions:

```typescript
const result = await generateText({
  model: gateway(COMPACTION_MODEL),
  system: STRUCTURED_SUMMARY_INSTRUCTIONS,
  prompt,
});
```

Keep `SUMMARIZATION_PROMPT` and `CRM_COMPACTION_INSTRUCTIONS` as deprecated exports temporarily if any tests reference them, or update the tests to use the new constant.

### Step 4: Update existing compaction tests

Update the `generateCompactionSummary` test that checks for `"CONTEXT CHECKPOINT COMPACTION"` — it should now check `STRUCTURED_SUMMARY_INSTRUCTIONS`:

```typescript
it("calls generateText with COMPACTION_MODEL and structured summary instructions", async () => {
  mockGenerateText.mockResolvedValue({
    text: "## User Instructions\n...\n## Workflow\n...",
    usage: { totalTokens: 222 },
  });

  await generateCompactionSummary({
    existingSummary: "Earlier summary block",
    messages: [
      { role: "user", content: "Call John Tan back tomorrow." },
      { role: "assistant", content: "Added a follow-up task." },
    ],
  });

  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    system: expect.stringContaining("## User Instructions"),
  }));
  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    system: expect.stringContaining("## Current Focus"),
  }));
});
```

### Step 5: Run tests to verify they pass

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: PASS

### Step 6: Commit

```bash
git add src/lib/runner/compaction.ts src/lib/runner/__tests__/compaction.test.ts
git commit -m "feat(pr22c): structured compaction summary with 4 sections matching Tasklet format"
```

---

## Task 5: Trigger Event Pruning During Compaction

During compaction, partition trigger-fired messages from conversation messages. Trigger events are mechanically pruned to just title + source (no LLM summarization). Conversation messages go to the LLM summarizer as before.

Trigger events are identified by their `<trigger-event>` XML format (see `src/lib/triggers/trigger-event.ts`). They are stored as `role: "system"` messages with content starting with `<trigger-event>`.

**Files:**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Step 1: Write failing test for `isTriggerEventMessage`

```typescript
// src/lib/runner/__tests__/compaction.test.ts — add new describe block

describe("isTriggerEventMessage", () => {
  it("returns true for messages starting with <trigger-event>", () => {
    const message = [
      "<trigger-event>",
      "trigger_instance_id: abc-123",
      "trigger_type: rss",
      "trigger_name: PropertyGuru Monitor",
      "payload: {}",
      "</trigger-event>",
    ].join("\n");

    expect(isTriggerEventMessage(message)).toBe(true);
  });

  it("returns false for regular user messages", () => {
    expect(isTriggerEventMessage("Call John Tan back")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isTriggerEventMessage("")).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: FAIL — `isTriggerEventMessage` is not exported.

### Step 3: Implement `isTriggerEventMessage`

```typescript
// src/lib/runner/compaction.ts — add export

/**
 * Returns true when the message content is a trigger event system message.
 */
export function isTriggerEventMessage(content: string): boolean {
  return content.trimStart().startsWith("<trigger-event>");
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: PASS

### Step 5: Write failing test for `pruneTriggerEvents`

```typescript
// src/lib/runner/__tests__/compaction.test.ts — add new describe block

describe("pruneTriggerEvents", () => {
  it("extracts trigger name and type into a <context-removed> summary", () => {
    const triggerMessages = [
      {
        role: "system",
        content: [
          "<trigger-event>",
          "trigger_instance_id: abc-123",
          "trigger_type: rss",
          "fired_at: 2026-03-06T10:00:00.000Z",
          "trigger_name: PropertyGuru Monitor",
          "instruction_path: triggers/abc-123/instructions.md",
          'payload: {"new_items":[{"title":"3BR condo at Tampines"}]}',
          "</trigger-event>",
        ].join("\n"),
      },
      {
        role: "system",
        content: [
          "<trigger-event>",
          "trigger_instance_id: def-456",
          "trigger_type: schedule",
          "fired_at: 2026-03-06T16:00:00.000Z",
          "trigger_name: Daily CRM check",
          "instruction_path: triggers/def-456/instructions.md",
          "payload: {}",
          "</trigger-event>",
        ].join("\n"),
      },
    ];

    const result = pruneTriggerEvents(triggerMessages);

    expect(result).toContain("<context-removed>");
    expect(result).toContain("Omitted 2 trigger invocation(s)");
    expect(result).toContain("PropertyGuru Monitor (rss)");
    expect(result).toContain("Daily CRM check (schedule)");
    expect(result).toContain("</context-removed>");
    // Should NOT contain the full payload
    expect(result).not.toContain("3BR condo");
  });

  it("returns empty string when given no trigger messages", () => {
    expect(pruneTriggerEvents([])).toBe("");
  });
});
```

### Step 6: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: FAIL — `pruneTriggerEvents` is not exported.

### Step 7: Implement `pruneTriggerEvents`

```typescript
// src/lib/runner/compaction.ts — add export

/**
 * Extracts trigger name and type from trigger event messages into a mechanical summary.
 * Matches Tasklet's trigger invocation pruning: just title + source, no LLM summarization.
 */
export function pruneTriggerEvents(
  triggerMessages: Array<{ role: string; content: string }>,
): string {
  if (triggerMessages.length === 0) {
    return "";
  }

  const entries = triggerMessages.map((msg) => {
    const nameMatch = msg.content.match(/trigger_name:\s*(.+)/);
    const typeMatch = msg.content.match(/trigger_type:\s*(.+)/);
    const name = nameMatch?.[1]?.trim() ?? "unknown";
    const type = typeMatch?.[1]?.trim() ?? "unknown";
    return `${name} (${type})`;
  });

  return [
    "<context-removed>",
    `Omitted ${triggerMessages.length} trigger invocation(s) to reduce context size:`,
    ...entries.map((entry) => `- ${entry}`),
    "</context-removed>",
  ].join("\n");
}
```

### Step 8: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: PASS

### Step 9: Wire trigger partitioning into `maybeCompactThread`

In `maybeCompactThread`, before sending messages to `generateCompactionSummary`, partition them:

```typescript
// In maybeCompactThread, after rowsToCompact is computed:

const conversationRows: typeof rowsToCompact = [];
const triggerRows: typeof rowsToCompact = [];

for (const row of rowsToCompact) {
  const text = row.content ?? getTextFromParts(row.parts);
  if (row.role === "system" && isTriggerEventMessage(text)) {
    triggerRows.push(row);
  } else {
    conversationRows.push(row);
  }
}

const triggerPrunedSummary = pruneTriggerEvents(
  triggerRows.map((row) => ({
    role: row.role,
    content: row.content ?? getTextFromParts(row.parts),
  })),
);

// Only send conversation messages (not trigger events) to the LLM summarizer
const summary = await generateCompactionSummary({
  existingSummary: compactionState?.compaction_summary ?? "",
  messages: conversationRows
    .map((row) => ({
      role: row.role,
      content: row.content ?? getTextFromParts(row.parts),
    }))
    .filter((row) => row.content.trim().length > 0),
});
```

Then combine the trigger pruned summary with the LLM summary when persisting:

```typescript
const combinedSummary = [summary.summaryText, triggerPrunedSummary]
  .filter((s) => s.trim().length > 0)
  .join("\n\n");

if (combinedSummary.trim().length === 0) {
  return false;
}

const prefixedSummary = addSummaryPrefix(combinedSummary);
```

### Step 10: Write test for trigger partitioning in `maybeCompactThread`

```typescript
// src/lib/runner/__tests__/compaction.test.ts — add to maybeCompactThread describe block

it("partitions trigger events from conversation and prunes them mechanically", async () => {
  mockGenerateText.mockResolvedValue({
    text: "## User Instructions\nNone\n## Workflow\nDiscussed deals\n## Resources\nNone\n## Current Focus\nFollow up",
    usage: { totalTokens: 100 },
  });

  const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 10);
  // Replace a few early messages with trigger events
  messageRows[5] = {
    ...messageRows[5],
    role: "system",
    content: "<trigger-event>\ntrigger_instance_id: t1\ntrigger_type: rss\ntrigger_name: PropertyGuru\npayload: {}\n</trigger-event>",
  };
  messageRows[10] = {
    ...messageRows[10],
    role: "system",
    content: "<trigger-event>\ntrigger_instance_id: t2\ntrigger_type: schedule\ntrigger_name: Daily Check\npayload: {}\n</trigger-event>",
  };

  const supabase = createCompactionSupabaseMock({
    threadRow: {
      thread_id: createUuid(90),
      client_id: createUuid(91),
      compaction_summary: null,
      compaction_compacted_through_at: null,
      compaction_compacted_through_message_id: null,
      compaction_summary_model: null,
      compaction_summary_tokens_used: null,
    },
    messageRows,
  });

  await maybeCompactThread(
    supabase.client as never,
    createUuid(91),
    createUuid(90),
  );

  // Trigger events should NOT be in the LLM summarizer prompt
  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    prompt: expect.not.stringContaining("<trigger-event>"),
  }));
  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    prompt: expect.not.stringContaining("PropertyGuru"),
  }));

  // But the persisted summary should contain the pruned trigger summary
  expect(supabase.calls.methods).toEqual(
    expect.arrayContaining([
      {
        method: "update",
        args: [expect.objectContaining({
          compaction_summary: expect.stringContaining("Omitted 2 trigger invocation(s)"),
        })],
      },
    ]),
  );
});
```

### Step 11: Run all compaction tests

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: PASS

### Step 12: Commit

```bash
git add src/lib/runner/compaction.ts src/lib/runner/__tests__/compaction.test.ts
git commit -m "feat(pr22c): trigger event pruning during compaction — mechanical title+source extraction"
```

---

## Task 6: Add `<context-management>` to Platform Instructions + Update Truncation Marker Format

Add a `<context-management>` section to platform instructions matching Tasklet's verbatim format. Covers TWO types of context removal (size-based truncation AND trigger event pruning), with examples of both formats and a MUST directive. Also update `buildContextRemovedMarker` to match the format described in the instructions.

**Tasklet's verbatim `<context-management>` for reference** (from `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md`):
```xml
<context-management>
To keep your context size manageable, some block data may be truncated
or removed. Context that has been truncated or removed will be marked
by a <context-removed> tag.
You MUST read the full untruncated data from the filesystem using the
read_file tool and the blockId for the block if you need the information
to complete your work.

Tool call block results always end with a blockId. If a tool call block
result has been truncated you will see a note like this:
<context-removed>Data truncated: 16KB -> 5KB</context-removed>

Sometimes entire sequences of tool call blocks may be removed. In this
case, you will see a user message with a context management note and a
list of removed blocks.
Each item in the list will begin with the blockId. Here's an example of
two removed tool call blocks:
<context-removed>
Omitted 2 tool call(s) to reduce context size:
b_123: tool_name(args: {...});
b_124: tool_name(args: {...});
</context-removed>

To read the full arguments and results for a tool call block, use the blockId:
read_file(path: "/agent/blocks/b_123/args")
read_file(path: "/agent/blocks/b_123/result")
</context-management>
```

**Files:**
- Modify: `src/lib/ai/platform-instructions.ts`
- Modify: `src/lib/ai/__tests__/platform-instructions.test.ts`
- Modify: `src/lib/runner/toolcall-artifacts.ts` — update `buildContextRemovedMarker` format
- Modify: `src/lib/runner/__tests__/toolcall-artifacts.test.ts` — update marker format tests

### Step 1: Write failing test for `<context-management>` section

```typescript
// src/lib/ai/__tests__/platform-instructions.test.ts — add to existing describe block

it("includes <context-management> instructions with recovery guidance", () => {
  const instructions = buildPlatformInstructions();

  expect(instructions).toContain("<context-management>");
  expect(instructions).toContain("</context-management>");
  // MUST directive
  expect(instructions).toContain("You MUST read the full untruncated data");
  // Truncation example format
  expect(instructions).toContain("Data truncated:");
  expect(instructions).toContain("<context-removed>");
  // Recovery paths
  expect(instructions).toContain("read_file");
  expect(instructions).toContain("toolcalls/");
  expect(instructions).toContain("result.json");
  expect(instructions).toContain("args.json");
  // Trigger pruning example
  expect(instructions).toContain("trigger invocation");
  expect(instructions).toContain("Omitted");
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/ai/__tests__/platform-instructions.test.ts
```
Expected: FAIL — no `<context-management>` section exists yet.

### Step 3: Implement `<context-management>` section

Add to `BASE_PLATFORM_INSTRUCTIONS` in `src/lib/ai/platform-instructions.ts`, inside the `<platform-instructions>` tag. Adapted from Tasklet's verbatim, using Sunder's path convention (`toolcalls/{toolCallId}/` instead of `/agent/blocks/{blockId}/`):

```typescript
// Add after </thread-naming> and before </platform-instructions>:

<context-management>
To keep your context size manageable, some tool call data may be truncated or removed.
Context that has been truncated or removed will be marked by a <context-removed> tag.

You MUST read the full untruncated data from storage using read_file if you need
the information to complete your work.

Tool call results that exceeded the size threshold have been truncated inline.
You will see a note like:
<context-removed>Data truncated: 50KB -> 5KB. path: toolcalls/{toolCallId}/result.json</context-removed>

To read the full arguments and results for a tool call, use the toolCallId:
read_file(path: "toolcalls/{toolCallId}/result.json")
read_file(path: "toolcalls/{toolCallId}/args.json")

Sometimes entire sequences of trigger invocations may be pruned during compaction.
You will see a summary like:
<context-removed>
Omitted N trigger invocation(s) to reduce context size:
- TriggerName (type)
</context-removed>

You do not need to recover pruned trigger events unless specifically asked about them.
</context-management>
```

### Step 4: Update `buildContextRemovedMarker` format

The inline truncation marker format must match what `<context-management>` describes. Update `buildContextRemovedMarker` in `src/lib/runner/toolcall-artifacts.ts`:

**Before:**
```typescript
export function buildContextRemovedMarker(
  storagePath: string,
  originalSizeBytes: number,
): string {
  return `<context-removed path="${storagePath}" reason="Result exceeded size threshold (${originalSizeBytes} bytes). Use read_file to recover the full content." />`;
}
```

**After:**
```typescript
/**
 * Produces the inline marker stored in the persisted tool part after truncation.
 * Format matches what <context-management> instructions describe to the agent.
 */
export function buildContextRemovedMarker(
  storagePath: string,
  originalSizeBytes: number,
): string {
  const originalKB = Math.round(originalSizeBytes / 1024);
  const thresholdKB = Math.round(ARTIFACT_SIZE_THRESHOLD_BYTES / 1024);
  return `<context-removed>Data truncated: ${originalKB}KB -> ${thresholdKB}KB. path: ${storagePath}</context-removed>`;
}
```

Note: import `ARTIFACT_SIZE_THRESHOLD_BYTES` is already imported at the top of `toolcall-artifacts.ts`.

### Step 5: Update `buildContextRemovedMarker` tests

Update any tests that check the marker format to match the new pattern:

```typescript
it("produces a context-removed marker with size info and path", () => {
  const marker = buildContextRemovedMarker("toolcalls/call-abc/result.json", 50_000);
  expect(marker).toContain("<context-removed>");
  expect(marker).toContain("</context-removed>");
  expect(marker).toContain("Data truncated: 49KB -> 5KB");
  expect(marker).toContain("path: toolcalls/call-abc/result.json");
});
```

### Step 6: Run tests to verify they pass

```bash
pnpm vitest run src/lib/ai/__tests__/platform-instructions.test.ts
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```
Expected: PASS

### Step 7: Run full test suite to verify no regression

```bash
pnpm vitest run src/lib/ai/__tests__/
pnpm vitest run src/lib/runner/__tests__/
```
Expected: PASS

### Step 8: Commit

```bash
git add src/lib/ai/platform-instructions.ts src/lib/ai/__tests__/platform-instructions.test.ts src/lib/runner/toolcall-artifacts.ts src/lib/runner/__tests__/toolcall-artifacts.test.ts
git commit -m "feat(pr22c): add <context-management> instructions and update truncation marker format"
```

---

## Task 7: Threshold Documentation (Resolved — No Code Change)

**Decision: Keep 5KB. Confirmed match with Tasklet.**

Empirical Tasklet testing (2026-03-09) showed a 617KB web scrape was truncated to ~5KB inline. The previous assumption that Tasklet's threshold was ~100KB was incorrect — Tasklet truncates DOWN TO ~5KB, matching our `ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000` exactly.

**Files:**
- Modify: `src/lib/runner/compaction.ts` — add JSDoc comment documenting the Tasklet parity

### Step 1: Add documentation comment to threshold constant

```typescript
// src/lib/runner/compaction.ts — update the constant's JSDoc:

/**
 * Tool results at or above this persisted size are stored as artifacts instead.
 * Confirmed match with Tasklet's inline retention target (~5KB) via empirical testing
 * (2026-03-09): a 617KB scrape was truncated to ~5KB inline. Truncation is persistence-time,
 * fixed threshold, permanent — not budget-based.
 */
export const ARTIFACT_SIZE_THRESHOLD_BYTES = 5_000;
```

### Step 2: Verify existing test passes (no value change)

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```
Expected: PASS — the constant value is unchanged.

### Step 3: Commit

```bash
git add src/lib/runner/compaction.ts
git commit -m "docs(pr22c): document 5KB threshold as confirmed Tasklet parity"
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | `saveToolcallBlock` — store ALL args + results | `toolcall-artifacts.ts` |
| 2 | Wire block storage into `finalizeRun` | `run-persistence.ts` |
| 3 | Remove `appendArtifactRecoveryNote` | `run-persistence.ts` |
| 4 | Structured compaction summary (4 sections) | `compaction.ts` |
| 5 | Trigger event pruning during compaction | `compaction.ts` |
| 6 | `<context-management>` + truncation marker format | `platform-instructions.ts`, `toolcall-artifacts.ts` |
| 7 | Threshold documentation (resolved: keep 5KB) | `compaction.ts` (comment only) |

**Run order:** Tasks 1-3 are sequential (1 builds the function, 2 wires it, 3 removes the old hack). Tasks 4-6 are independent of each other and of 1-3. Task 7 is a comment-only commit, can go anytime.

## Tasklet Verification Notes (2026-03-09)

All 6 pieces confirmed as exact match with Tasklet via empirical testing + system prompt inspection from inside a live Tasklet agent. Key corrections applied:

1. **Threshold**: Tasklet's inline retention is ~5KB (not ~100KB as previously assumed). Our 5KB matches.
2. **`<context-management>` format**: Tasklet covers two removal types (truncation + full removal) with examples of both. Task 6 expanded to match.
3. **`buildContextRemovedMarker` format**: Updated to `<context-removed>Data truncated: NKB -> 5KB. path: ...</context-removed>` to match what `<context-management>` instructions describe.

**Deliberate simplifications (confirmed low risk by Tasklet dev):**
- No `info` file in block storage (Tasklet has `{toolName, startTime}` — 65 bytes. Add later if debugging needs it.)
- No assembly-time "unshrink" logic (Tasklet doesn't do this either — truncation is permanent.)
- Path convention `toolcalls/{toolCallId}/` vs Tasklet's `/agent/blocks/{blockId}/` — functionally identical.
