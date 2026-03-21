# Subagent Composio Tool Inheritance — Implementation Plan

**Goal:** Give subagents access to activated Composio connection tools (e.g., Gmail, Calendar) so automations that delegate to subagents can use external services.

**Architecture:** Pass the parent's already-loaded `composioTools` (a `ToolSet` object) through `createSubagentTool()` options into the subagent's `generateText()` call. This matches the Tasklet reference model where "subagents inherit all tools from the parent agent." No extra Composio API calls — reuses what the parent already loaded. Connection management tools (create, activate, delete) remain blocked for subagents via the existing `allowConnectionMutations: false` flag.

**Tech Stack:** TypeScript, Vercel AI SDK v6 (`ToolSet` type), Vitest

**Intentional drift from Tasklet documented below each relevant task.**

**Reference:**
- Tasklet v2 system prompt: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` (lines 131-137, 233-240)
- Tasklet subagent lifecycle: `roadmap docs/Sunder - Source of Truth/references/tasklet/core-architecture/05-subagent-lifecycle.md`
- Tasklet connection trace: `roadmap docs/Sunder - Source of Truth/references/tasklet/skills-deep-dive-connection-generation-trace.md` (lines 555-571, 758-760)
- Approval system design: `docs/product/designs/approval-system-pr33-34-35.md`

**Drift summary (Sunder vs Tasklet):**
| Aspect | Tasklet | Sunder (intentional) | Reason |
|---|---|---|---|
| Subagent system prompt | Instruction markdown only | Full system prompt + memory + skills + system-reminder | Better behavior consistency for solo practitioner product. Subagent knows persona, CRM vocab, user preferences without parent hardcoding. Worth the token cost. |
| Subagent tool surface | All parent tools inherited, no restrictions on activated connection tools | All parent tools inherited, but prompt guides agent to keep external-facing actions on the parent | Conservative safety boundary: subagents can read via connections (search Gmail, check calendar) but outbound actions (send email, create event) should stay with the parent until we intentionally widen this. |
| System-reminder | NOT given to subagents | Given to subagents | Subagent can discover connections without parent hardcoding connection IDs. Simpler instruction files. |
| Memory context | NOT given (subagent reads via read_file if needed) | Injected via assembleSystemOnly() | Subagent follows user preferences (e.g., "concise briefs") without extra tool calls. |
| Tool activation scope | Per-agent (each chat activates independently) | Per-client (activate once, available everywhere) | Simpler model for solo practitioner. No per-thread permission boundary. |
| Connection management | Blocked for subagents (UI tools) | Blocked via `allowConnectionMutations: false` | Same intent, different mechanism. |

**Review decisions (2026-03-20):**
1. **Safety boundary: Keep conservative.** Subagents get activated Composio tools but the system prompt tells the agent to keep external-facing actions (sending emails, creating events) on the parent. Subagents can read via connections (search Gmail, check calendar). We can widen later intentionally.
2. **Autopilot ordering: Minimal reorder only.** Move `createSubagentTool()` after `composioTools` is loaded. No broader refactor.
3. **Stale test: Fix as Task 0.** Repair the `gatewayProviderOptions` mock in `run-subagent.test.ts` before writing new tests.
4. **DRY tests: Extend existing tests.** Add assertions to existing happy-path tests rather than creating near-duplicate test cases.
5. **Prompt assertions: Yes.** Lock down the safety boundary wording with targeted assertions in `system-prompt.test.ts`.

---

## Relevant Files

**Modify:**
- `src/lib/runner/tools/subagents/run-subagent.ts` — accept + spread composioTools
- `src/lib/runner/run-agent.ts:259-263` — pass composioTools to createSubagentTool
- `src/lib/runner/run-autopilot.ts:62-77` — reorder so createSubagentTool comes after composioTools is loaded, pass composioTools
- `src/lib/ai/system-prompt.ts:175-183` — update subagent guidance text

**Test:**
- `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` — fix stale mock, add composio tool inheritance test
- `src/lib/runner/__tests__/run-agent.test.ts` — extend existing test to verify composioTools passed
- `src/lib/runner/__tests__/run-autopilot.test.ts` — extend existing test to verify composioTools passed
- `src/lib/ai/__tests__/system-prompt.test.ts` — add assertions locking down subagent safety wording

**Unchanged (verify no regressions):**
- `src/lib/runner/tool-registry.ts` — subagent branch (lines 61-68) unchanged; composio tools come from outside
- `src/lib/composio/activated-tools.ts` — no changes needed
- `src/lib/connections/queries.ts` — no changes needed

---

### Task 0: Fix stale run-subagent test harness

**Why:** The existing `run-subagent.test.ts` is already red because the mock at line 37 does not export `gatewayProviderOptions`, which `run-subagent.ts:101` now reads. Must fix before TDD is valid.

**Files:**
- Test: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts:37-40`

