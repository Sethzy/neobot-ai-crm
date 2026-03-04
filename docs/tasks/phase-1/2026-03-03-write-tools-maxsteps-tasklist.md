# Enable CRM Write Tools + Bump maxSteps Implementation Plan

**Goal:** Always enable CRM write tools with prompt-level approval guidance, and increase runner step cap from 4 to 8.

**Decisions:** `SAFETY-01` (mixed autonomy), `SAFETY-02` (approval gate as chat interaction), `SAFETY-04` (two-column approval matrix)

**Architecture:** Two changes. First, remove the env-gated write-tool suppression — all CRM tools (read + write) are always available to the agent. The system prompt instructs the agent to describe CRM mutations in plain language and ask for user confirmation before executing (interim approximation of the PR 33 approval gate per SAFETY-02). Second, bump `MAX_STEPS_TIER_1` from 4 to 8 so the agent can complete longer multi-step requests without cutting off.

**Tech Stack:** Vitest, AI SDK v6 (`streamText`, `stepCountIs`)

**Prerequisites:**
- `src/lib/runner/run-agent.ts` — current runner entrypoint
- `src/lib/runner/__tests__/run-agent.test.ts` — existing runner tests
- `src/lib/runner/tools/crm/index.ts` — CRM tool factory with `allowWriteTools` option
- `src/lib/ai/system-prompt.ts` — placeholder system prompt

## Task Overview

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Bump maxSteps from 4 → 8 | 2 (source + test) | ~2 updated |
| 2 | Always enable CRM write tools | 3 (source + test + tool factory) | ~6 updated/removed |
| 3 | Add prompt-level approval guidance to system prompt | 2 (source + test) | ~1 new |

---

### Task 1: Bump maxSteps from 4 to 8

**Files:**
- Modify: `src/lib/runner/run-agent.ts:17`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts:116`

**Context:** The `MAX_STEPS_TIER_1` constant controls how many tool-call rounds the AI SDK allows before stopping. Currently set to 4, which is too few for multi-step CRM workflows (e.g., search contacts → create deal → log interaction → update task). Bumping to 8 matches the plan spec (PR6 task).

**Step 1: Write the failing test update**

Update the existing assertion in `run-agent.test.ts` line 116 from `4` to `8`:

```typescript
// src/lib/runner/__tests__/run-agent.test.ts line 116
// BEFORE:
expect(mockStepCountIs).toHaveBeenCalledWith(4);
// AFTER:
expect(mockStepCountIs).toHaveBeenCalledWith(8);
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: FAIL — `Expected: 8, Received: 4`

**Step 3: Write minimal implementation**

Update `src/lib/runner/run-agent.ts` line 17:

```typescript
// BEFORE:
const MAX_STEPS_TIER_1 = 4;
// AFTER:
const MAX_STEPS_TIER_1 = 8;
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner): bump maxSteps from 4 to 8 for multi-step CRM workflows"
```

---

### Task 2: Always Enable CRM Write Tools

**Files:**
- Modify: `src/lib/runner/run-agent.ts:18,30-41,72-74`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts:78-80,109-212`
- Modify: `src/lib/runner/tools/crm/index.ts:14-18`

**Context:** CRM write tools are currently gated behind `RUNNER_ENABLE_CRM_WRITE_TOOLS` env var and hardcoded off in production. Per the approved direction (SAFETY-01/02/04), write tools should always be available. The real enforcement layer (PR 33 approval gate) will come later; for now, the system prompt tells the agent to ask before mutating. Remove the gating function, always pass `allowWriteTools: true`, and update the tool factory JSDoc.

**Step 1: Write failing tests**

Replace the 5 env-gated tests (lines 144–212) with a single assertion that write tools are always enabled. Also update the main `"streams when lock is acquired"` test to expect write tools in the tool bag.

```typescript
// src/lib/runner/__tests__/run-agent.test.ts

