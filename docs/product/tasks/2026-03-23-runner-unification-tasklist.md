# Runner Unification Implementation Plan

**PR:** Out-of-plan refactor — runner deduplication (aligned with Deep Agents reference pattern)
**Decisions:** RUNNER-01, RUNNER-02 (runner engine design)
**Goal:** Eliminate ~60% duplicated logic between `run-agent.ts` and `run-autopilot.ts` by making `runAutopilot` a thin wrapper around `runAgent`.

**Architecture:** `runAutopilot` becomes a ~30-line function that calls `runAgent` with pulse parameters (`triggerType: "pulse"`, `input: ""`, `consumeMessageQuota: false`, `instructions: AUTOPILOT_INSTRUCTION_PROMPT`), then awaits `result.streamResult.consumeStream({ onError })` to block until finalization completes and detect stream/finalization failures. Four small changes in `runAgent` make it handle pulse correctly: skip enqueue on busy, skip user message creation, pass through instructions, and disable connection mutations. No new files, no new types.

**Tech Stack:** Vercel AI SDK v6 (`streamText`, `consumeStream`), Vitest, Zod

**Design doc:** `roadmap docs/Sunder - Source of Truth/references/deepagents/03-runner-unification-design-doc.md`

**Review fixes applied:**
1. Diff summary table row for `allowConnectionMutations` said `triggerType === "chat"` but actual proposed code is `triggerType !== "pulse"` — corrected in this tasklist.
2. `consumeStream()` silently swallows errors from `onFinish` — **fixed**: wrapper passes `onError` callback to `consumeStream()` to detect stream/finalization failures. When `onFinish` throws, `flush()` catches it and calls `controller.error(error)`, which propagates through the stream to `consumeStream`'s `onError` callback. Verified in AI SDK source: `consume-stream.ts:26` catches reader errors and calls `onError`. This is strictly safer than the original design (which used bare `consumeStream()` and would silently report success on finalization failures).
3. Pulse safety coverage preserved — direct assertions for trigger mutations off, connection mutations off, browser tools off, and listing tools off added to `run-agent.test.ts` (not just the wrapper mock tests). This replaces the coverage currently provided by `run-autopilot.test.ts:185` which directly proved the restricted tool surface.
4. Task 6 labeled honestly as a characterization test (refactor guard for existing behavior), not red-green TDD.

---

## Relevant Files

**Modify:**
- `src/lib/runner/schemas.ts` — add `instructions` field
- `src/lib/runner/run-agent.ts:182-196,241,257` — 4 pulse-handling changes
- `src/lib/runner/run-autopilot.ts` — replace 140 lines with ~25-line wrapper

**Test (modify):**
- `src/lib/runner/__tests__/schemas.test.ts` — add `instructions` field tests
- `src/lib/runner/__tests__/run-agent.test.ts` — add pulse-specific behavior tests
- `src/lib/runner/__tests__/run-autopilot.test.ts` — rewrite to test wrapper contract

**No changes needed:**
- `src/lib/runner/context.ts` — already accepts `instructions?: string` (line 44)
- `src/lib/runner/tool-registry.ts` — already accepts `allowConnectionMutations?: boolean` (line 28)
- `src/lib/triggers/executor.ts` — caller unchanged, wrapper produces exact same statuses
- `src/lib/runner/__tests__/run-agent-crm-config.test.ts` — tests unaffected internals
- `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts` — tests unaffected internals
- `src/lib/runner/__tests__/serialization.test.ts` — tests unaffected internals
- `src/lib/runner/__tests__/stale-cleanup.test.ts` — tests unaffected internals

---

### Task 1: Add `instructions` field to runner payload schema

**Files:**
- Modify: `src/lib/runner/schemas.ts:19-29`
- Test: `src/lib/runner/__tests__/schemas.test.ts`

**Context:** The schema currently has no `instructions` field. The wrapper needs to pass `AUTOPILOT_INSTRUCTION_PROMPT` through `runAgent` → `assembleContext`. Since `assembleContext` already accepts `instructions?: string` (see `src/lib/runner/context.ts:44`), we only need to add it to the schema so `RunnerPayload` includes it.

No callers validate the payload with `.parse()` or `.safeParse()` at runtime — the schema is only used for type inference (`RunnerPayload = z.infer<typeof runnerPayloadSchema>`). Adding an optional field is backward-compatible.

**Step 1: Write the failing test for instructions acceptance**

