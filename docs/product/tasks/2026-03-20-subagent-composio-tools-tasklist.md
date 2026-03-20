# Subagent Composio Tool Inheritance — Implementation Plan

**Goal:** Give subagents access to activated Composio connection tools (e.g., Gmail, Calendar) so automations that delegate to subagents can use external services.

**Architecture:** Pass the parent's already-loaded `composioTools` (a `ToolSet` object) through `createSubagentTool()` options into the subagent's `generateText()` call. This matches the Tasklet reference model where "subagents inherit all tools from the parent agent." No extra Composio API calls — reuses what the parent already loaded. Connection management tools (create, activate, delete) remain blocked for subagents via the existing `allowConnectionMutations: false` flag.

**Tech Stack:** TypeScript, Vercel AI SDK v6 (`ToolSet` type), Vitest

**Intentional drift from Tasklet documented below each relevant task.**

**Reference:**
- Tasklet v2 system prompt: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` (lines 131-137, 233-240)
- Tasklet subagent lifecycle: `roadmap docs/Sunder - Source of Truth/references/tasklet/core-architecture/05-subagent-lifecycle.md`
- Tasklet connection trace: `roadmap docs/Sunder - Source of Truth/references/tasklet/skills-deep-dive-connection-generation-trace.md` (lines 555-571, 758-760)

**Drift summary (Sunder vs Tasklet):**
| Aspect | Tasklet | Sunder (intentional) | Reason |
|---|---|---|---|
| Subagent system prompt | Instruction markdown only | Full system prompt + memory + skills + system-reminder | Better behavior consistency for solo practitioner product. Subagent knows persona, CRM vocab, user preferences without parent hardcoding. Worth the token cost. |
| Subagent tool surface | All parent tools inherited | All parent tools inherited (after this fix) | Parity restored. |
| System-reminder | NOT given to subagents | Given to subagents | Subagent can discover connections without parent hardcoding connection IDs. Simpler instruction files. |
| Memory context | NOT given (subagent reads via read_file if needed) | Injected via assembleSystemOnly() | Subagent follows user preferences (e.g., "concise briefs") without extra tool calls. |
| Tool activation scope | Per-agent (each chat activates independently) | Per-client (activate once, available everywhere) | Simpler model for solo practitioner. No per-thread permission boundary. |
| Connection management | Blocked for subagents (UI tools) | Blocked via `allowConnectionMutations: false` | Same intent, different mechanism. |

---

## Relevant Files

**Modify:**
- `src/lib/runner/tools/subagents/run-subagent.ts` — accept + spread composioTools
- `src/lib/runner/run-agent.ts:259-263` — pass composioTools to createSubagentTool
- `src/lib/runner/run-autopilot.ts:67-69` — pass composioTools to createSubagentTool
- `src/lib/ai/system-prompt.ts:176-183` — update subagent guidance text

**Test:**
- `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` — add test for composio tool inheritance
- `src/lib/runner/__tests__/run-agent.test.ts` — verify composioTools passed to createSubagentTool
- `src/lib/runner/__tests__/run-autopilot.test.ts` — verify composioTools passed to createSubagentTool

**Unchanged (verify no regressions):**
- `src/lib/runner/tool-registry.ts` — subagent branch (lines 61-68) unchanged; composio tools come from outside
- `src/lib/composio/activated-tools.ts` — no changes needed
- `src/lib/connections/queries.ts` — no changes needed

---

### Task 1: Add composioTools to CreateSubagentToolOptions interface

**Files:**
- Modify: `src/lib/runner/tools/subagents/run-subagent.ts:5,31-35,78-94`
- Test: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`

**Step 1: Write the failing test — subagent receives composio tools**

Add to the test file after the existing imports and mocks. Add a new mock for Composio tools and a new test case:

```typescript
// In run-subagent.test.ts, add a new test inside the describe block:

it("spreads composioTools into the subagent tool set alongside runner tools", async () => {
  const fakeComposioTools = {
    "conn_abc__GMAIL_SEND_EMAIL": { description: "Send email via Gmail" },
    "conn_abc__GMAIL_SEARCH_THREADS": { description: "Search Gmail threads" },
  };

  const { run_subagent } = createSubagentTool(
    "supabase" as never,
    CLIENT_ID,
    THREAD_ID,
    {
      parentRunId: PARENT_RUN_ID,
      composioTools: fakeComposioTools as never,
    },
  );

  await run_subagent.execute(
    {
      path: "subagents/triggers/morning-briefing.md",
    },
    { abortSignal: new AbortController().signal } as never,
  );

  expect(mockGenerateText).toHaveBeenCalledWith(
    expect.objectContaining({
      tools: {
        search_contacts: { description: "tool" },
        "conn_abc__GMAIL_SEND_EMAIL": { description: "Send email via Gmail" },
        "conn_abc__GMAIL_SEARCH_THREADS": { description: "Search Gmail threads" },
      },
    }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -t "spreads composioTools"`