// In beforeEach, update the CRM mock to return both read + write tools:
mockCreateCrmTools.mockReturnValue({
  search_contacts: { description: "tool" },
  create_contact: { description: "tool" },
  update_contact: { description: "tool" },
  search_deals: { description: "tool" },
  create_deal: { description: "tool" },
  update_deal: { description: "tool" },
  search_tasks: { description: "tool" },
  create_task: { description: "tool" },
  update_task: { description: "tool" },
  create_interaction: { description: "tool" },
});

// In "streams when lock is acquired" test, update the tools expectation:
tools: {
  search_contacts: { description: "tool" },
  create_contact: { description: "tool" },
  update_contact: { description: "tool" },
  search_deals: { description: "tool" },
  create_deal: { description: "tool" },
  update_deal: { description: "tool" },
  search_tasks: { description: "tool" },
  create_task: { description: "tool" },
  update_task: { description: "tool" },
  create_interaction: { description: "tool" },
  read_file: { description: "storage-tool" },
  write_file: { description: "storage-tool" },
  web_search: { description: "web-search-tool" },
  web_scrape: { description: "web-scrape-tool" },
},

// Update createCrmTools assertion to always expect true:
expect(mockCreateCrmTools).toHaveBeenCalledWith(
  "mock-supabase-client",
  validPayload.clientId,
  { allowWriteTools: true },
);

// REPLACE the 5 env-gated tests (lines 144-212) with ONE test:
it("always enables CRM write tools regardless of environment", async () => {
  process.env.VERCEL_ENV = "production";
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

  await runAgent(validPayload, "mock-supabase-client" as never);

  expect(mockCreateCrmTools).toHaveBeenCalledWith(
    "mock-supabase-client",
    validPayload.clientId,
    { allowWriteTools: true },
  );
});

// REMOVE these saved/restored env vars from top of file (lines 78-80):
// const originalEnableCrmWriteToolsEnv = ...
// (keep originalNodeEnv and originalVercelEnv for any other tests)

// REMOVE the env restore block in afterAll for RUNNER_ENABLE_CRM_WRITE_TOOLS
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: FAIL — tests expect `allowWriteTools: true` but code still passes result of `areCrmWriteToolsEnabled()`.

**Step 3: Write minimal implementation**

In `src/lib/runner/run-agent.ts`:

1. Remove `ENABLE_CRM_WRITE_TOOLS_ENV` constant (line 18).
2. Remove `areCrmWriteToolsEnabled()` function (lines 30-41).
3. Change line 72-74 from:
```typescript
const crmTools = createCrmTools(supabase, clientId, {
  allowWriteTools: areCrmWriteToolsEnabled(),
});
```
to:
```typescript
const crmTools = createCrmTools(supabase, clientId, {
  allowWriteTools: true,
});
```

In `src/lib/runner/tools/crm/index.ts`, update the JSDoc on `allowWriteTools` (line 16):

```typescript
// BEFORE:
/**
 * Enables mutating CRM tools. Keep disabled until approval orchestration is enforced.
 */
allowWriteTools?: boolean;

// AFTER:
/**
 * Enables mutating CRM tools. Always true in v1; prompt-level approval
 * provides interim safety until the PR 33 approval gate ships.
 */
allowWriteTools?: boolean;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/tools/crm/index.ts
git commit -m "feat(runner): always enable CRM write tools, remove env gate"
```

---

### Task 3: Add Prompt-Level Approval Guidance

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Create: `src/lib/ai/__tests__/system-prompt.test.ts`

**Context:** Per SAFETY-02, the approval gate is a chat interaction — the agent presents the action in plain language and waits for user reply. Until PR 33 enforces this mechanically, we add explicit instructions to the system prompt telling the agent to describe CRM mutations and ask before executing. This is the interim safety layer.

**Step 1: Write the failing test**

