# Memory System — Claude Code Parity Implementation Plan

**PR:** Out-of-plan (quality improvement to completed PR 14: Memory system)
**Decisions:** MEM-03, MEM-04, MEM-05
**Goal:** Close the gap between Sunder's memory instructions and Claude Code's auto-memory system — 5 prompt/code fixes identified in the reference analysis.

**Architecture:** No infrastructure changes. This is a system prompt rewrite (`<memory-system>` section) + one small code change (truncation warning in the loader). The agent still writes memory inline during conversation via `read_file`/`write_file`. Storage layer (Supabase Storage) unchanged.

**Tech Stack:** TypeScript, Vitest

**Reference doc:** `roadmap docs/Sunder - Source of Truth/references/memory/claude-code-memory-system.md` — Part III (drifts) and Part VI (recommended prompt)

---

## Relevant Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/lib/ai/system-prompt.ts:97-121` | Rewrite `<memory-system>` section |
| Modify | `src/lib/memory/loader.ts:29-34` | Add truncation warning to `truncateToLineCount()` |
| Modify | `src/lib/memory/__tests__/loader.test.ts:50-64` | Update truncation test for warning message |
| Test | `src/lib/memory/__tests__/loader.test.ts` | Add new test for warning message content |
| Test | `src/lib/ai/__tests__/system-prompt.test.ts` | Snapshot or string-match test for new prompt content |

---

## Task 1: Add Truncation Warning to Memory Loader

The loader silently truncates MEMORY.md at 200 lines. Claude Code appends a warning so the agent knows content was cut and can take corrective action (moving content to topic files).

**Files:**
- Modify: `src/lib/memory/loader.ts:29-34`
- Test: `src/lib/memory/__tests__/loader.test.ts`

**Step 1: Write the failing test for truncation warning**

In `src/lib/memory/__tests__/loader.test.ts`, add a new test inside the existing `describe("loadMemoryContext")` block:

```typescript
it("appends a warning when MEMORY.md exceeds 200 lines", async () => {
  const longMemory = Array.from({ length: 220 }, (_, index) => `Line ${index + 1}`).join("\n");

  mock.mockDownload
    .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload(longMemory), error: null });

  const result = await loadMemoryContext(mock.client, CLIENT_ID);
  const lines = result.memory.split("\n");

  // First 200 lines preserved
  expect(lines[0]).toBe("Line 1");
  expect(lines[199]).toBe("Line 200");

  // Warning appended after the 200 lines
  expect(result.memory).toContain("WARNING");
  expect(result.memory).toContain("220 lines");
  expect(result.memory).toContain("200");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts --reporter=verbose
```

Expected: FAIL — the current `truncateToLineCount` does not append a warning.

**Step 3: Update the existing truncation test**

The existing test at line 50-64 expects exactly 200 lines. It will break when we add the warning (which adds extra lines). Update it:

```typescript
it("truncates MEMORY.md to the first 200 lines", async () => {
  const longMemory = Array.from({ length: 220 }, (_, index) => `Line ${index + 1}`).join("\n");

  mock.mockDownload
    .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
    .mockResolvedValueOnce({ data: createDownloadPayload(longMemory), error: null });

  const result = await loadMemoryContext(mock.client, CLIENT_ID);

  // Content starts with the first 200 lines
  expect(result.memory).toMatch(/^Line 1\n/);
  expect(result.memory).toContain("Line 200");
  // Does NOT contain line 201
  expect(result.memory).not.toContain("Line 201");
});
```

**Step 4: Implement the truncation warning**

In `src/lib/memory/loader.ts`, replace the `truncateToLineCount` function (lines 29-34):

```typescript
/**
 * Truncates content to maxLines. When content exceeds the cap, appends a
 * warning so the agent knows to move detail into topic files.
 *
 * Mirrors Claude Code's auto-memory truncation behavior.
 */
function truncateToLineCount(content: string, maxLines: number): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const truncated = lines.slice(0, maxLines).join("\n");
  return `${truncated}\n\n> WARNING: MEMORY.md is ${lines.length} lines (limit: ${maxLines}). Only the first ${maxLines} lines were loaded. Move detailed content to topic files and keep MEMORY.md concise.`;
}
```

**Step 5: Run all loader tests to verify they pass**

```bash
npx vitest run src/lib/memory/__tests__/loader.test.ts --reporter=verbose
```

Expected: ALL PASS (both the updated truncation test and the new warning test).

**Step 6: Commit**