Add a new test to `src/lib/runner/__tests__/schemas.test.ts` inside the existing `describe("runnerPayloadSchema")` block, after the `"rejects invalid crm mode"` test (line 66):

```typescript
  test("accepts optional instructions override for autopilot", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "pulse" as const,
      input: "",
      instructions: "You are running an autonomous pulse.",
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/schemas.test.ts --reporter=verbose
```

Expected: FAIL — Zod will strip the `instructions` field (unrecognized key), causing the `.toEqual` assertion to fail because the parsed output won't include `instructions`.

**Step 3: Add `instructions` to the schema**

In `src/lib/runner/schemas.ts`, add one line inside the `runnerPayloadSchema` object (after `includeConfigTool`, line 28):

```typescript
export const runnerPayloadSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  consumeMessageQuota: z.boolean().optional(),
  input: z.string(),
  channel: z.enum(runnerChannelValues).optional(),
  fileParts: z.array(runnerFilePartSchema).optional(),
  crmMode: z.enum(["normal", "setup"]).optional(),
  includeConfigTool: z.boolean().optional(),
  instructions: z.string().optional(),
});
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/schemas.test.ts --reporter=verbose
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/runner/schemas.ts src/lib/runner/__tests__/schemas.test.ts
git commit -m "feat(runner-unification): add instructions field to runner payload schema"
```

---

### Task 2: Skip enqueue for pulse when thread is busy

**Files:**
- Modify: `src/lib/runner/run-agent.ts:182-193`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`

**Context:** When a thread is already running, `runAgent` currently enqueues the message for all trigger types. Pulse runs should NOT enqueue — they should just return `"queued"` immediately (the wrapper maps this to `"skipped_busy"`). The current `runAutopilot` achieves this by checking `lockResult.created` and returning `"skipped_busy"` without calling `enqueueMessage`.

**Step 1: Write the failing test**

Add a new test to `src/lib/runner/__tests__/run-agent.test.ts`, inside the `describe("runAgent")` block. Add it after the existing `"enqueues and returns queued when thread is already running"` test (around line 555):

```typescript
  it("returns queued without enqueuing when a pulse run finds a busy thread", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "returns queued without enqueuing when a pulse run finds a busy thread" --reporter=verbose
```

Expected: FAIL — `mockEnqueueMessage` WILL be called because `run-agent.ts:183` calls `enqueueMessage` for all trigger types.

**Step 3: Add the pulse guard**

In `src/lib/runner/run-agent.ts`, modify the busy-thread block (lines 182-193). Change from:

```typescript
    if (!lockResult.created) {
      await enqueueMessage(supabase, {
        threadId,
        clientId,
        content: input,
        fileParts: payload.fileParts,
        channel: payload.channel ?? "web",
        ...(payload.triggerType === "chat" ? {} : { triggerType: payload.triggerType }),
      });
      shouldReleaseConsumedQuota = false;
      return { status: "queued" };
    }
```

To:

```typescript
    if (!lockResult.created) {
      if (payload.triggerType === "pulse") {
        return { status: "queued" };
      }
      await enqueueMessage(supabase, {
        threadId,
        clientId,
        content: input,
        fileParts: payload.fileParts,
        channel: payload.channel ?? "web",
        ...(payload.triggerType === "chat" ? {} : { triggerType: payload.triggerType }),
      });
      shouldReleaseConsumedQuota = false;
      return { status: "queued" };
    }
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "returns queued without enqueuing when a pulse run finds a busy thread" --reporter=verbose
```

Expected: PASS

**Step 5: Run all run-agent tests to check for regressions**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner-unification): skip enqueue for pulse on busy thread"
```

---

### Task 3: Skip user message creation for pulse

**Files:**
- Modify: `src/lib/runner/run-agent.ts:196`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`

**Context:** `runAgent` currently creates a user message for all trigger types except `"cron"` (line 196: `if (payload.triggerType !== "cron")`). Pulse runs have no inbound user message, so they should also skip this step. The current `runAutopilot` never creates user messages.

**Step 1: Write the failing test**

Add a new test to `src/lib/runner/__tests__/run-agent.test.ts`:

```typescript
  it("does not create a user message for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateMessages).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalled();
  });
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "does not create a user message for pulse runs" --reporter=verbose
```

Expected: FAIL — `mockCreateMessages` WILL be called because pulse is not excluded from the `triggerType !== "cron"` check.

**Step 3: Add pulse to the skip condition**

In `src/lib/runner/run-agent.ts`, change line 196 from:

```typescript
    if (payload.triggerType !== "cron") {
```

To:

```typescript
    if (payload.triggerType !== "cron" && payload.triggerType !== "pulse") {
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "does not create a user message for pulse runs" --reporter=verbose
```

Expected: PASS

**Step 5: Run all run-agent tests to check for regressions**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner-unification): skip user message creation for pulse runs"
```

---

### Task 4: Pass `instructions` through to `assembleContext`

**Files:**
- Modify: `src/lib/runner/run-agent.ts:241`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`

**Context:** `assembleContext` already accepts `instructions?: string` (see `src/lib/runner/context.ts:44`), but `runAgent` doesn't pass it. The current `runAutopilot` passes `AUTOPILOT_INSTRUCTION_PROMPT` directly to `assembleContext` (line 61). After this change, `runAgent` will forward `payload.instructions` to `assembleContext`, so the wrapper can inject the autopilot prompt.

**Step 1: Write the failing test**

Add a new test to `src/lib/runner/__tests__/run-agent.test.ts`:

```typescript
  it("passes instructions through to assembleContext when provided", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
        instructions: "You are running an autonomous pulse.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "You are running an autonomous pulse.",
      }),
    );
  });
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "passes instructions through to assembleContext when provided" --reporter=verbose
```

Expected: FAIL — `assembleContext` is called without `instructions` in its argument object.

**Step 3: Add instructions passthrough**

In `src/lib/runner/run-agent.ts`, add `instructions: payload.instructions,` to the `assembleContext` call. Change the block starting at line 241 from:

```typescript
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      crmConfig,
      crmMode,
      includeBrowserAutomation:
        payload.triggerType === "chat" && isBrowserUseConfigured(),
      includeMarketData: isPropertySupabaseConfigured(),
      includePropertyListings:
        payload.triggerType === "chat" && isApifyConfigured(),
      crmConfigModeActive: payload.includeConfigTool,
    });