```typescript
// src/lib/ai/__tests__/system-prompt.test.ts
/**
 * Tests for system prompt content and safety instructions.
 * @module lib/ai/__tests__/system-prompt
 */
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "../system-prompt";

describe("SYSTEM_PROMPT", () => {
  it("includes CRM mutation approval instructions", () => {
    expect(SYSTEM_PROMPT).toContain("ask the user for confirmation");
  });

  it("lists the write tool names that require approval", () => {
    const writeTools = [
      "create_contact",
      "update_contact",
      "create_deal",
      "update_deal",
      "create_interaction",
      "create_task",
      "update_task",
    ];

    for (const tool of writeTools) {
      expect(SYSTEM_PROMPT).toContain(tool);
    }
  });

  it("includes Singapore real estate agent context", () => {
    expect(SYSTEM_PROMPT).toContain("real estate");
    expect(SYSTEM_PROMPT).toContain("Singapore");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — current prompt does not contain "ask the user for confirmation" or write tool names.

**Step 3: Write minimal implementation**

Replace the content of `src/lib/ai/system-prompt.ts`:

```typescript
/**
 * Bootstrap chat system prompt with interim CRM approval guidance.
 * @module lib/ai/system-prompt
 */

/**
 * System prompt for the Sunder agent.
 *
 * Includes interim approval instructions (SAFETY-02) that tell the agent
 * to describe CRM mutations and ask the user for confirmation before
 * executing write tools. This will be replaced by the mechanical
 * approval gate in PR 33.
 */
export const SYSTEM_PROMPT = `You are Sunder, an AI assistant for solo real estate agents in Singapore.

You help with:
- CRM management (contacts, deals, and follow-ups)
- Practical daily planning and summaries
- Drafting clear client communications
- Fast research for real estate work

Be concise, practical, and action-oriented.
If information is uncertain, state that clearly.

## CRM Write Actions — Always Ask First

You have access to tools that create or update CRM records. Before calling any of the following tools, you MUST describe the action in plain language and ask the user for confirmation. Do NOT execute the tool until the user explicitly approves.

Write tools that require approval:
- create_contact — creates a new contact record
- update_contact — modifies an existing contact
- create_deal — creates a new deal record
- update_deal — modifies an existing deal
- create_interaction — logs a new interaction (call, meeting, email, etc.)
- create_task — creates a new CRM task
- update_task — modifies an existing task

Example:
User: "Add John Tan as a new buyer contact"
You: "I'll create a new contact with these details:
- Name: John Tan
- Type: Buyer
Should I go ahead?"
User: "Yes"
Then call create_contact.

If the user says no, acknowledge and do not proceed.
Read tools (search_contacts, search_deals, search_tasks) do NOT require approval — use them freely.`;
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: PASS

**Step 5: Run all runner + AI tests to verify no regressions**

```bash
npx vitest run src/lib/ai/__tests__ src/lib/runner/__tests__/run-agent.test.ts
npx tsc --noEmit
```

Expected: All tests PASS. No type errors.

**Step 6: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(safety): add interim CRM write-approval instructions to system prompt"
```

---

## Relevant Files Summary

| File | Action | Task |
|------|--------|------|
| `src/lib/runner/run-agent.ts` | Modify | 1, 2 |
| `src/lib/runner/__tests__/run-agent.test.ts` | Modify | 1, 2 |
| `src/lib/runner/tools/crm/index.ts` | Modify (JSDoc only) | 2 |
| `src/lib/ai/system-prompt.ts` | Modify | 3 |
| `src/lib/ai/__tests__/system-prompt.test.ts` | Create | 3 |

## Final Checklist

- [ ] No production code without a failing test first
- [ ] `npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/ai/__tests__/system-prompt.test.ts` passes
- [ ] `npx tsc --noEmit` passes
- [ ] maxSteps is 8
- [ ] CRM write tools always enabled (no env gate)
- [ ] System prompt tells agent to ask before CRM mutations