```bash
git add src/lib/memory/loader.ts src/lib/memory/__tests__/loader.test.ts
git commit -m "feat(memory): add truncation warning when MEMORY.md exceeds 200 lines

Mirrors Claude Code's auto-memory pattern. When MEMORY.md is truncated,
the agent now sees a warning and can take corrective action by moving
detailed content to topic files.

Ref: claude-code-memory-system.md (Drift 6)"
```

---

## Task 2: Rewrite `<memory-system>` System Prompt Section

Replace the rigid auto-write rules with Claude Code's general guidance pattern. This is the main change — covers drifts 3, 4, 5, and 7 from the reference analysis.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:97-121`

**Step 1: Check if there are existing tests for the system prompt**

```bash
ls src/lib/ai/__tests__/
```

If `system-prompt.test.ts` exists, read it first. If not, we'll add one in Task 3.

**Step 2: Replace the `<memory-system>` section**

In `src/lib/ai/system-prompt.ts`, replace lines 97-121 (the entire `<memory-system>...</memory-system>` block) with:

```typescript
<memory-system>
You have a persistent memory system stored as files. These files are loaded into your context every run:
- SOUL.md — your personality and identity (read-only, do not attempt to modify)
- USER.md — user profile (read+write, update as you learn about the user)
- MEMORY.md — your working notebook (read+write, first 200 lines loaded each run)

You also have topic files under memory/ for organized long-term storage:
- memory/preferences.md — lasting user preferences and working style
- memory/growth-plan.md — skill-building roadmap
- memory/patterns.md — recurring behaviors with evidence dates
- memory/key-decisions.md — significant decisions with reasoning

Browse all topic files: read_file("memory/")
Create new topic files freely when an observation does not fit existing files.

## How to save memories
- Organize memory semantically by topic, not chronologically.
- Keep MEMORY.md concise as an index. Move detailed notes into topic files and leave pointers behind.
- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.
- Update or remove memories that turn out to be wrong or outdated.

## What to save
- Stable user preferences confirmed across multiple interactions (e.g., "always calls, never texts")
- Key decisions about deals, clients, or business approach — with reasoning
- Communication style, working patterns, and recurring workflows
- Solutions to recurring problems and useful shortcuts
- Important client relationships and deal context that persists across sessions

## What NOT to save
- Session-specific context (current task details, in-progress work, temporary state)
- Information already stored in the CRM database (contacts, deals, interactions, tasks)
- Speculative conclusions from a single interaction — wait for confirmation
- Anything that duplicates or contradicts SOUL.md or the system prompt
- Information that might be incomplete — verify before writing

## Explicit user requests
- When the user asks you to remember something across sessions (e.g., "remember that Mrs. Tan prefers morning viewings"), save it immediately — no need to wait for multiple interactions.
- When the user asks to forget or stop remembering something, find and remove the relevant entries from your memory files.
</memory-system>
```

**What changed and why (reference: `claude-code-memory-system.md` Part III):**

| Drift | Old | New | Source |
|-------|-----|-----|--------|
| Drift 3 (rigid rules) | `preferences.md — write immediately when...`, `patterns.md — write after 3+ instances` | General "How to save" guidance — organize by topic, keep MEMORY.md concise, no duplicates | Claude Code `Sf7()` |
| Drift 4 (no negative guidance) | One-line: `Do not save: session-specific context...` | Dedicated `## What NOT to save` section with 5 bullet points | Claude Code `Sf7()` |
| Drift 5 (no duplicate-check) | None | `Do not write duplicate memories. First check if there is an existing memory you can update` | Claude Code `Sf7()` |
| Drift 7 (no explicit requests) | None | `## Explicit user requests` section — "remember X" saves immediately, "forget X" removes entries | Claude Code `Sf7()` |
| Topic file rigidity | Listed only 4 files, no encouragement to create new ones | Added `Create new topic files freely when an observation does not fit existing files.` | Claude Code organic creation pattern |

**Step 3: Verify the prompt compiles**

```bash
npx tsc --noEmit src/lib/ai/system-prompt.ts
```

