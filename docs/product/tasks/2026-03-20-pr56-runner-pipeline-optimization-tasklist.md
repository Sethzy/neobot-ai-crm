# Runner Pre-LLM Pipeline Optimization

**PR:** PR 56: Runner pre-LLM pipeline optimization
**Decisions:** None (out-of-plan performance work)
**Goal:** Reduce pre-LLM startup latency by parallelizing independent network calls that currently run sequentially.

**Architecture:** Three confirmed serialization points: (1) Composio loads tools one connection at a time via `for...of await`, (2) `buildSystemReminder` re-fetches connections already loaded by the caller, (3) autopilot runs Composio *after* `assembleContext` instead of in parallel. This PR fixes all three without changing public APIs or exporting internals. Bootstrap stays serial (first-turn skill seeding race). DB-side compaction cutoff stays (avoids broader scans on long threads). `assembleContext()` remains the single context assembly seam.

**Tech Stack:** TypeScript, Supabase Postgres RPCs, Composio SDK, Vitest

---

## Relevant Files

**Modify:**
- `src/lib/composio/activated-tools.ts` — per-connection parallel loading
- `src/lib/runner/system-reminder.ts` — accept pre-fetched connections
- `src/lib/runner/run-autopilot.ts` — parallelize Composio with context assembly

**Tests:**
- `src/lib/composio/__tests__/activated-tools.test.ts`
- `src/lib/runner/__tests__/system-reminder.test.ts`
- `src/lib/runner/__tests__/run-autopilot.test.ts`

---

### Task 1: Parallelize Composio per-connection tool loading

Currently `loadActivatedConnectionTools` loops with `for...of await` — each Composio API call blocks the next. With 2+ connections this serializes 50-200ms per connection. Fix: `Promise.all` where each connection returns its own entries, merged deterministically after all resolve.

**Files:**
- Modify: `src/lib/composio/activated-tools.ts:20-60`
- Test: `src/lib/composio/__tests__/activated-tools.test.ts`

**Step 1: Write a failing test that proves parallel execution via deferred barriers**

Add this test to `src/lib/composio/__tests__/activated-tools.test.ts` inside the existing `describe` block, after the last test:

```ts
it("loads tools for all connections concurrently, not one at a time", async () => {
  // Barrier pattern: each call resolves only after ALL calls have started.
  // If serial, the second call never starts (first blocks forever) → timeout.
  let started = 0;
  const allStarted = new Promise<void>((resolve) => {
    const check = () => { started++; if (started >= 2) resolve(); };
    const mockComposio = {
      tools: {
        getRawComposioTools: vi.fn().mockImplementation(async () => {
          check();
          await allStarted;
          return [
            {
              slug: "TOOL_A",
              description: "tool",
              inputParameters: { type: "object", properties: {} },
            },
          ];
        }),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  });

  const result = await loadActivatedConnectionTools([
    createMockConnection({
      id: "550e8400-e29b-41d4-a716-446655440020",
      toolkit_slug: "gmail",
      activated_tools: ["GMAIL_SEND"],
    }),
    createMockConnection({
      id: "550e8400-e29b-41d4-a716-446655440021",
      toolkit_slug: "slack",
      activated_tools: ["SLACK_SEND"],
    }),
  ]);

  expect(Object.keys(result).sort()).toEqual([
    "550e8400-e29b-41d4-a716-446655440020__TOOL_A",
    "550e8400-e29b-41d4-a716-446655440021__TOOL_A",
  ]);
});
```

**Step 2: Run the test to verify it fails**

```
Run: npx vitest run src/lib/composio/__tests__/activated-tools.test.ts -t "loads tools for all connections concurrently"
Expected: FAIL — test hangs and times out because serial for...of blocks on the barrier
```

**Step 3: Implement deterministic parallel loading**

Replace the function body in `src/lib/composio/activated-tools.ts`. Each connection produces its own entries array, then we merge after all resolve:

```ts
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

  const perConnectionEntries = await Promise.all(
    activeConnections.map(async (connection): Promise<[string, ToolSet[string]][]> => {
      try {
        const rawTools = await composio.tools.getRawComposioTools({
          tools: connection.activated_tools,
        });

        return rawTools.map((rawTool) => [
          `${connection.id}__${rawTool.slug}`,
          tool({
            description: rawTool.description ?? rawTool.slug,
            inputSchema: jsonSchema(
              rawTool.inputParameters ?? EMPTY_TOOL_INPUT_SCHEMA,
            ),
            execute: async (args) =>
              composio.tools.execute(rawTool.slug, {
                connectedAccountId: connection.composio_connected_account_id,
                arguments: args,
                dangerouslySkipVersionCheck: true,
              }),
          }),
        ]);
      } catch (error) {
        console.error(`[composio] Failed to load tools for connection ${connection.id}:`, error);
        return [];
      }
    }),
  );

  return Object.fromEntries(perConnectionEntries.flat());
}
```

**Step 4: Run all activated-tools tests**

```
Run: npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
Expected: ALL PASS (7 tests including the new barrier test)
```

**Step 5: Commit**

```
git add src/lib/composio/activated-tools.ts src/lib/composio/__tests__/activated-tools.test.ts
git commit -m "perf(pr56): parallelize Composio per-connection tool loading"
```

---

### Task 2: Deduplicate connections query in buildSystemReminder

`buildSystemReminder()` calls `getAllConnections()` internally, but `run-agent.ts` already fetches connections in its Phase A. Add an optional `connections` parameter with a boring `ConnectionRow[]` type — when provided, skip the DB call.

**Files:**
- Modify: `src/lib/runner/system-reminder.ts:78-123`
- Test: `src/lib/runner/__tests__/system-reminder.test.ts`

**Step 1: Write a failing test that verifies connections passthrough skips the DB call**

Add this test to `src/lib/runner/__tests__/system-reminder.test.ts` inside the existing `describe` block:

```ts
it("uses provided connections instead of querying the database", async () => {
  const supabase = createReminderSupabase();

  const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID, {
    connections: [MOCK_GMAIL_CONNECTION, MOCK_CALENDAR_CONNECTION],
  });

  expect(mockGetAllConnections).not.toHaveBeenCalled();
  expect(result).toContain("gmail (conn-abc): 3/45 tools active");
  expect(result).toContain("googlecalendar (conn-def): 2/20 tools active");
});
```

**Step 2: Run the test to verify it fails**

```
Run: npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -t "uses provided connections instead of querying"
Expected: FAIL — BuildSystemReminderOptions has no connections property; TS error or getAllConnections still called
```

**Step 3: Add optional connections parameter**

In `src/lib/runner/system-reminder.ts`, add the import (if not already present):

```ts
import type { ConnectionRow } from "@/lib/connections/schemas";
```

Update the options interface:

```ts
interface BuildSystemReminderOptions {
  /** When true, injects a CRM configuration mode active notice. */
  crmConfigModeActive?: boolean;
  /** Pre-fetched connections — skips the DB call when provided. */
  connections?: ConnectionRow[];
}
```

Replace lines 117-123 (the connections fetch block):

```ts
  let connections: Awaited<ReturnType<typeof getAllConnections>> | null = null;

  try {
    connections = options?.connections ?? await getAllConnections(supabase, clientId);
  } catch {
    reminderLines.push("Active connections: none");
  }
```

**Step 4: Run all system-reminder tests**

```
Run: npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
Expected: ALL PASS (18 tests including the new passthrough test)
```

**Step 5: Commit**

```
git add src/lib/runner/system-reminder.ts src/lib/runner/__tests__/system-reminder.test.ts
git commit -m "perf(pr56): deduplicate connections query in buildSystemReminder"
```

---

### Task 3: Parallelize Composio with context assembly in autopilot

Autopilot currently runs `assembleContext()` first (lines 55-61), then fetches connections + Composio tools sequentially (lines 69-74). These are independent — run them in parallel.

**Files:**
- Modify: `src/lib/runner/run-autopilot.ts:54-79`
- Test: `src/lib/runner/__tests__/run-autopilot.test.ts`

**Step 1: Write a failing test that verifies Composio loads in parallel with context assembly**

The current code calls `getActiveConnections` *after* `assembleContext` resolves. A barrier test would be fragile here since both are mocked. Instead, test the observable outcome: when `getActiveConnections` is slow, the total time should NOT be additive.