```

To:

```typescript
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      instructions: payload.instructions,
      crmConfig,
      crmMode,
      includeBrowserAutomation:
        payload.triggerType === "chat" && isBrowserUseConfigured(),
      includeMarketData: isPropertySupabaseConfigured(),
      includePropertyListings:
        payload.triggerType === "chat" && isApifyConfigured(),
      crmConfigModeActive: payload.includeConfigTool,
    });
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "passes instructions through to assembleContext when provided" --reporter=verbose
```

Expected: PASS

**Step 5: Verify existing tests still pass (instructions should be undefined for non-pulse calls)**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: ALL PASS — existing tests don't assert on `instructions`, so the new `instructions: undefined` field won't break them.

**Step 6: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner-unification): pass instructions through to assembleContext"
```

---

### Task 5: Disable connection mutations for pulse runs

**Files:**
- Modify: `src/lib/runner/run-agent.ts:257`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`

**Context:** The `createRunnerTools` call currently doesn't set `allowConnectionMutations` — it defaults to `true` via `tool-registry.ts:64`. The current `runAutopilot` explicitly sets `allowConnectionMutations: false` (line 67). The change is `allowConnectionMutations: payload.triggerType !== "pulse"`, which gives `false` for pulse and `true` for chat/cron/webhook (preserving existing behavior).

**Important:** The design doc's diff summary table incorrectly says `triggerType === "chat"` — that would block connection mutations for cron/webhook too. The correct condition is `triggerType !== "pulse"`.

**Step 1: Write the failing test**

Add a new test to `src/lib/runner/__tests__/run-agent.test.ts`:

```typescript
  it("disables connection mutations for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: false },
    );
  });
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "disables connection mutations for pulse runs" --reporter=verbose
```

Expected: FAIL — `mockCreateConnectionTools` is called with `{ allowMutations: true }` (the default).

**Step 3: Add allowConnectionMutations to createRunnerTools call**

In `src/lib/runner/run-agent.ts`, modify the `createRunnerTools` call (around line 257). Change from:

```typescript
    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      crmMode,
      crmConfig,
      includeBrowserTools: payload.triggerType === "chat",
      includeMarketTools: true,
      includeListingTools: payload.triggerType === "chat",
      includeConfigTool: payload.includeConfigTool,
    });
