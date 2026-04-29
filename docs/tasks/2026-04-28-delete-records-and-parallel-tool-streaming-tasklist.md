# Delete-Records Idempotency + Parallel Tool Streaming Implementation Plan

**Goal:** Stop the `delete_records` tool from reporting failure when records were already gone, and stop the session runner from blocking SSE event consumption while a custom tool is dispatching so parallel tool calls render in real time.

**Architecture:** Two surgical fixes against the managed-agent runner harness:
1. Treat "Record not found" inside `delete_records` as idempotent success — it only counts as a real failure when zero records succeed or a Postgres error is returned.
2. Refactor `consumeAnthropicSession` so `dispatchCustomTool(...)` is fired as a background promise instead of blocking the `for await` loop. Event consumption continues immediately and downstream `tool-input-available` UI chunks get to the client without being gated on the previous tool's execution.

**Tech Stack:** Next.js 15 App Router, Anthropic Managed Agents (beta) via `@anthropic-ai/sdk`, Vitest + RTL for tests, Supabase for the CRM tables, Vercel AI SDK v6 stream writer types.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

## Background — Read These Before You Touch Code

| Topic | Read |
|---|---|
| Why we use Managed Agents directly (not Vercel AI SDK loop) | `CLAUDE.md` — "Managed Agents: Plain-Language Rules" + "Architecture" sections |
| The session-runner contract | `src/lib/managed-agents/session-runner.ts` (top JSDoc) |
| The cookbook's blessed pattern for parallel custom tools | https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents — specifically `CMA_gate_human_in_the_loop.ipynb` |
| The translator that surfaces `customToolCall` from each event | `src/lib/managed-agents/event-translator.ts:55-95` |
| How dispatch results are pushed back to Anthropic | `src/lib/managed-agents/session-runner.ts:354-435` |
| The CRM delete tool's current failure shape | `src/lib/managed-agents/tools/crm/delete-records.ts:128-143` |
| How the UI renders tool errors vs. successes | `src/lib/managed-agents/session-stream-forwarder.ts:74-122` |
| Existing tests we mirror | `src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`, `src/lib/managed-agents/__tests__/session-runner.test.ts` |
| Trace evidence for the bug | `pnpm trace 237028a8-334a-401a-bd28-a06ace3bb3d6` (session `sesn_011CaVAkvHPGT4EfguCti7E3`) |

**Key conventions to obey:**
- Haiku-only for any local managed-agent eval. We do not run Sonnet/Opus in dev (CLAUDE.md is loud about this).
- TDD: red → green → commit. Frequent commits with PR-style scoped messages (e.g. `fix(crm/delete-records): ...`).
- DRY/YAGNI: no extra abstractions. Touch only the two files plus their tests.
- No `dark:` Tailwind variants in any UI we touch.
- We do **not** introduce a new helper module for "background dispatch". Inline `Promise` tracking inside `consumeAnthropicSession` is enough.
- Post-dispatch behaviour (sending `user.custom_tool_result` back to the session, marking `dispatchedCustomToolIds`, calling `onAgentToolResult`) must remain unchanged from the consumer's point of view — the only change is *when* the await completes relative to the next `for await` iteration.

## Relevant Files

- Modify: `src/lib/managed-agents/tools/crm/delete-records.ts` — change failure aggregation (Task 1).
- Modify: `src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts` — update existing assertions and add new cases (Task 1).
- Modify: `src/lib/managed-agents/session-runner.ts:270-535` — non-blocking dispatch (Task 2).
- Modify: `src/lib/managed-agents/__tests__/session-runner.test.ts` — add interleaving tests (Task 2).
- Reference (do not modify unless tests force it): `src/lib/managed-agents/event-translator.ts`, `src/lib/managed-agents/dispatch-event-to-callbacks.ts`, `src/lib/managed-agents/session-stream-forwarder.ts`.

## Notes