Expected: No errors (it's a template literal string, so syntax errors would show as TS errors).

**Step 4: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(memory): rewrite memory-system prompt to match Claude Code patterns

Replace rigid auto-write rules with general guidance: What to save, What
NOT to save, How to save, Explicit user requests. Encourage organic topic
file creation. Add duplicate-check instruction.

Closes drifts 3, 4, 5, 7 from claude-code-memory-system.md analysis."
```

---

## Task 3: Add System Prompt Smoke Test

Ensure the `<memory-system>` section contains the key patterns we just added. This prevents accidental regression.

**Files:**
- Create: `src/lib/ai/__tests__/system-prompt.test.ts`

**Step 1: Check if test file already exists**

```bash
ls src/lib/ai/__tests__/ 2>/dev/null || echo "No test dir yet"
```

If the directory doesn't exist, create it.

**Step 2: Write the test**

Create `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
/**
 * Smoke tests for system prompt content.
 *
 * These verify that key memory instructions are present in the prompt.
 * They guard against accidental removal of Claude Code parity patterns.
 *
 * @module lib/ai/__tests__/system-prompt
 */
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "../system-prompt";

describe("SYSTEM_PROMPT", () => {
  it("contains the memory-system section", () => {
    expect(SYSTEM_PROMPT).toContain("<memory-system>");
    expect(SYSTEM_PROMPT).toContain("</memory-system>");
  });

  it("lists all three root memory files", () => {
    expect(SYSTEM_PROMPT).toContain("SOUL.md");
    expect(SYSTEM_PROMPT).toContain("USER.md");
    expect(SYSTEM_PROMPT).toContain("MEMORY.md");
  });

  it("includes 'What to save' section", () => {
    expect(SYSTEM_PROMPT).toContain("## What to save");
    expect(SYSTEM_PROMPT).toContain("Stable user preferences");
  });

  it("includes 'What NOT to save' section", () => {
    expect(SYSTEM_PROMPT).toContain("## What NOT to save");
    expect(SYSTEM_PROMPT).toContain("Session-specific context");
    expect(SYSTEM_PROMPT).toContain("Information already stored in the CRM database");
  });

  it("includes duplicate-check instruction", () => {
    expect(SYSTEM_PROMPT).toContain("Do not write duplicate memories");
  });

  it("includes explicit user request handling", () => {
    expect(SYSTEM_PROMPT).toContain("## Explicit user requests");
    expect(SYSTEM_PROMPT).toContain("remember something across sessions");
    expect(SYSTEM_PROMPT).toContain("forget or stop remembering");
  });

  it("encourages organic topic file creation", () => {
    expect(SYSTEM_PROMPT).toContain("Create new topic files freely");
  });

  it("marks SOUL.md as read-only", () => {
    expect(SYSTEM_PROMPT).toContain("read-only, do not attempt to modify");
  });
});
```

**Step 3: Run the test**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

Expected: ALL PASS (if Task 2 was completed correctly).

**Step 4: Commit**

```bash
git add src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "test(memory): add smoke tests for memory-system prompt content

Guards against accidental removal of Claude Code parity patterns:
What to save, What NOT to save, duplicate-check, explicit user requests,
organic topic file creation."
```

---

## Task 4: Run Full Test Suite and Final Commit

**Step 1: Run all memory-related tests**

```bash
npx vitest run src/lib/memory/ --reporter=verbose
```

Expected: ALL PASS. The only change was to `loader.ts` (truncation warning) and the test file.

**Step 2: Run the system prompt tests**

```bash
npx vitest run src/lib/ai/__tests__/ --reporter=verbose
```

Expected: ALL PASS.

**Step 3: Run the runner context tests (regression check)**

The context assembly tests verify the 7-layer ordering. Our changes don't affect context assembly, but run them to be safe:

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 4: Run TypeScript compilation check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Final commit (if any uncommitted changes remain)**

```bash
git status
```

If there are uncommitted changes:

```bash
git add -A
git commit -m "chore(memory): claude code parity - final cleanup"
```

---

## Summary of Changes

| # | What | File | Drift Closed |
|---|------|------|------|
| 1 | Truncation warning | `src/lib/memory/loader.ts` | Drift 6 |
| 2 | Rewrite `<memory-system>` prompt | `src/lib/ai/system-prompt.ts` | Drifts 3, 4, 5, 7 |
| 3 | Smoke tests for prompt | `src/lib/ai/__tests__/system-prompt.test.ts` | Regression guard |
| 4 | Updated loader test | `src/lib/memory/__tests__/loader.test.ts` | Test parity |

**Not changed (justified drift — kept intentionally):**
- Three root files (SOUL/USER/MEMORY) — Sunder product requirement (Drift 1)
- Pre-seeded topic files — domain-appropriate for real estate CRM (Drift 2)
- Supabase Storage — multi-tenant SaaS constraint (Drift 8)
- SOUL.md read-only persona — brand consistency (Drift 9)
- No feature toggle — memory is core value prop (Drift 10)