```

To:

```typescript
    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      allowConnectionMutations: payload.triggerType !== "pulse",
      crmMode,
      crmConfig,
      includeBrowserTools: payload.triggerType === "chat",
      includeMarketTools: true,
      includeListingTools: payload.triggerType === "chat",
      includeConfigTool: payload.includeConfigTool,
    });
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "disables connection mutations for pulse runs" --reporter=verbose
```

Expected: PASS

**Step 5: Write guard tests — full pulse safety boundary coverage**

These tests replace the safety coverage currently in `run-autopilot.test.ts:185` which directly proved the restricted tool surface. Since pulse logic now lives in `runAgent`, the safety assertions must live in `run-agent.test.ts`.

Add the following tests:

```typescript
  it("keeps connection mutations enabled for cron runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "cron",
        input: "Process the most recent trigger event.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: true },
    );
  });

  it("disables trigger mutations for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateTriggerTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
      { allowMutations: false },
    );
  });

  it("excludes browser and listing tools from pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.objectContaining({
          browse_website: expect.anything(),
          search_99co: expect.anything(),
          search_propertyguru: expect.anything(),
        }),
      }),
    );
  });
```

**Step 6: Run all run-agent tests**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: ALL PASS — the trigger mutation test passes because `allowTriggerMutations: payload.triggerType === "chat"` is already `false` for pulse. Browser and listing tool tests pass because `includeBrowserTools` and `includeListingTools` are gated on `triggerType === "chat"`.

**Step 7: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner-unification): disable connection mutations for pulse runs

Also adds pulse safety boundary tests: trigger mutations off, connection
mutations off, browser tools excluded, listing tools excluded. These replace
the coverage previously in run-autopilot.test.ts."
```

---

### Task 6: Characterization test — lock pulse→autopilot run type mapping

**Files:**
- Test: `src/lib/runner/__tests__/run-agent.test.ts`

**Context:** `run-agent.ts:111-113` maps `triggerType: "pulse"` to `runType: "autopilot"` for the `createRun` call. This already exists in the code — no production change needed. But we need a test to lock this behavior since the wrapper depends on it (the run must be stored as "autopilot" type, not "pulse").

**Note:** This is a **characterization test** — a refactor guard for existing behavior, not a red-green TDD cycle. The test is expected to pass immediately. We're locking behavior we depend on before changing the caller.

**Step 1: Write the characterization test**

Add a test to `src/lib/runner/__tests__/run-agent.test.ts`:

```typescript
  it("persists pulse runs with autopilot run type", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateRun).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      runType: "autopilot",
    });
  });
```