- We are not changing the wire protocol with Anthropic. We still send one `user.custom_tool_result` per dispatched tool, in dispatch-completion order.
- `requires_action` "stale" detection (the existing `dispatchedCustomToolIds` set) still works — we just need to make sure each background dispatch adds to that set *before* the runner exits the loop.
- We must wait on all in-flight dispatches before resolving `consumeAnthropicSession`, otherwise we may close the SSE writer while a tool dispatch is still trying to write `tool-output-available` to the UI stream.

---

### Task 1: `delete_records` returns success on idempotent "not found"

**Files:**
- Modify: `src/lib/managed-agents/tools/crm/delete-records.ts:54-143`
- Test: `src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`

**Why:** Trace `sesn_011CaVAkvHPGT4EfguCti7E3` showed 13/14 contact deletes succeeded; the 14th was already gone (cascade or prior delete). Today we flag the whole call as `success:false`, the UI paints a red ✕, and Anthropic caches an `is_error=true` tool result. The right semantic: a "not found" delete is the goal state — only return `success:false` when zero deletes succeeded or Postgres returned a real error.

**Step 1: Read the current implementation**

Open `src/lib/managed-agents/tools/crm/delete-records.ts` and re-read lines 54-143. Note the per-id loop pushes to one of: `deletedIds`, `failedIds` + `failures`. The shape downstream consumers read is the literal returned object.

**Step 2: Read the existing test file**

Open `src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`. Note the existing case at lines 58-78 ("does not claim success when the tenant cannot delete the requested record"). That assertion is exactly the behaviour we are about to change for the not-found subcase, so the test will need to migrate.

**Step 3: Write the failing test for "not found is success"**

Append this test to `src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts` (above the closing `});` of the `describe`):

```ts
it("treats already-deleted records as idempotent success", async () => {
  const { client } = createMockSupabase({
    contacts: [
      { data: null, error: null }, // pre-delete read: not found
      { data: null, error: null }, // delete-returning: not found
    ],
  });

  const result = await deleteRecordsTool.execute(
    { entity: "contacts", ids: ["c1"], reason: "Cleanup placeholder rows" },
    makeContext(client),
  );

  expect(result).toEqual({
    success: true,
    deleted_count: 0,
    ids: [],
    already_gone_ids: ["c1"],
  });
});
```

**Step 4: Write the failing test for partial success**

Append this test directly after Step 3's:

```ts
it("returns success when at least one record was deleted and others were already gone", async () => {
  const liveContact = {
    contact_id: "c2",
    client_id: CLIENT_ID,
    first_name: "Real",
    last_name: "Person",
  };
  const { client } = createMockSupabase({
    contacts: [
      { data: null, error: null },         // c1 read: not found
      { data: null, error: null },         // c1 delete-returning: not found
      { data: liveContact, error: null },  // c2 read: found
      { data: liveContact, error: null },  // c2 delete-returning: found
    ],
    record_notes: { data: null, error: null },
  });

  const result = await deleteRecordsTool.execute(
    { entity: "contacts", ids: ["c1", "c2"], reason: "Cleanup mixed batch" },
    makeContext(client),
  );

  expect(result).toEqual({
    success: true,
    deleted_count: 1,
    ids: ["c2"],
    already_gone_ids: ["c1"],
  });
});
```

**Step 5: Update the existing "tenant cannot delete" test for new semantics**

In the same file, replace the `it("does not claim success when the tenant cannot delete the requested record", ...)` block (currently around lines 58-78) with a test that asserts a real Postgres error still flips `success:false`. Use this body verbatim:

```ts
it("returns failure when Postgres rejects the delete", async () => {
  const { client } = createMockSupabase({
    contacts: [
      { data: null, error: null },
      {
        data: null,
        error: { message: "permission denied for table contacts" },
      },
    ],
  });

  const result = await deleteRecordsTool.execute(
    { entity: "contacts", ids: ["c1"], reason: "User requested removal" },
    makeContext(client),
  );

  expect(result).toEqual({
    success: false,
    error: "Failed to delete 1 record(s)",
    deleted_count: 0,
    failed_ids: ["c1"],
    failures: [{ id: "c1", error: "permission denied for table contacts" }],
    already_gone_ids: [],
  });
});
```

