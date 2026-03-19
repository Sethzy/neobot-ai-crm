# Chat Stream Latency Optimization

**Goal:** Reduce time-to-first-token and title-appearance delay by parallelizing pre-stream setup and reordering the system prompt for LLM cache-friendliness.

**Architecture:** No steps are removed — all auth, quota, lock, context, and tool loading still happen. We (1) start title generation earlier so it overlaps with `runAgent()` setup, (2) run CRM config loading and Composio connection loading in parallel via `Promise.all`, (3) reorder system prompt sections so the static prefix is cache-friendly, and (4) add a popstate handler for navigation consistency.

**Tech Stack:** `Promise.all`, Vercel AI SDK, Supabase queries, Vitest.

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Relevant Files

| File | Action | Task |
|------|--------|------|
| `app/api/chat/route.ts` | Modify | 1 |
| `src/lib/runner/run-agent.ts` | Modify | 2 |
| `src/lib/runner/__tests__/run-agent.test.ts` | Verify | 2 |
| `src/lib/runner/context.ts` | Modify | 3 |
| `src/lib/runner/__tests__/context.test.ts` | Modify | 3 |
| `src/components/chat/chat-panel.tsx` | Modify | 4 |

---

### Task 1: Move title generation before `runAgent()`

**Why:** Currently `generateTitleFromUserMessage` starts AFTER `runAgent()` returns (~2-5s of agent setup). The Vercel chatbot reference starts it immediately after chat creation. Moving it before `runAgent()` lets it run in parallel with all the agent setup, so the title appears 2-5s sooner.

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: Read the current route and locate the two relevant blocks**

Open `app/api/chat/route.ts`. Find these two sections:

1. Thread creation block — ends around the line `didCreateThread = true;` (currently ~line 231)
2. Title generation — currently after `runAgent()` returns and after analytics:
```typescript
_t("title_gen_start");
const titlePromise = isNewThread && input.length > 0
  ? generateTitleFromUserMessage(input)
  : null;
```

**Step 2: Move `titlePromise` to right after thread creation, before approval handling and `runAgent()`**

After the block that ends with `didCreateThread = true;` and its closing `}`, insert:

```typescript
    // Start title generation early so it runs in parallel with runAgent() setup.
    const titlePromise = isNewThread && input.length > 0
      ? generateTitleFromUserMessage(input)
      : null;
```

**Step 3: Delete the old `titlePromise` declaration**

Remove the old `titlePromise` block that currently sits after `runAgent()` returns (after the `captureServerEvent` call for `chat_message_sent`). Also remove the `_t("title_gen_start")` line that preceded it.

The `titlePromise` variable is still consumed later inside the `createUIMessageStream` execute callback — that code stays unchanged.

**Step 4: Run existing tests**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts src/lib/ai/__tests__/chat-stream-route.test.ts --reporter=verbose
```

Expected: All pass. The mocked `generateTitleFromUserMessage` is still called with the same input — only timing changes.

**Step 5: Manual verification with timing logs**

Send a new chat message. Check server console for `[chat/timing]` logs. Confirm `title_gen_start` no longer appears (we removed that `_t` call — the title now starts before `pre_run_agent`). The `title_gen_resolved` timestamp inside the stream should now overlap with or come shortly after `run_agent_returned`, instead of much later.

**Step 6: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "perf(chat): start title generation before runAgent for faster sidebar naming"
```

---

### Task 2: Parallelize CRM config + Composio connection loading in `runAgent()`

**Why:** After acquiring the run lock and persisting the user message (which must be sequential), `loadCrmConfig` and `getActiveConnections → loadActivatedConnectionTools` run one after another. They are independent — neither needs the other's result. Running them in parallel via `Promise.all` saves the full duration of whichever is slower.

**Current flow (sequential):**
```
loadCrmConfig → assembleContext → createRunnerTools (sync) → createSubagentTool (sync) → getActiveConnections → loadActivatedConnectionTools → streamText
```

**New flow (parallel where safe):**
```
┌─ loadCrmConfig ──────────────┐
│                               ├─→ assembleContext → createRunnerTools (sync) → createSubagentTool (sync)
└─ getActiveConnections ───────┘                                                                          ├─→ streamText
   └─ loadActivatedConnectionTools ──────────────────────────────────────────────────────────────────────┘
```

`assembleContext` and tool creation depend on `crmConfig`, so they run after Phase A. But Composio finishes during or before Phase A, so it's ready by the time we need to merge tools.

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Verify: `src/lib/runner/__tests__/run-agent.test.ts`

**Step 1: Run existing tests to confirm green baseline**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: All pass.

**Step 2: Replace the sequential block with parallel phases**

In `src/lib/runner/run-agent.ts`, find the block after `shouldReleaseConsumedQuota = false;` (after `createMessages`). Replace the sequential operations with:

```typescript
    // Phase A: Load CRM config and Composio connections in parallel.
    // These are independent — neither needs the other's result.
    const composioPromise = getActiveConnections(supabase, clientId)
      .then((connections) => {
        _t("get_connections");
        return loadActivatedConnectionTools(connections);
      })
      .then((tools) => {
        _t("load_composio_tools");
        return tools;
      })
      .catch((error) => {
        _t("composio_failed");
        console.error("[composio] Failed to load activated connection tools for runner.", error);
        return {} as ToolSet;
      });

    const [{ config: crmConfig }, composioTools] = await Promise.all([
      loadCrmConfig(supabase, clientId).then((result) => {
        _t("load_crm_config");
        return result;
      }),
      composioPromise,
    ]);

    // Phase B: assembleContext needs crmConfig (now available).
    // Composio tools are also resolved from Phase A.
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
      crmConfig,
      crmMode,
      includeBrowserAutomation:
        payload.triggerType === "chat" && isBrowserUseConfigured(),
      crmConfigModeActive: payload.includeConfigTool,
    });
    _t("assemble_context");

    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      crmMode,
      crmConfig,
      includeBrowserTools: payload.triggerType === "chat",
      includeConfigTool: payload.includeConfigTool,
    });
    const subagentTools = createSubagentTool(supabase, clientId, threadId, {
      parentRunId: lockResult.runId,
      crmConfig,
      crmMode,
    });
    _t("create_tools");
```

This replaces the entire sequential block from `const { config: crmConfig }` through the Composio `try/catch`. Note that `composioTools` is now `const` (not `let`) since it comes from `Promise.all` destructuring.

**Step 3: Run tests**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts --reporter=verbose
```

Expected: All pass. The mocks return the same values regardless of call order.

**Step 4: Manual verification with timing logs**

Send a chat message. Check `[runner/timing]` logs. Confirm `load_crm_config` and `get_connections` now show similar timestamps (running in parallel), whereas previously `get_connections` appeared much later.

**Step 5: Commit**

```bash
git add src/lib/runner/run-agent.ts
git commit -m "perf(runner): parallelize CRM config and Composio loading with Promise.all"
```

---

### Task 3: Reorder system prompt sections for LLM cache-friendliness

**Why:** LLM providers cache prompts from the prefix. If the static prefix is identical between turns, the provider skips re-processing it. Our current prompt interleaves static and dynamic content — `<available-skills>` (semi-static, rarely changes) sits after `<working-memory>` (dynamic, changes frequently). Moving skills into the static prefix zone extends the cached region.

**Current section order in `buildSystemPrompt` (when memory is loaded):**
```
1. PLATFORM_INSTRUCTIONS        ← static
2. SYSTEM_PROMPT                ← static
3. BROWSER_AUTOMATION_PROMPT    ← static (conditional)
4. Custom instructions          ← semi-static
5. <soul>                       ← semi-static
6. <user-profile>               ← semi-dynamic
7. <working-memory>             ← dynamic
8. <available-skills>           ← semi-static (WRONG POSITION)
9. <compaction-summary>         ← dynamic
10. <system-reminder>           ← dynamic
```

**New section order:**
```
1. PLATFORM_INSTRUCTIONS        ← static     ─┐
2. SYSTEM_PROMPT                ← static      │ CACHED PREFIX
3. BROWSER_AUTOMATION_PROMPT    ← static      │
4. Custom instructions          ← semi-static │
5. <available-skills>           ← semi-static ─┘ (MOVED UP)
6. <soul>                       ← semi-static ─┐
7. <user-profile>               ← semi-dynamic │ DYNAMIC TAIL
8. <working-memory>             ← dynamic      │
9. <compaction-summary>         ← dynamic      │
10. <system-reminder>           ← dynamic     ─┘
```

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`

**Step 1: Write a failing test for the new section order**

In `src/lib/runner/__tests__/context.test.ts`, add a new test after the existing "assembles system string in 7-layer order" test (around line 115):

```typescript
  it("places available-skills before memory sections for cache-friendliness", async () => {
    mockDiscoverUserSkills.mockResolvedValueOnce([
      {
        slug: "test-skill",
        name: "test-skill",
        description: "A test skill.",
        path: "/agent/skills/test-skill/SKILL.md",
      },
    ]);
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    const skillsIdx = result.system.indexOf("<available-skills>");
    const soulIdx = result.system.indexOf("<soul>");
    const memoryIdx = result.system.indexOf("<working-memory>");

    expect(skillsIdx).toBeGreaterThan(0);
    expect(skillsIdx).toBeLessThan(soulIdx);
    expect(soulIdx).toBeLessThan(memoryIdx);
  });
```