**Step 2: Run test to verify it passes immediately**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "persists pulse runs with autopilot run type" --reporter=verbose
```

Expected: PASS — this is existing behavior, the test just locks it.

**Step 3: Commit**

```bash
git add src/lib/runner/__tests__/run-agent.test.ts
git commit -m "test(runner-unification): characterization test — lock pulse→autopilot run type mapping"
```

---

### Task 7: Rewrite `runAutopilot` as a thin wrapper

**Files:**
- Modify: `src/lib/runner/run-autopilot.ts` (replace all 140 lines)
- Test: `src/lib/runner/__tests__/run-autopilot.test.ts` (rewrite all tests)

**Context:** This is the core change. The current `runAutopilot` is a 140-line function that duplicates most of `runAgent`'s logic (stale cleanup, run lock, context assembly, `generateText`, finalization, error handling). The new version calls `runAgent` and translates the result.

Key behavioral notes for testing:
- `consumeStream()` blocks until `onFinish` completes (verified in AI SDK source: `stream-text.ts:1072-1175` — `flush()` awaits `notify({ onFinish })`, and `consumeStream` reads `fullStream` which derives from this TransformStream).
- The wrapper passes `onError` to `consumeStream()` to detect stream/finalization failures. When `onFinish` throws inside `flush()`, the catch block calls `controller.error(error)`, which propagates through the teed stream to `consumeStream`'s reader. The utility `consumeStream` at `consume-stream.ts:26` catches reader errors and calls `onError`. This is strictly safer than bare `consumeStream()`.
- `runAgent`'s `recordFailedRun` handles run lifecycle cleanup (marking the run as failed in DB) before rethrowing. The wrapper just translates "throw" → `{ status: "failed" }`.
- The wrapper never throws — all errors are returned as `{ status: "failed", error }`.

**Step 1: Write the failing tests (complete replacement of test file)**

Replace the entire contents of `src/lib/runner/__tests__/run-autopilot.test.ts`:

```typescript
/**
 * Tests for the autopilot wrapper around runAgent.
 * @module lib/runner/__tests__/run-autopilot
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { runAutopilot } from "../run-autopilot";

describe("runAutopilot", () => {
  const clientId = "550e8400-e29b-41d4-a716-446655440000";
  const threadId = "660e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runAgent with pulse parameters and consumes the stream on success", async () => {
    const mockConsumeStream = vi.fn().mockResolvedValue(undefined);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "completed" });
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId,
        threadId,
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
        instructions: AUTOPILOT_INSTRUCTION_PROMPT,
      },
      "supabase",
    );
    expect(mockConsumeStream).toHaveBeenCalledOnce();
  });

  it("maps queued status to skipped_busy", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "skipped_busy" });
  });

  it("catches runAgent throws and returns failed status", async () => {
    mockRunAgent.mockRejectedValue(new Error("LLM timeout"));

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "LLM timeout" });
  });

  it("handles non-Error throws with a generic message", async () => {
    mockRunAgent.mockRejectedValue("raw string error");

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "Unknown autopilot error" });
  });

  it("never throws — all errors are returned as failed status", async () => {
    mockRunAgent.mockRejectedValue(new Error("catastrophic"));

    // This must not throw
    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result.status).toBe("failed");
  });

  it("detects stream errors via consumeStream onError and returns failed", async () => {
    const streamError = new Error("finalizeRun failed");
    const mockConsumeStream = vi.fn().mockImplementation(
      (options?: { onError?: (error: unknown) => void }) => {
        // Simulate: flush() caught onFinish error, called controller.error(),
        // stream errored, consumeStream caught the read error and calls onError
        options?.onError?.(streamError);
        return Promise.resolve();
      },
    );
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "finalizeRun failed" });
  });

  it("detects non-Error stream failures via consumeStream onError", async () => {
    const mockConsumeStream = vi.fn().mockImplementation(
      (options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.("raw error string");
        return Promise.resolve();
      },
    );
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "Stream consumption failed" });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts --reporter=verbose
```

Expected: FAIL — the current `run-autopilot.ts` imports `generateText` from `ai`, not `runAgent`. The mock for `@/lib/runner/run-agent` won't intercept the current implementation. Tests will fail because `mockRunAgent` was never called (the real `runAutopilot` uses `generateText` directly).

**Step 3: Replace `run-autopilot.ts` with the thin wrapper**

Replace the entire contents of `src/lib/runner/run-autopilot.ts`:

```typescript
/**
 * Autonomous autopilot pulse runner — thin wrapper around runAgent.
 * @module lib/runner/run-autopilot
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunAutopilotInput {
  clientId: string;
  threadId: string;
  supabase: ChatSupabaseClient;
}

export type RunAutopilotResult =
  | { status: "completed" }
  | { status: "skipped_busy" }
  | { status: "failed"; error: string };

/**
 * Executes one autopilot pulse by delegating to the unified runner.
 * Busy threads are skipped (not queued). Errors are caught and returned
 * as `{ status: "failed" }` — this function never throws.
 *
 * Uses `consumeStream({ onError })` to block until the full stream
 * (including `onFinish` / `finalizeRun`) completes. The `onError` callback
 * detects stream and finalization failures that `consumeStream()` would
 * otherwise silently swallow. Do NOT use `.text` — it resolves before
 * `onFinish` fires (verified in AI SDK source: stream-text.ts flush()).
 */