**Step 6: Run the tests to confirm they fail**

Run: `pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`
Expected: 3 failures (the two new tests plus the rewritten "permission denied" test). All others stay green.

**Step 7: Implement the new aggregation in `delete-records.ts`**

Replace lines 54-143 of `src/lib/managed-agents/tools/crm/delete-records.ts` with:

```ts
  execute: async ({ entity, ids, reason }, context) => {
    void reason;

    const { table, pk } = ENTITY_ROUTING[entity];
    const deletedIds: string[] = [];
    const alreadyGoneIds: string[] = [];
    const failedIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      let existingRecord: Record<string, unknown> | null = null;
      const timelineRecordType = TIMELINE_RECORD_TYPE_MAP[entity];

      if (timelineRecordType) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: readError } = await (context.supabase as any)
          .from(table)
          .select("*")
          .eq(pk, id)
          .eq("client_id", context.clientId)
          .maybeSingle();

        if (!readError) {
          existingRecord = (data as Record<string, unknown> | null) ?? null;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deletedRow, error: deleteReadError } = await (context.supabase as any)
        .from(table)
        .delete()
        .eq(pk, id)
        .eq("client_id", context.clientId)
        .select(pk)
        .maybeSingle();

      if (deleteReadError) {
        failedIds.push(id);
        failures.push({ id, error: deleteReadError.message });
        continue;
      }

      if (!deletedRow) {
        // Idempotent: the record is already gone, which is the goal state.
        alreadyGoneIds.push(id);
        continue;
      }

      deletedIds.push(id);
      const recordType = RECORD_TYPE_MAP[entity];
      if (recordType) {
        await context.supabase
          .from("record_notes")
          .delete()
          .eq("record_type", recordType)
          .eq("record_id", id)
          .eq("client_id", context.clientId);
      }

      if (timelineRecordType && existingRecord) {
        void captureTimelineActivity({
          supabase: context.supabase,
          clientId: context.clientId,
          recordType: timelineRecordType,
          recordId: id,
          action: "deleted",
          actorType: "agent",
          before: existingRecord,
        });
      }
    }

    if (failedIds.length > 0) {
      return {
        success: false as const,
        error: `Failed to delete ${failedIds.length} record(s)`,
        deleted_count: deletedIds.length,
        failed_ids: failedIds,
        failures,
        already_gone_ids: alreadyGoneIds,
      };
    }

    return {
      success: true as const,
      deleted_count: deletedIds.length,
      ids: deletedIds,
      already_gone_ids: alreadyGoneIds,
    };
  },
```

**Step 8: Run the tests to confirm they pass**

Run: `pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`
Expected: all tests pass (including the original happy-path test that asserts `{ success: true, deleted_count: 1, ids: ["c1"] }` — note this assertion will now fail because we always include `already_gone_ids`. Update the original assertion to `{ success: true, deleted_count: 1, ids: ["c1"], already_gone_ids: [] }`).

**Step 9: Re-run after the assertion fix**

Run: `pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts`
Expected: 4 passing tests, 0 failing.

**Step 10: Type check**

Run: `pnpm tsc --noEmit`
Expected: no errors. (If the agent system prompt or any other reader narrows the tool's output type, surface that and we'll widen the inline result type.)

**Step 11: Commit**

```bash
git add src/lib/managed-agents/tools/crm/delete-records.ts \
        src/lib/managed-agents/tools/crm/__tests__/delete-records.test.ts
git commit -m "fix(crm/delete-records): treat 'not found' as idempotent success"
```

---

### Task 2: Stop the session runner from blocking event consumption on tool dispatch