Expected: FAIL — `composioTools` is not a recognized property of `CreateSubagentToolOptions`

**Step 3: Add composioTools to the interface and spread into tool set**

In `src/lib/runner/tools/subagents/run-subagent.ts`:

```typescript
// Add import at top (line 5):
import type { ToolSet } from "ai";

// Update interface (lines 31-35):
interface CreateSubagentToolOptions {
  parentRunId: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  /** Activated Composio connection tools inherited from the parent run. */
  composioTools?: ToolSet;
}

// Update the tools assignment (around line 78-86):
// BEFORE:
//   const tools = createRunnerTools(supabase, clientId, threadId, { ... });
// AFTER:
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: false,
  allowConnectionMutations: false,
  isSubagent: true,
  includeSendMessage: false,
  includeBrowserTools: false,
  crmConfig: options.crmConfig,
  crmMode: options.crmMode ?? "normal",
});
const tools = {
  ...runnerTools,
  ...(options.composioTools ?? {}),
};
```

Also update the `generateText` call (line 94) — the `tools` variable name is already correct, no change needed there.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -t "spreads composioTools"`
Expected: PASS

**Step 5: Write test — subagent works without composioTools (backward compat)**

```typescript
it("works without composioTools option (backward compatible)", async () => {
  const { run_subagent } = createSubagentTool(
    "supabase" as never,
    CLIENT_ID,
    THREAD_ID,
    {
      parentRunId: PARENT_RUN_ID,
      // No composioTools passed
    },
  );

  await run_subagent.execute(
    {
      path: "subagents/triggers/morning-briefing.md",
    },
    { abortSignal: new AbortController().signal } as never,
  );

  expect(mockGenerateText).toHaveBeenCalledWith(
    expect.objectContaining({
      tools: {
        search_contacts: { description: "tool" },
      },
    }),
  );
});
```

**Step 6: Run all subagent tests**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`
Expected: ALL PASS (existing tests still pass because composioTools is optional)

**Step 7: Commit**

```bash
git add src/lib/runner/tools/subagents/run-subagent.ts src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
git commit -m "feat(subagent): accept composioTools in CreateSubagentToolOptions and spread into tool set"
```

---

### Task 2: Pass composioTools from parent run to subagent

**Files:**
- Modify: `src/lib/runner/run-agent.ts:259-263`
- Modify: `src/lib/runner/run-autopilot.ts:67-69`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`
- Test: `src/lib/runner/__tests__/run-autopilot.test.ts`

**Step 1: Write the failing test — run-agent passes composioTools to createSubagentTool**

In `src/lib/runner/__tests__/run-agent.test.ts`, find the test that verifies `mockCreateSubagentTool` is called. Add an assertion that composioTools is passed. First, check existing test patterns — the test already mocks `mockGetActiveConnections` and `mockLoadActivatedConnectionTools`. Add:

```typescript
// Find the existing test "runs the agent loop..." or similar.
// Add/modify the assertion for mockCreateSubagentTool:

it("passes composioTools to createSubagentTool", async () => {
  const fakeComposioTools = { "conn_1__GMAIL_SEND": { description: "send" } };
  mockGetActiveConnections.mockResolvedValue([]);
  mockLoadActivatedConnectionTools.mockResolvedValue(fakeComposioTools);

  // ... existing setup (mockCreateRun, mockAssembleContext, mockStreamText, etc.)
  // Run the agent...

  expect(mockCreateSubagentTool).toHaveBeenCalledWith(
    expect.anything(), // supabase
    expect.any(String), // clientId
    expect.any(String), // threadId
    expect.objectContaining({
      composioTools: fakeComposioTools,
    }),
  );
});
```

Note: This test will need the same boilerplate as existing run-agent tests (mockCreateRun returning `{ created: true, runId: "..." }`, mockAssembleContext, mockStreamText, etc.). Copy the setup from an existing passing test and modify the assertion.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "passes composioTools"`
Expected: FAIL — createSubagentTool is not called with composioTools