**Step 2: Run the new test to verify it fails**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "places available-skills before memory" --reporter=verbose
```

Expected: FAIL — currently `<available-skills>` appears after `<working-memory>`, not before `<soul>`.

**Step 3: Reorder the sections in `buildSystemPrompt`**

In `src/lib/runner/context.ts`, find the `buildSystemPrompt` function. In the `if (memory)` branch (starts around line 128), reorder the sections. Move the `userSkills` block up to right after the `instructions` block, before `memory.soul`:

```typescript
  const sections: string[] = [];

  // --- Static prefix (cached by LLM provider) ---
  sections.push(activePlatformInstructions);
  sections.push(activeSystemPrompt);

  if (includeBrowserAutomation) {
    sections.push(BROWSER_AUTOMATION_PROMPT);
  }

  if (instructions && instructions.trim().length > 0) {
    sections.push(instructions.trim());
  }

  // Skills change rarely — keep in the stable prefix zone.
  if (userSkills && userSkills.length > 0) {
    const listing = userSkills
      .map((skill) => `- **${skill.name}**: ${skill.description}\n  -> \`read_file("${skill.path}")\``)
      .join("\n");
    sections.push(`<available-skills>\n${listing}\n</available-skills>`);
  }

  // --- Dynamic tail (changes between turns) ---
  if (memory.soul.length > 0) {
    sections.push(`<soul>\n${memory.soul}\n</soul>`);
  }

  if (memory.user.length > 0) {
    sections.push(`<user-profile>\n${memory.user}\n</user-profile>`);
  }

  if (memory.memory.length > 0) {
    sections.push(`<working-memory>\n${memory.memory}\n</working-memory>`);
  }

  if (compactionSummary && compactionSummary.trim().length > 0) {
    sections.push(`<compaction-summary>\n${compactionSummary.trim()}\n</compaction-summary>`);
  }

  if (systemReminder) {
    sections.push(systemReminder);
  }

  return sections.join("\n\n");
```

The only change: the `userSkills` block moved from after `<working-memory>` to after `instructions` / before `<soul>`.

**Step 4: Run the new test to verify it passes**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "places available-skills before memory" --reporter=verbose
```

Expected: PASS.

**Step 5: Run all context tests to verify no regressions**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts --reporter=verbose
```

Expected: All pass. The existing "7-layer order" test checks `platform < sunder < soul < user < memory < reminder` — this ordering is preserved (skills moved above soul, but the test doesn't check skills position). The "injects available skills" test (line 404) checks for content presence, not position.

**Step 6: Also verify the no-memory branch is unchanged**

The `if (!memory)` branch in `buildSystemPrompt` (around line 107) has skills in a different position. Check that the no-memory branch still works:

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts -t "injects run-specific instructions when memory is not loaded" --reporter=verbose
```

Expected: PASS. The no-memory branch is not changed by this task.

**Step 7: Commit**

```bash
git add src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "perf(prompt): reorder system prompt for LLM prefix cache-friendliness

Move <available-skills> before memory sections (<soul>, <user-profile>,
<working-memory>) so the static prefix is longer and more cache-friendly.
Skills rarely change between turns, while memory content does."
```

---

### Task 4: Add popstate handler to ChatPanel

**Why:** Sunder uses `window.history.pushState()` to transition from `/chat` to `/chat/{threadId}` on first message. The Vercel chatbot reference has a `popstate` handler that calls `router.refresh()` on back/forward. Without it, pressing back can leave stale component state (old chat messages visible at the wrong URL).

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`

**Step 1: Add the import and hook**

In `src/components/chat/chat-panel.tsx`:

1. Add `useEffect` to the React import (currently imports `useCallback, useMemo, useState`):

```typescript
import { useCallback, useEffect, useMemo, useState } from "react";
```

2. Add the `useRouter` import:

```typescript
import { useRouter } from "next/navigation";
```

3. Inside the `ChatPanel` component, before the existing `useAutoResume` call, add:

```typescript
  const router = useRouter();

  // Sync component state with URL on browser back/forward navigation.
  // Without this, pushState from draft → thread leaves stale state on back button.
  useEffect(() => {
    const handlePopState = () => {
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);
```

**Step 2: Run type check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No new type errors.

**Step 3: Manual verification**

1. Open `/chat`, send a message (URL changes to `/chat/{id}` via pushState).
2. Press browser back button.
3. Confirm the page refreshes cleanly to `/chat` instead of showing the old chat content at the draft URL.

**Step 4: Commit**

```bash
git add src/components/chat/chat-panel.tsx
git commit -m "fix(chat): add popstate handler for back/forward navigation sync"
```

---

## Execution Order

Tasks 1 and 2 both touch hot-path server code but different files. Task 3 touches `context.ts` (independent). Task 4 is client-only. All four are independent and can be done in any order.

Recommended: **1 → 2 → 3 → 4** (server perf first, then prompt, then client fix).

## Expected Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| Time to title appearance | 3-7s | 1-2s (title gen starts before agent setup) |
| Time to first stream token | 2-5s | 1-3s (Composio loads in parallel with CRM config) |
| System prompt cache hit rate | Low (skills in dynamic zone) | Higher (skills in static prefix) |
| Back-button navigation | Stale state possible | Clean refresh via popstate handler |

## Notes

- **Timing instrumentation** (`_t()` calls in `route.ts` and `run-agent.ts`) is kept for validation. Remove in a follow-up after before/after numbers are captured.
- **`markStaleRunsFailed`** stays inline in `runAgent()` — it must run before `createRun()` to clear stuck locks. Not safe to defer.
- **`resolveClientId` + CRM config mode** stays as two queries — combining would require duplicating the RPC-first fallback path.