**Files:**
- Modify: `src/lib/managed-agents/session-runner.ts:120-593`
- Test: `src/lib/managed-agents/__tests__/session-runner.test.ts`

**Why:** Trace `sesn_011CaVAkvHPGT4EfguCti7E3` showed `gap=21718ms` between two parallel `agent.custom_tool_use` events because the `for await (const event of iterator)` loop inside `consumeAnthropicSession` `await`s `dispatchCustomTool(...)` and the subsequent `events.send(...)` before reading the next event off the SSE iterator. Anthropic had already emitted the second tool call into the stream — we just hadn't read it. Result: the second `tool-input-available` UI chunk is delayed by however long the first tool takes (here, ~20s for the deal delete). Goal: dispatch in the background, keep reading.

**Step 1: Read the current loop**

Read `src/lib/managed-agents/session-runner.ts:270-435` carefully. Note three behaviours that must survive the refactor:
1. `dispatchedCustomToolIds.add(...)` happens after a successful send. The "stale `requires_action`" detector at lines 522-530 reads this set to decide whether to break.
2. Approval-gated calls follow the `kind === "deferred"` branch and use `persistDeferredApproval`. Those remain inline and unchanged — only the immediate-result branch goes async.
3. The post-dispatch synthetic `onAgentToolResult` callback at lines 396-404 must still fire so the UI receives `tool-output-available`.

**Step 2: Read the existing runner tests for the dispatcher contract**

Open `src/lib/managed-agents/__tests__/session-runner.test.ts`. Skim how `dispatchCustomTool` is mocked (lines 25-36, 100-104) and how `stubIteration` feeds events. We will use the same harness.

**Step 3: Write the failing test — parallel tool calls do not block event reads**

