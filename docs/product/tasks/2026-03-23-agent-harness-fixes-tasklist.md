# Agent Harness Fixes Implementation Plan

**PR:** Out-of-plan — harness-level fixes identified in Deep Agents architecture audit
**Decisions:** N/A (these are bug fixes, not new features)
**Goal:** Fix two unjustified drifts from Deep Agents patterns: subagent todo leak and approval persistence order.

**Architecture:** Two independent fixes shipping in one PR. Fix 1 (subagent todo) is one line plus test updates. Fix 2 (approval order) swaps two blocks in `finalizeRun()` with proper failure handling. Both follow patterns from the Deep Agents reference codebase.

**Tech Stack:** TypeScript, Vitest, Supabase, Vercel AI SDK v6

**Design doc:** `roadmap docs/Sunder - Source of Truth/references/deepagents/02-harness-fixes-design-doc.md`
**Audit:** `docs/product/references/2026-03-23-sunder-vs-deepagents-agent-architecture-audit.md`

**Deferred:** Runner dedup (`runAgent`/`runAutopilot` collapse) is deferred to a separate PR — review identified too many edge cases (error contract, schema changes, AI SDK v6 API shape, caller updates) for a quick fix.

---

## Task 1: Exclude Todo Tools from Subagents

**Why:** Subagents share the parent's `threadId`, so `createTodoTools(supabase, clientId, threadId)` gives the subagent read/write access to the parent's todo scratchpad. Deep Agents explicitly excludes `todos` from `_EXCLUDED_STATE_KEYS` at `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/subagents.py:127`.

**Divergence note:** Deep Agents gives subagents their *own* `TodoListMiddleware` instance (ephemeral, isolated) at `graph.py:209` and `graph.py:245`. We're removing todo tools entirely instead. This is a justified divergence — our subagents run 9 steps max (vs. Deep Agents' 1000-step recursion limit). A 9-step worker doesn't need persistent task tracking. Any planning happens in chain-of-thought.

**Known residual:** `assembleSystemOnly()` still injects `Open todos: N` from the parent thread's system reminder context into the subagent's prompt (`system-reminder.ts:110`). The subagent sees the count but can't act on it. This is confusing but not dangerous — the subagent ignores it. Not worth fixing in this PR (would require a separate system reminder path for subagents).

**Files:**
- Modify: `src/lib/runner/tools/utility/index.ts:37`
- Modify: `src/lib/runner/tools/utility/__tests__/index.test.ts:37-43` (existing test must be updated)

### Step 1: Update the existing test to expect todo exclusion for subagents

The existing test at `src/lib/runner/tools/utility/__tests__/index.test.ts:31-44` currently asserts subagents GET `manage_todo` and `list_todo`:

```typescript
  it("excludes user-facing and outbound tools for subagents", () => {
    const supabase = createMockSupabaseClient();
    const tools = createUtilityTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "calculate",
      "get_agent_db_schema",
      "list_todo",
      "manage_todo",
      "run_sql",
    ]);
  });
```

Change the expected array to remove `list_todo` and `manage_todo`. Replace lines 37-43 with:

```typescript
    expect(Object.keys(tools).sort()).toEqual([
      "calculate",
      "get_agent_db_schema",
      "run_sql",
    ]);
```

### Step 2: Run the test to verify it fails

```
Run: npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
Expected: FAIL — "excludes user-facing and outbound tools for subagents" fails because
          manage_todo and list_todo are still included in the subagent tool set.
```

### Step 3: Implement the fix — one line change

Modify `src/lib/runner/tools/utility/index.ts` line 37. Change:

```typescript
    ...createTodoTools(supabase, clientId, threadId),
```

to:

```typescript
    ...(!isSubagent ? createTodoTools(supabase, clientId, threadId) : {}),
```

### Step 4: Run the test to verify it passes

```
Run: npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts
Expected: PASS — all 3 tests pass. Subagent tool set no longer includes todo tools.
          Default (no options) and non-subagent cases still include todo tools.
```

### Step 5: Run existing subagent tests to verify no regression

```
Run: npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
Expected: PASS — subagent tests pass. These tests mock createRunnerTools, so
          the real tool set change is transparent to them.
```

### Step 6: Run tool-registry and run-agent tests

```
Run: npx vitest run src/lib/runner/__tests__/tool-registry.test.ts src/lib/runner/__tests__/run-agent.test.ts
Expected: PASS — both mock createUtilityTools, so unaffected by the real change.
```

### Step 7: Commit

```
git add src/lib/runner/tools/utility/index.ts src/lib/runner/tools/utility/__tests__/index.test.ts
git commit -m "fix: exclude todo tools from subagents (Deep Agents _EXCLUDED_STATE_KEYS alignment)"
```

---

## Task 2: Swap Approval Persistence Order