**Step 3: Pass composioTools in run-agent.ts**

In `src/lib/runner/run-agent.ts`, update lines 259-263:

```typescript
// BEFORE:
const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
  crmConfig,
  crmMode,
});

// AFTER:
const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
  crmConfig,
  crmMode,
  composioTools,
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts -t "passes composioTools"`
Expected: PASS

**Step 5: Pass composioTools in run-autopilot.ts**

In `src/lib/runner/run-autopilot.ts`, update lines 67-69:

```typescript
// BEFORE:
const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
});

// AFTER:
const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
  composioTools,
});
```

Note: The `composioTools` variable is already in scope — it's declared at line 70 and populated at lines 72-77.

**Step 6: Run all runner tests**

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/run-autopilot.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/run-autopilot.ts src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/run-autopilot.test.ts
git commit -m "feat(subagent): pass composioTools from parent run-agent and run-autopilot to subagent"
```

---

### Task 3: Update system prompt subagent guidance

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:175-183`

**Step 1: Read the current subagent guidance**

Current text at lines 175-183:
```
<subagents>
You can delegate bounded internal work to run_subagent.

- Prefer run_subagent for reusable instruction files, long multi-step work, or tasks that benefit from a clean isolated context.
- The subagent receives the same system guidance and tools you do, but it is a stateless worker with a single request-response cycle.
- Subagents cannot access conversation history, compaction summaries, or prior trigger events unless you put the needed context into the payload.
- Use subagents only for internal work. Do not delegate anything that requires direct user interaction or approval-gated external actions.
- A good payload is explicit and self-contained: include the goal, required inputs, output format, and any constraints the subagent must follow.
</subagents>
```

**Step 2: Update the guidance**

Replace the `<subagents>` block with:

```
<subagents>
You can delegate work to run_subagent.

- Prefer run_subagent for reusable instruction files, long multi-step work, or tasks that benefit from a clean isolated context.
- The subagent receives the same system guidance, memory, and tools you do — including activated connection tools (e.g., Gmail, Calendar). It is a stateless worker with a single request-response cycle.
- Subagents cannot access conversation history, compaction summaries, or prior trigger events unless you put the needed context into the payload.
- Subagents cannot create or activate connections, create triggers, send chat messages, or use the browser. They can use any already-activated connection tools.
- A good payload is explicit and self-contained: include the goal, required inputs, output format, and any constraints the subagent must follow.
</subagents>
```

Key changes:
- Removed "internal work only" restriction — subagents can now do external work via activated connections
- Added "including activated connection tools" to clarify inheritance
- Explicit list of what subagents CANNOT do (connection management, triggers, send_message, browser) — matches the code flags in `run-subagent.ts:79-83`

**Step 3: Verify the system prompt compiles**

Run: `npx tsc --noEmit src/lib/ai/system-prompt.ts`
Expected: no errors (or same pre-existing errors as before)

**Step 4: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "docs(system-prompt): update subagent guidance — connection tools now inherited"
```

---

### Task 4: Run full test suite and verify no regressions

**Files:**
- No changes — verification only

**Step 1: Run all runner tests**

Run: `npx vitest run src/lib/runner/`
Expected: ALL PASS

**Step 2: Run all connection tool tests**

Run: `npx vitest run src/lib/runner/tools/connections/`
Expected: ALL PASS (no changes to these files)

**Step 3: Run all composio tests**

Run: `npx vitest run src/lib/composio/`
Expected: ALL PASS (no changes to these files)

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Final commit (if any test fixes were needed)**

```bash
git commit -m "test: fix any regressions from subagent composio tool inheritance"
```

---

## Verification Checklist

After implementation, manually verify these scenarios:

- [ ] Parent chat run: agent has CRM tools + Composio tools + subagent tool (unchanged behavior)
- [ ] Subagent run: subagent now has CRM tools + Composio tools (NEW — previously missing Composio)
- [ ] Subagent run without connections: subagent has CRM tools only, no error (backward compat)
- [ ] Autopilot run: autopilot passes composioTools to subagent (same as chat)
- [ ] Subagent cannot create connections (`allowConnectionMutations: false` still works)
- [ ] Subagent cannot create triggers (`allowTriggerMutations: false` still works)
- [ ] Subagent cannot send chat messages (`includeSendMessage: false` still works)
- [ ] Subagent cannot use browser (`includeBrowserTools: false` still works)