Add a new `describe` block at the bottom of `src/lib/managed-agents/__tests__/session-runner.test.ts` (above the file's final newline, inside no other describe):

```ts
describe("consumeAnthropicSession — parallel custom tool dispatch", () => {
  it("does not block event consumption while a custom tool is dispatching", async () => {
    // Arrange a slow first dispatch and a fast second dispatch. The runner
    // must read event[1] (the second tool call) BEFORE event[0]'s dispatch
    // resolves — otherwise the UI sees the second tool-input-available chunk
    // delayed by the first tool's execution time.
    const dispatchOrder: string[] = [];
    const eventReadOrder: string[] = [];

    let resolveSlowDispatch: (() => void) | null = null;
    const slowDispatchStarted = new Promise<void>((resolveStarted) => {
      (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (call: { id: string }) => {
          dispatchOrder.push(`start:${call.id}`);
          if (call.id === "tool_slow") {
            resolveStarted();
            await new Promise<void>((res) => {
              resolveSlowDispatch = res;
            });
          }
          dispatchOrder.push(`end:${call.id}`);
          return {
            custom_tool_use_id: call.id,
            content: [{ type: "text", text: '{"success":true}' }],
          };
        },
      );
    });

    const events = [
      modelRequestStartEvent("span_1"),
      customToolUseEvent("tool_slow", "search_crm", { entity: "deals" }),
      customToolUseEvent("tool_fast", "search_crm", { entity: "tasks" }),
      modelRequestEndEvent("span_1_end", 100, 25),
      statusIdleEvent("evt_idle", "end_turn"),
    ];

    (iterateSessionEventsAfter as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return (async function* () {
          for (const e of events) {
            eventReadOrder.push((e as { id: string }).id);
            yield e;
          }
        })();
      },
    );

    const consumePromise = consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffContent: [{ type: "text", text: "go" }],
    });

    // Wait for the slow dispatch to actually start (proving the runner saw
    // the first tool_use event), then assert the second event has already
    // been read — even though the slow dispatch has not resolved yet.
    await slowDispatchStarted;
    // Give the runner microtasks a tick to pick up subsequent events.
    await new Promise((r) => setTimeout(r, 10));

    expect(eventReadOrder).toContain("tool_fast");
    expect(dispatchOrder).toContain("start:tool_slow");
    expect(dispatchOrder).toContain("start:tool_fast");
    expect(dispatchOrder).not.toContain("end:tool_slow");

    resolveSlowDispatch?.();
    await consumePromise;

    // After completion, both dispatches finished and both results were sent.
    expect(dispatchOrder).toEqual([
      "start:tool_slow",
      "start:tool_fast",
      "end:tool_slow",
      "end:tool_fast",
    ]);
    const sentToolResultIds = sendEvent.mock.calls
      .map((call) => (call[1] as { events: Array<{ type: string; custom_tool_use_id?: string }> }).events[0])
      .filter((evt) => evt.type === "user.custom_tool_result")
      .map((evt) => evt.custom_tool_use_id);
    expect(sentToolResultIds).toEqual(
      expect.arrayContaining(["tool_slow", "tool_fast"]),
    );
  });
});
```

**Step 4: Run the new test to confirm it fails**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts -t "does not block event consumption"`
Expected: FAIL — `eventReadOrder` will not contain `"tool_fast"` until the slow dispatch resolves, because the current code awaits `dispatchCustomTool` inline.

**Step 5: Write the failing test — runner waits for in-flight dispatches before resolving**

Append, inside the same `describe("consumeAnthropicSession — parallel custom tool dispatch")`:

```ts
it("waits for all in-flight dispatches before returning from end_turn", async () => {
  let dispatchResolved = false;
  let resolveDispatch: (() => void) | null = null;

  (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (call: { id: string }) => {
      await new Promise<void>((res) => {
        resolveDispatch = () => {
          dispatchResolved = true;
          res();
        };
      });
      return {
        custom_tool_use_id: call.id,
        content: [{ type: "text", text: '{"success":true}' }],
      };
    },
  );

  stubIteration([
    modelRequestStartEvent("span_1"),
    customToolUseEvent("tool_a", "search_crm", { entity: "deals" }),
    modelRequestEndEvent("span_1_end", 100, 25),
    statusIdleEvent("evt_idle", "end_turn"),
  ]);

  const consumePromise = consumeAnthropicSession({
    anthropic: fakeAnthropic(),
    sessionId: "sess_1",
    runId: "run_1",
    context: baseContext(),
    kickoffContent: [{ type: "text", text: "go" }],
  });

  await new Promise((r) => setTimeout(r, 20));
  expect(dispatchResolved).toBe(false);

  resolveDispatch?.();
  await consumePromise;
  expect(dispatchResolved).toBe(true);

  const sentToolResults = sendEvent.mock.calls.filter((call) => {
    const evt = (call[1] as { events: Array<{ type: string }> }).events[0];
    return evt.type === "user.custom_tool_result";
  });
  expect(sentToolResults).toHaveLength(1);
});
```

**Step 6: Run both new tests to confirm both fail**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts -t "parallel custom tool dispatch"`
Expected: 2 failures.

**Step 7: Refactor `consumeAnthropicSession` to dispatch in the background**

Open `src/lib/managed-agents/session-runner.ts`. Make these surgical edits:

7a. Just above the `for await (const event of iterator)` loop (around line 269), declare a tracker for in-flight dispatches:

```ts
const inFlightDispatches: Promise<void>[] = [];
```

7b. Replace the entire `if (result.customToolCall) { ... }` block (lines 353-435) with the version below. The non-deferred branch becomes a `void` IIFE that runs in the background and is tracked in `inFlightDispatches`:

```ts
if (result.customToolCall) {
  const customToolCall = result.customToolCall;
  const tToolStart = performance.now();

  const dispatchPromise = (async () => {
    try {
      const dispatchResult = await dispatchCustomTool(
        {
          type: "agent.custom_tool_use",
          id: customToolCall.id,
          name: customToolCall.name,
          input: customToolCall.input,
        },
        options.context,
      );
      const tToolDispatched = performance.now();

      if (dispatchResult.kind === "deferred") {
        const approvalId = await persistDeferredApproval({
          approval: dispatchResult,
          sessionId: options.sessionId,
          runId: options.runId,
          context: options.context,
          onApprovalRequired: options.callbacks?.onApprovalRequired,
        });
        approvalEventIds.push(approvalId);
        console.log(
          `${logPrefix} deferred custom tool ${customToolCall.name} (${customToolCall.id.slice(-8)}) exec=${Math.round(tToolDispatched - tToolStart)}ms approval=${approvalId.slice(-8)}`,
        );
        return;
      }

      await anthropic.beta.sessions.events.send(
        options.sessionId,
        {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: dispatchResult.custom_tool_use_id,
              content: dispatchResult.content,
              ...(dispatchResult.is_error ? { is_error: true } : {}),
            },
          ],
        } as never,
        CHAT_ANTHROPIC_REQUEST_OPTIONS,
      );
      const tToolSent = performance.now();
      dispatchedCustomToolIds.add(customToolCall.id);
      console.log(
        `${logPrefix} dispatched custom tool ${customToolCall.name} (${customToolCall.id.slice(-8)}) is_error=${dispatchResult.is_error ?? false} exec=${Math.round(tToolDispatched - tToolStart)}ms send=${Math.round(tToolSent - tToolDispatched)}ms`,
      );

      try {
        await options.callbacks?.onAgentToolResult?.({
          type: "user.custom_tool_result",
          custom_tool_use_id: dispatchResult.custom_tool_use_id,
          content: dispatchResult.content,
          ...(dispatchResult.is_error ? { is_error: true } : {}),
        });
      } catch (callbackError) {
        console.warn(
          `${logPrefix} post-dispatch callback failed, continuing`,
          callbackError,
        );
      }
    } catch (toolError) {
      console.error(
        `${logPrefix} tool dispatch failed for ${customToolCall.name} (${customToolCall.id.slice(-8)}):`,
        toolError,
      );
      try {
        await anthropic.beta.sessions.events.send(
          options.sessionId,
          {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: customToolCall.id,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error:
                        toolError instanceof Error
                          ? toolError.message
                          : "Tool execution failed",
                    }),
                  },
                ],
                is_error: true,
              },
            ],
          } as never,
          CHAT_ANTHROPIC_REQUEST_OPTIONS,
        );
        dispatchedCustomToolIds.add(customToolCall.id);
      } catch (sendError) {
        console.error(
          `${logPrefix} failed to post error result for ${customToolCall.name}, session will deadlock:`,
          sendError,
        );
        throw sendError;
      }
    }
  })();

  inFlightDispatches.push(dispatchPromise);
}
```

7c. Inside the `if (result.terminal === "requires_action")` block (around lines 511-535), before the `terminalReason = "requires_action"; break;` line, await any in-flight dispatches so the stale-detection check at line 524 sees the freshly populated `dispatchedCustomToolIds`:

```ts
if (result.terminal === "requires_action") {
  if (options.autoDenyApprovals) {
    continue;
  }

  // Drain any background dispatches so dispatchedCustomToolIds reflects
  // the true post-dispatch state before we decide whether the
  // requires_action is genuine or stale.
  if (inFlightDispatches.length > 0) {
    await Promise.allSettled(inFlightDispatches);
    inFlightDispatches.length = 0;
  }

  const idleEvent = event as { stop_reason?: { event_ids?: string[] } };
  const pendingIds = idleEvent.stop_reason?.event_ids ?? [];
  const allHandled =
    pendingIds.length > 0 &&
    pendingIds.every((id) => dispatchedCustomToolIds.has(id));
  console.log(
    `${logPrefix} requires_action: pendingIds=[${pendingIds.map((id) => id.slice(-8)).join(",")}] dispatched=[${[...dispatchedCustomToolIds].map((id) => id.slice(-8)).join(",")}] allHandled=${allHandled}`,
  );
  if (allHandled) {
    console.log(
      `${logPrefix} stale requires_action — custom tools already dispatched, continuing`,
    );
    continue;
  }

  console.log(
    `${logPrefix} genuine requires_action — breaking for approval`,
  );
  terminalReason = "requires_action";
  break;
}
```

7d. After the `for await` loop exits (just before the `const tLoopEnd = performance.now()` line, around line 538), drain any remaining background dispatches so finalization sees a quiet world:

```ts
if (inFlightDispatches.length > 0) {
  await Promise.allSettled(inFlightDispatches);
  inFlightDispatches.length = 0;
}
```

**Step 8: Run the new tests to confirm they pass**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts -t "parallel custom tool dispatch"`
Expected: both new tests pass.

**Step 9: Run the full session-runner test suite**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts`
Expected: all tests pass. The pre-existing tests around stale `requires_action`, approval persistence, and end-turn finalization should still be green because we only changed *when* the dispatch awaits resolve, not the wire protocol or the tracked sets.

**Step 10: Run the full managed-agents test suite**

Run: `pnpm vitest run src/lib/managed-agents`
Expected: all tests pass. If any adapter or dispatcher test breaks, root-cause it before patching the test — we should not have changed any external contract.

**Step 11: Type check the project**

Run: `pnpm tsc --noEmit`
Expected: no errors.

**Step 12: Smoke-test in dev with Haiku**

This is the manual step the cookbook drift fixed. From CLAUDE.md: dev testing is Haiku-only.

```bash
pnpm dev
```

Open the chat at `http://localhost:3001/chat`, send a message that you know triggers parallel tool calls (e.g. "show me my CRM overview"). Watch the terminal log for `event[N]: agent.custom_tool_use` lines — the second tool's `gap=` should now be a few ms, not multiple seconds. In the UI, both `Used tool:` cards should appear immediately.

**Step 13: Commit**

```bash
git add src/lib/managed-agents/session-runner.ts \
        src/lib/managed-agents/__tests__/session-runner.test.ts
git commit -m "fix(managed-agents/session-runner): dispatch custom tools in background to keep SSE consumption non-blocking"
```

---

### Task 3: End-to-end re-trace verification

**Files:**
- No code changes. This is a manual verification gate before opening the PR.

**Step 1: Reproduce the original scenario**

Spin up `pnpm dev`. In the chat, ask the agent to "search my CRM and delete junk records" or similar — anything that triggers a `request_approval` followed by parallel `delete_records` calls. Approve the gate.

**Step 2: Pull the new trace**

Run:

```bash
pnpm trace "<new threadId>" 2>/dev/null
```

**Step 3: Verify the streaming gap shrinks**

In the runner log (terminal where `pnpm dev` is running), the gap between two `agent.custom_tool_use` events from the same model turn should be < 50ms. In the previous trace it was 21,718ms.

**Step 4: Verify partial deletes return success**

If the run includes a `delete_records` call where some records were already gone, the trace should show `is_error=false` for that tool and a payload like `"already_gone_ids":[...]`. The UI card should be the green-check variant, not the red-X.

**Step 5: Final commit (only if doc edits needed)**

If anything in this verification turns up an unaddressed gap, do **not** stack the fix into this branch — open a new tasklist. Otherwise no commit needed.

---

## Out of scope (do not do these in this PR)

- Refactoring the runner into a "drain to requires_action then dispatch in parallel" layout. We considered it but it requires reshaping `event-translator.ts`'s `customToolCall` surface and is a bigger change than warranted by the present bug.
- Surfacing partial-delete information in the assistant's system prompt — the model already reasoned correctly about partial deletes in the trace.
- Reworking `tool-output-error` UI rendering. The forwarder already handles both success and error paths; once Task 1 lands the success path will be hit for the not-found case.

---

## Execution Handoff

**Tasklist complete and saved to `docs/tasks/2026-04-28-delete-records-and-parallel-tool-streaming-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.**