Better approach: test that `assembleContext` and `getActiveConnections` are both called (unchanged behavior) but verify they can overlap by asserting mock call counts before `generateText`. This is already implicitly tested. The real failing test is:

Add to `src/lib/runner/__tests__/run-autopilot.test.ts`:

```ts
it("loads Composio tools in parallel with context assembly, not after it", async () => {
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
  mockGenerateText.mockResolvedValue({
    text: "Done",
    steps: [],
    totalUsage: { inputTokens: 10, outputTokens: 5 },
  });

  // Make assembleContext slow — if Composio waits for it, the call order is serial.
  let contextResolved = false;
  mockAssembleContext.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    contextResolved = true;
    return { system: "prompt", messages: [] };
  });

  // Record whether getActiveConnections was called before context resolved.
  let connectionsCalledBeforeContext = false;
  mockGetActiveConnections.mockImplementation(async () => {
    if (!contextResolved) connectionsCalledBeforeContext = true;
    return [];
  });

  await runAutopilot({
    clientId: "550e8400-e29b-41d4-a716-446655440000",
    threadId: "660e8400-e29b-41d4-a716-446655440000",
    supabase: "supabase" as never,
  });

  // In the current serial code, connections are fetched AFTER context resolves.
  // After the fix, connections start BEFORE context resolves.
  expect(connectionsCalledBeforeContext).toBe(true);
});
```

**Step 2: Run the test to verify it fails**

```
Run: npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts -t "loads Composio tools in parallel with context assembly"
Expected: FAIL — connectionsCalledBeforeContext is false because current code is serial
```

**Step 3: Implement parallel loading in run-autopilot.ts**

Replace lines 54-79 in `src/lib/runner/run-autopilot.ts`. The key change: start the Composio promise *before* awaiting `assembleContext`, then await both:

```ts
  try {
    // Start Composio loading immediately — don't wait for assembleContext.
    const composioPromise = getActiveConnections(supabase, clientId)
      .then((connections) => loadActivatedConnectionTools(connections))
      .catch((error) => {
        console.error("[composio] Failed to load activated connection tools for autopilot.", error);
        return {} as ToolSet;
      });

    // Context assembly and Composio loading run in parallel.
    const [{ system, messages }, composioTools] = await Promise.all([
      assembleContext({
        supabase,
        threadId,
        currentMessage: "",
        clientId,
        instructions: AUTOPILOT_INSTRUCTION_PROMPT,
      }),
      composioPromise,
    ]);

    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: false,
      allowConnectionMutations: false,
      includeBrowserTools: false,
    });

    const subagentTools = createSubagentTool(supabase, clientId, threadId, {
      parentRunId: lockResult.runId,
      composioTools,
    });
```

**Step 4: Run all autopilot tests**

```
Run: npx vitest run src/lib/runner/__tests__/run-autopilot.test.ts
Expected: ALL PASS (5 tests including the new parallel test)
```

**Step 5: Commit**

```
git add src/lib/runner/run-autopilot.ts src/lib/runner/__tests__/run-autopilot.test.ts
git commit -m "perf(pr56): parallelize Composio with context assembly in autopilot"
```

---

### Task 4: Final verification

**Step 1: Run all affected test suites in one batch**

```
Run: npx vitest run src/lib/composio/__tests__/activated-tools.test.ts src/lib/runner/__tests__/system-reminder.test.ts src/lib/runner/__tests__/run-autopilot.test.ts
Expected: ALL PASS
```

**Step 2: Run the broader runner test suite to catch regressions**

```
Run: npx vitest run src/lib/runner/__tests__/
Expected: ALL PASS
```

**Step 3: Run the full test suite**

```
Run: npx vitest run
Expected: ALL PASS (or only pre-existing failures unrelated to this PR)
```

**Step 4: Manual verification — check timing logs**

Send a chat message in dev and inspect `[runner/timing]` console output. Key metrics to compare before/after:
- `load_composio_tools` — should show ~1 connection-call's worth of time regardless of connection count
- Total `pre_stream_text` — overall reduction

No timing step needed for autopilot; the test proves overlap.