export async function runAutopilot({
  clientId,
  threadId,
  supabase,
}: RunAutopilotInput): Promise<RunAutopilotResult> {
  try {
    const result = await runAgent({
      clientId,
      threadId,
      input: "",
      triggerType: "pulse",
      channel: "web",
      consumeMessageQuota: false,
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    }, supabase);

    if (result.status === "streaming") {
      // consumeStream() waits for the full stream including onFinish (which
      // calls finalizeRun). The onError callback detects failures that would
      // otherwise be silently swallowed:
      //
      // 1. Stream errors (LLM timeout, network) — runAgent's onError callback
      //    calls recordFailedRun, then the stream errors, consumeStream catches
      //    the read error and calls our onError.
      // 2. onFinish/finalizeRun errors — flush() catches the throw, calls
      //    controller.error(error), stream errors, consumeStream catches and
      //    calls our onError.
      //
      // Verified in AI SDK source: consume-stream.ts:26 catches reader.read()
      // errors and calls onError. stream-text.ts:1170 flush() catch calls
      // controller.error(error) which propagates through teed streams.
      let streamError: unknown = null;
      await result.streamResult.consumeStream({
        onError: (error: unknown) => { streamError = error; },
      });

      if (streamError) {
        const message = streamError instanceof Error
          ? streamError.message
          : "Stream consumption failed";
        return { status: "failed", error: message };
      }

      return { status: "completed" };
    }

    // "queued" from runAgent means thread was busy and pulse was not
    // enqueued (pulse guard in runAgent skips enqueue).
    return { status: "skipped_busy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    // Note: runAgent's recordFailedRun already marked the run as failed
    // and emitted analytics before throwing. We just translate the error
    // contract from "throw" to "return { status: failed }".
    return { status: "failed", error: message };
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts --reporter=verbose
```

Expected: ALL PASS (7 tests)

**Step 5: Run the full runner test suite to catch regressions**

```bash
npx vitest run src/lib/runner/__tests__/ --reporter=verbose
```

Expected: ALL PASS — no other test files import from `run-autopilot.ts` or depend on its internals.

**Step 6: Commit**

```bash
git add src/lib/runner/run-autopilot.ts src/lib/runner/__tests__/run-autopilot.test.ts
git commit -m "feat(runner-unification): replace run-autopilot with thin wrapper around runAgent

Reduces ~140 lines to ~30 by making runAutopilot delegate to runAgent with
pulse parameters. Eliminates ~60% duplicated logic (context assembly, tool
registry, run lifecycle, finalization).

Uses consumeStream({ onError }) to detect stream/finalization failures —
strictly safer than bare consumeStream() which silently swallows errors.

Key behavioral changes (all improvements):
- Pulse runs now load CRM config (agent gets CRM vocabulary)
- Pulse runs now emit agent_run_completed/failed analytics events
- Trace name changes from sunder-autopilot to sunder-pulse
- Log label changes from autopilot to runner"
```

---

### Task 8: Full integration smoke test

**Files:**
- Test: `src/lib/runner/__tests__/run-agent.test.ts` (read only — verify)
- Test: `src/lib/runner/__tests__/run-autopilot.test.ts` (read only — verify)
- Test: `src/lib/runner/__tests__/schemas.test.ts` (read only — verify)

**Context:** Final verification pass. Run ALL runner tests plus the executor tests to make sure nothing is broken.

**Step 1: Run all runner tests**

```bash
npx vitest run src/lib/runner/__tests__/ --reporter=verbose
```

Expected: ALL PASS

**Step 2: Run executor tests (caller of runAutopilot)**

```bash
npx vitest run src/lib/triggers/ --reporter=verbose
```

Expected: ALL PASS — executor.ts calls `runAutopilot()` and pattern-matches on the same `{ status: "skipped_busy" }`, `{ status: "failed" }`, and `{ status: "completed" }` return values. The wrapper produces these exact statuses.

**Step 3: Run the full project test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: ALL PASS

**Step 4: Verify type checking**

```bash
npx tsc --noEmit
```

Expected: No errors

**Step 5: Final commit (if any type fixes were needed)**

If any type issues were found and fixed:

```bash
git add -A
git commit -m "fix(runner-unification): resolve type errors from wrapper migration"
```

---

## Design Doc Fixes

**File:** `roadmap docs/Sunder - Source of Truth/references/deepagents/03-runner-unification-design-doc.md`

After all code tasks are complete, apply three fixes:

**Fix 1 (line 178):** Diff summary table — `allowConnectionMutations` condition. Change:

```
| `src/lib/runner/run-agent.ts:258` | Add `allowConnectionMutations: triggerType === "chat"` | +1 line |
```

To:

```
| `src/lib/runner/run-agent.ts:258` | Add `allowConnectionMutations: triggerType !== "pulse"` | +1 line |
```

**Fix 2 (line 227):** Drift from references table — wrapper blocking mechanism. Change:

```
| Streaming for pulse | `streamAgent` yields to nobody | `streamText` streams to nobody, wrapper awaits `.text` | Aligned — same pattern |
```

To:

```
| Streaming for pulse | `streamAgent` yields to nobody | `streamText` streams to nobody, wrapper awaits `consumeStream({ onError })` | Aligned — same pattern |
```

**Fix 3 (lines 53-58):** Update the wrapper code block to use `consumeStream({ onError })` instead of bare `consumeStream()`. The AI SDK v6 note (lines 241-257) should also be updated to recommend `consumeStream({ onError })` instead of bare `consumeStream()` as the correct pattern, noting that bare `consumeStream()` silently swallows errors.

Commit:

```bash
git add "roadmap docs/Sunder - Source of Truth/references/deepagents/03-runner-unification-design-doc.md"
git commit -m "docs: fix runner unification design doc — consumeStream onError, connection mutations condition"
```