**Step 1: Add missing mock export**

In `run-subagent.test.ts`, find the `vi.mock("@/lib/ai/gateway", ...)` block (around line 37) and add `gatewayProviderOptions`:

```typescript
// BEFORE:
vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

// AFTER:
vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  gatewayProviderOptions: {},
  TIER_1_MODEL: "google/gemini-3-flash",
}));
```

**Step 2: Run the existing tests to verify they pass**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`
Expected: ALL 4 existing tests PASS (were previously red due to missing mock)

**Step 3: Commit**

```bash
git add src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
git commit -m "fix(test): add missing gatewayProviderOptions mock to run-subagent test harness"
```

---

### Task 1: Add composioTools to CreateSubagentToolOptions and spread into tool set

**Files:**
- Modify: `src/lib/runner/tools/subagents/run-subagent.ts:5,31-35,78-94`
- Test: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`

**Step 1: Write the failing test — subagent receives composio tools**

Add a new test inside the existing `describe("createSubagentTool")` block:

```typescript
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

**Step 3: Implement — add composioTools to interface and spread into tool set**

In `src/lib/runner/tools/subagents/run-subagent.ts`:

```typescript
// Add import at top (line 5):
import type { ToolSet } from "ai";

// Update interface (lines 31-35):
interface CreateSubagentToolOptions {
  parentRunId: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
  /**
   * Activated Composio connection tools inherited from the parent run.
   * Subagents receive the same activated tools as the parent — no extra
   * Composio API call. Connection management tools (create, activate,
   * delete) remain blocked via allowConnectionMutations: false.
   *
   * Drift from Tasklet: Tasklet gives subagents unrestricted access to all
   * inherited connection tools. We do the same at the tool level, but our
   * system prompt guides the agent to keep external-facing actions (send
   * email, create event) on the parent agent. This is a conservative safety
   * boundary we can widen later.
   */
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

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -t "spreads composioTools"`
Expected: PASS

**Step 5: Run all subagent tests to verify backward compat**

Run: `npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`
Expected: ALL PASS — existing tests don't pass `composioTools`, so they still get only runner tools

**Step 6: Commit**

```bash
git add src/lib/runner/tools/subagents/run-subagent.ts src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
git commit -m "feat(subagent): accept composioTools in CreateSubagentToolOptions and spread into tool set"
```

---

### Task 2: Pass composioTools from parent run-agent and run-autopilot to subagent

**Files:**
- Modify: `src/lib/runner/run-agent.ts:259-263`
- Modify: `src/lib/runner/run-autopilot.ts:62-77`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`
- Test: `src/lib/runner/__tests__/run-autopilot.test.ts`

**Step 1: Extend existing run-agent test — add composioTools assertion**

In `src/lib/runner/__tests__/run-agent.test.ts`, find the existing test around line 673 that already tests Composio integration (or the main happy-path test). Add an assertion to verify `mockCreateSubagentTool` receives `composioTools`:

```typescript
// Inside the existing happy-path test or composio test, add:
expect(mockCreateSubagentTool).toHaveBeenCalledWith(
  expect.anything(), // supabase
  expect.any(String), // clientId
  expect.any(String), // threadId
  expect.objectContaining({
    composioTools: expect.any(Object),
  }),
);
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts`
Expected: FAIL on the new assertion — `composioTools` not passed yet

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

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts`
Expected: PASS

**Step 5: Reorder and pass composioTools in run-autopilot.ts**

**Important:** In `run-autopilot.ts`, `createSubagentTool` is currently at line 67 BEFORE `composioTools` is loaded at lines 70-77. Must reorder.

```typescript
// BEFORE (lines 62-77):
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: false,
  allowConnectionMutations: false,
  includeBrowserTools: false,
});
const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
});
let composioTools: ToolSet = {};

try {
  const connections = await getActiveConnections(supabase, clientId);
  composioTools = await loadActivatedConnectionTools(connections);
} catch (error) {
  console.error("[composio] Failed to load activated connection tools for autopilot.", error);
}