**Why:** Currently `finalizeRun()` persists the assistant message (line 147) before creating `approval_events` rows (line 169). If approval event creation fails, the user sees an approval card with no backing DB record — the approve button silently fails. Deep Agents avoids this via atomic LangGraph checkpointing (`libs/evals/tests/evals/test_hitl.py:46-102`). We can't adopt checkpointing (justified drift), but we can fix the persistence order.

**Files:**
- Modify: `src/lib/runner/run-persistence.ts:100-210`
- Modify: `src/lib/runner/__tests__/run-persistence.test.ts:217-306`

### Step 1: Update the existing order assertion test

In `src/lib/runner/__tests__/run-persistence.test.ts`, the test at line 217 (`"writes approval events for approval-requested tool parts before completing the run"`) currently asserts message-before-approvals at lines 247-249:

```typescript
    expect(mockCreateMessages.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateApprovalEvent.mock.invocationCallOrder[0],
    );
```

Replace lines 247-252 with the new order — approvals before messages, messages before run completion:

```typescript
    // Approval events BEFORE message persistence.
    // If approval insert fails, no message saved → no orphaned approval card.
    expect(mockCreateApprovalEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateMessages.mock.invocationCallOrder[0],
    );
    expect(mockCreateMessages.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompleteRun.mock.invocationCallOrder[0],
    );
```

### Step 2: Run test to verify it fails

```
Run: npx vitest run src/lib/runner/__tests__/run-persistence.test.ts -t "writes approval events"
Expected: FAIL — invocation order is currently messages-first, approvals-second.
```

### Step 3: Write a new test — approval insert fails, message NOT persisted

In `src/lib/runner/__tests__/run-persistence.test.ts`, after the existing "marks the run partial" test (line 306), add:

```typescript
  it("does not persist assistant message when approval event creation fails", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      {
        type: "tool-delete_contact",
        toolCallId: "call-approval",
        state: "approval-requested",
        input: { contact_id: "contact-1" },
        approval: { id: "approval-1" },
      },
      { type: "text", text: "Waiting for approval." },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({
      success: false,
      status: "error",
      error: "insert failed",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    // Message must NOT be persisted when approval events fail.
    expect(mockCreateMessages).not.toHaveBeenCalled();
  });
```

### Step 4: Write a new test — message insert fails after approvals succeed (orphan cleanup)

This is the inverse failure case the reviewer flagged. `createMessages()` throws on DB error (`messages.ts:76-78`). If it fails after approval rows are created, we have orphan approval rows that show as "Pending approvals: 1" in the system reminder.

Add another test:

```typescript
  it("marks run partial when message persistence fails after approval events succeed", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      {
        type: "tool-delete_contact",
        toolCallId: "call-approval",
        state: "approval-requested",
        input: { contact_id: "contact-1" },
        approval: { id: "approval-1" },
      },
      { type: "text", text: "Waiting for approval." },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({ success: true, status: "created" });
    mockCreateMessages.mockRejectedValue(new Error("DB insert failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    // Approval events were created (they succeeded before message failed).
    expect(mockCreateApprovalEvent).toHaveBeenCalled();
    // Run should be marked partial, not completed.
    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "partial" }),
    );
    // Should not drain or deliver on partial runs.
    expect(mockDrainAndContinue).not.toHaveBeenCalled();
    expect(mockDeliverToExternalChannels).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
```

### Step 5: Run the new tests to verify they fail

```
Run: npx vitest run src/lib/runner/__tests__/run-persistence.test.ts -t "does not persist assistant message"
Expected: FAIL — message IS currently persisted even when approvals fail.

Run: npx vitest run src/lib/runner/__tests__/run-persistence.test.ts -t "marks run partial when message persistence fails"
Expected: FAIL — createMessages() throw is currently unhandled in this code path.
```

### Step 6: Implement the fix — reorder and add error handling

Replace lines 140-210 in `src/lib/runner/run-persistence.ts` with:

```typescript
  const contentTextFromParts = getAssistantTextFromParts(parts);
  const fallbackContentText = typeof text === "string" ? text.trim() : "";
  const contentText = contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
  const hasNonStepParts = parts.some((part) => part.type !== "step-start");

  const baseRunCompletion = {
    runId,
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    stepCount: steps.length,
  };

  // --- Approval events FIRST (before message persistence). ---
  // If approval event creation fails, we bail before the message is saved.
  // This ensures no orphaned approval cards in the UI without a backing DB record.
  // See: Deep Agents uses atomic checkpointing (libs/evals/tests/evals/test_hitl.py:46-102).
  // We can't adopt checkpointing, but we can fix the persistence order.
  const approvalRequests = extractApprovalRequests(parts);
  if (approvalRequests.length > 0) {
    const approvalResults = await Promise.all(
      approvalRequests.map((request) =>
        createApprovalEvent(supabase, {
          clientId,
          threadId,
          runId,
          toolName: request.toolName,
          toolInput: request.toolInput,
          approvalId: request.approvalId,
        }),
      ),
    );

    const approvalPersistenceFailure = approvalResults.find(
      (result) => !result.success && result.status === "error",
    );

    if (approvalPersistenceFailure) {
      console.error(
        `[${logLabel}] approval event persistence failed:`,
        approvalPersistenceFailure.error,
      );
      await completeRun(supabase, { ...baseRunCompletion, status: "partial" });
      return;
    }

    await captureServerEvents(
      approvalRequests.map((request) => ({
        distinctId: clientId,
        event: "approval_requested",
        properties: {
          approval_id: request.approvalId,
          run_id: runId,
          thread_id: threadId,
          tool_name: request.toolName,
          ...(triggerType ? { trigger_type: triggerType } : {}),
        },
      })),
    );
  }

  // --- Message persistence SECOND. ---
  // If this fails after approval events succeeded, we have orphan approval rows.
  // Mark run as partial so the system knows the run didn't complete cleanly.
  if (hasNonStepParts || contentText.length > 0) {
    try {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "assistant",
          content: contentText,
          parts: hasNonStepParts
            ? (parts as Json)
            : ([{ type: "text", text: contentText }] as Json),
        },
      ]);
    } catch (messageError) {
      console.error(`[${logLabel}] message persistence failed after approval events:`, messageError);
      await completeRun(supabase, { ...baseRunCompletion, status: "partial" });
      return;
    }
  }

  await completeRun(supabase, { ...baseRunCompletion, status: "completed" });
```

The lines after `completeRun` (external delivery at lines 212-217, drain+compact at lines 219-224) stay exactly as they are.

### Step 7: Run all persistence tests

```
Run: npx vitest run src/lib/runner/__tests__/run-persistence.test.ts
Expected: PASS — all tests pass:
  - "writes approval events" — new order assertion passes
  - "does not persist assistant message when approval event creation fails" — passes
  - "marks run partial when message persistence fails after approval events succeed" — passes
  - "marks the run partial and skips draining when approval event persistence fails" — still passes
  - "delivers to external channels after run completion" — still passes
  - All other existing tests — unchanged behavior
```

### Step 8: Run the full runner test suite

```
Run: npx vitest run src/lib/runner/__tests__/
Expected: PASS — no regressions in run-agent, run-autopilot, compaction, or other runner tests.
```

### Step 9: Commit

```
git add src/lib/runner/run-persistence.ts src/lib/runner/__tests__/run-persistence.test.ts
git commit -m "fix: create approval events before message persistence to prevent orphaned UI cards"
```

---

## Relevant Files

### Source files
| File | Action |
|------|--------|
| `src/lib/runner/tools/utility/index.ts:37` | Modify (exclude todo for subagents) |
| `src/lib/runner/run-persistence.ts:140-210` | Modify (swap approval/message order, add message try/catch) |

### Test files
| File | Action |
|------|--------|
| `src/lib/runner/tools/utility/__tests__/index.test.ts:37-43` | Modify (update expected subagent tool list) |
| `src/lib/runner/__tests__/run-persistence.test.ts:247-252` | Modify (swap order assertion) |
| `src/lib/runner/__tests__/run-persistence.test.ts` | Add 2 new tests (approval-fails-no-message, message-fails-after-approvals) |

### Reference files
| File | Purpose |
|------|---------|
| `roadmap docs/Sunder - Source of Truth/references/deepagents/02-harness-fixes-design-doc.md` | Full design rationale |
| `docs/product/references/2026-03-23-sunder-vs-deepagents-agent-architecture-audit.md` | Audit that identified these drifts |
| `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/subagents.py:127` | `_EXCLUDED_STATE_KEYS` reference |
| `/Users/sethlim/Documents/deepagents/libs/evals/tests/evals/test_hitl.py:46-102` | Atomic checkpoint interrupt/resume reference |

---

## Notes

- **Task 1 is zero risk.** One line change plus existing test update. Subagents lose todo access they shouldn't have had.
- **Task 2 is low risk.** Swapping two blocks changes the failure mode from harmful (broken UI card) to harmless (orphan DB row). Added try/catch handles the inverse case (message fails after approvals succeed). All existing happy paths unchanged.
- **Implementation order:** Task 1 → Task 2. Least to most invasive. Commit after each task.
- **Deferred work:** Runner dedup (`runAgent`/`runAutopilot` collapse) deferred to separate PR per reviewer feedback — needs proper schema changes, error contract preservation, AI SDK v6 API audit, and caller updates.
- **Final commit message for PR:** `fix: agent harness — subagent todo isolation + approval persistence order`