// AFTER (reordered — load composio first, then create subagent tool):
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: false,
  allowConnectionMutations: false,
  includeBrowserTools: false,
});
let composioTools: ToolSet = {};

try {
  const connections = await getActiveConnections(supabase, clientId);
  composioTools = await loadActivatedConnectionTools(connections);
} catch (error) {
  console.error("[composio] Failed to load activated connection tools for autopilot.", error);
}

const subagentTools = createSubagentTool(supabase, clientId, threadId, {
  parentRunId: lockResult.runId,
  composioTools,
});
```

**Step 6: Extend existing run-autopilot test — add composioTools assertion**

In `src/lib/runner/__tests__/run-autopilot.test.ts`, find the existing happy-path test (around line 158) and add:

```typescript
expect(mockCreateSubagentTool).toHaveBeenCalledWith(
  expect.anything(),
  expect.any(String),
  expect.any(String),
  expect.objectContaining({
    composioTools: expect.any(Object),
  }),
);
```

**Step 7: Run all runner tests**

Run: `npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/run-autopilot.test.ts`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/run-autopilot.ts src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/run-autopilot.test.ts
git commit -m "feat(subagent): pass composioTools from parent run-agent and run-autopilot to subagent"
```

---

### Task 3: Update system prompt subagent guidance and lock with test assertions

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:175-183`
- Test: `src/lib/ai/__tests__/system-prompt.test.ts`

**Step 1: Write failing test assertions for the new prompt wording**

In `src/lib/ai/__tests__/system-prompt.test.ts`, add targeted assertions:

```typescript
describe("subagent guidance", () => {
  it("states subagents inherit activated connection tools", () => {
    expect(SYSTEM_PROMPT).toContain("including activated connection tools");
  });

  it("states subagents cannot create connections or triggers", () => {
    expect(SYSTEM_PROMPT).toContain("cannot create or activate connections");
    expect(SYSTEM_PROMPT).toContain("create triggers");
  });

  it("does not say subagents are internal-work-only", () => {
    expect(SYSTEM_PROMPT).not.toContain("internal work");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/system-prompt.test.ts -t "subagent guidance"`
Expected: FAIL — current prompt says "internal work" and doesn't mention "activated connection tools"

**Step 3: Update the subagent guidance**

In `src/lib/ai/system-prompt.ts`, replace the `<subagents>` block (lines 175-183):

```
<subagents>
You can delegate work to run_subagent.

- Prefer run_subagent for reusable instruction files, long multi-step work, or tasks that benefit from a clean isolated context.
- The subagent receives the same system guidance, memory, and tools you do — including activated connection tools (e.g., Gmail, Calendar). It is a stateless worker with a single request-response cycle.
- Subagents cannot access conversation history, compaction summaries, or prior trigger events unless you put the needed context into the payload.
- Subagents cannot create or activate connections, create triggers, send chat messages, or use the browser. They can use any already-activated connection tools.
- For external-facing actions that affect the user's clients (sending emails, creating calendar events), prefer doing those yourself rather than delegating to a subagent, so the user sees the action in their chat history.
- A good payload is explicit and self-contained: include the goal, required inputs, output format, and any constraints the subagent must follow.
</subagents>
```

Key changes from current:
- Removed "internal work only" blanket restriction
- Added "including activated connection tools" — clarifies tool inheritance
- Added explicit list of what subagents CANNOT do (matches code: `allowConnectionMutations: false`, `allowTriggerMutations: false`, `includeSendMessage: false`, `includeBrowserTools: false`)
- Added soft safety guidance: "prefer doing those yourself" for external-facing actions — this keeps the conservative boundary without hard-blocking. The tools ARE available if the parent delegates (e.g., autopilot trigger runs), but the agent is guided to keep user-visible actions in the main thread.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/system-prompt.test.ts -t "subagent guidance"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "docs(system-prompt): update subagent guidance — connection tools inherited, safety boundary preserved"
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

**Step 4: Run system prompt tests**

Run: `npx vitest run src/lib/ai/`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Final commit if any fixes were needed**

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
- [ ] System prompt contains "including activated connection tools" (locked by test)
- [ ] System prompt contains "cannot create or activate connections" (locked by test)
- [ ] System prompt does NOT contain "internal work" blanket restriction (locked by test)
