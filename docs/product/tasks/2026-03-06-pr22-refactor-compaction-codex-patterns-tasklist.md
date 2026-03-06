# Compaction Refactor to Codex Patterns Implementation Plan

**PR:** PR 22 (refactor): Context recovery + thread compaction  
**Decisions:** SESSION-07, DATA-10, RUNNER-03  
**Date:** 2026-03-06

## Approved Scope

This tasklist was narrowed after architectural review on **March 6, 2026**.

We are adopting the Codex compaction patterns that fit Sunder's existing architecture:

1. Add Codex's `SUMMARIZATION_PROMPT` and `SUMMARY_PREFIX`.
2. Detect prefixed summaries with `isSummaryMessage()`.
3. Use `COMPACTION_MODEL` plus `SUMMARIZATION_PROMPT + CRM_COMPACTION_INSTRUCTIONS`.
4. Persist summaries **with** `SUMMARY_PREFIX`.
5. Strip `SUMMARY_PREFIX` before feeding an existing summary back into the summarizer.
6. Keep Sunder's approved context assembly order:
   `platform -> system -> SOUL -> USER -> MEMORY -> compaction summary -> recent messages -> current message`
7. Remove the Anthropic native compaction path so Sunder has one explicit compaction strategy.

## Explicitly Deferred

These are intentionally **out of scope** for this PR:

1. Reordering context to match Codex's "summary as last conversation message" pattern. This conflicts with approved Sunder context ordering (`RUNNER-03` / PR15).
2. "True retained-user-message compaction" that reconstructs older verbatim user messages alongside the summary. Useful, but it requires additional persisted state or extra pre-boundary queries and is not a minimal refactor.
3. Token-triggered compaction. Keep the current message-count trigger for now.
4. User-facing compaction warnings.
5. Iterative trim / retry-on-overflow behavior during compaction.

## Why This Scope

Codex replaces in-memory history with a compacted history object. Sunder does not. Sunder persists a thread-level summary in Postgres and assembles context in fixed layers. That means we should port the **handoff framing** and **summary-generation behavior**, but not blindly port Codex's history-replacement semantics.

## TDD Rule

Follow strict red-green-refactor:

1. Write a failing test.
2. Run the targeted test and verify the expected failure.
3. Write the smallest production change that makes it pass.
4. Re-run the targeted test.
5. Only then move to the next slice.

## Task 1: Add Codex prompt + summary prefix primitives

**Files**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Tests to add first

Add failing tests for:

1. `SUMMARIZATION_PROMPT` contains the Codex checkpoint-compaction framing.
2. `SUMMARY_PREFIX` contains the Codex handoff framing.
3. `isSummaryMessage()` returns `true` only for strings beginning with `${SUMMARY_PREFIX}\n`.

### Production changes

Add to `compaction.ts`:

1. `SUMMARIZATION_PROMPT`
2. `SUMMARY_PREFIX`
3. `isSummaryMessage(message: string): boolean`

## Task 2: Use COMPACTION_MODEL and combined prompt

**Files**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Tests to add first

Update / add failing tests asserting:

1. `generateCompactionSummary()` uses `COMPACTION_MODEL`, not `TIER_1_MODEL`.
2. The `system` prompt passed to `generateText()` includes both:
   - `SUMMARIZATION_PROMPT`
   - `CRM_COMPACTION_INSTRUCTIONS`
3. The empty-input fast path returns `COMPACTION_MODEL`.

### Production changes

1. Import `COMPACTION_MODEL` from `src/lib/ai/gateway.ts`.
2. Update `generateCompactionSummary()` to call:
   - `gateway(COMPACTION_MODEL)`
   - `system: \`${SUMMARIZATION_PROMPT}\n\n${CRM_COMPACTION_INSTRUCTIONS}\``
3. Remove the now-unused `TIER_1_MODEL` import from `compaction.ts` if no longer needed.

## Task 3: Prefix summaries at rest and strip before re-summarization

**Files**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Tests to add first

Add failing tests for:

1. `maybeCompactThread()` persists `${SUMMARY_PREFIX}\n${rawSummary}` into `compaction_summary`.
2. A prior prefixed summary is stripped before inclusion in the next summarization prompt.
3. `isSummaryMessage()` recognizes persisted summaries created by the compaction flow.

### Production changes

Add small helpers in `compaction.ts`:

1. `addSummaryPrefix(summaryText: string): string`
2. `stripSummaryPrefix(summaryText: string): string`

Use them so that:

1. `generateCompactionSummary()` receives the stripped prior summary.
2. `persistThreadCompactionState()` receives the prefixed new summary.

## Task 4: Keep Sunder context ordering unchanged

**Files**
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/context.ts` only if needed

### Tests to add first

Add or update tests asserting:

1. The compaction summary still appears in the system string as the compaction-summary layer.
2. A prefixed persisted summary is injected without double-prefixing or re-wrapping.
3. Recent thread messages still appear after the compaction-summary layer.

### Production changes

Expected minimal change:

1. Keep the existing compaction-summary layer in `buildSystemPrompt()`.
2. Do **not** move the summary into conversation messages.
3. Only adjust handling if the prefixed summary exposes a formatting bug.

## Task 5: Remove Anthropic native compaction path

**Files**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/runner/run-autopilot.ts` only if needed by shared helper behavior

### Tests to add first

Add / update failing tests asserting:

1. `buildPrepareStep()` no longer injects Anthropic `contextManagement` edits.
2. `buildPrepareStep()` only disables tools at the final step cutoff.

### Production changes

1. Remove `isAnthropicModel()`.
2. Remove the Anthropic `providerOptions.contextManagement` branch from `buildPrepareStep()`.
3. Remove any now-unused imports such as `CRM_COMPACTION_INSTRUCTIONS` from `run-agent.ts`.

## Task 6: Verify the reduced-scope refactor

Run at minimum:

```bash
npx vitest run src/lib/runner/__tests__/compaction.test.ts
npx vitest run src/lib/runner/__tests__/context.test.ts
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

If those pass, run:

```bash
npx vitest run src/lib/runner/__tests__/
```

## Relevant Files

### Modify
- `src/lib/runner/compaction.ts`
- `src/lib/runner/__tests__/compaction.test.ts`
- `src/lib/runner/context.ts`
- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/runner/run-agent.ts`
- `src/lib/runner/__tests__/run-agent.test.ts`

### Reference
- `roadmap docs/Sunder - Source of Truth/references/compacting/04-codex-compaction-patterns-analysis.md`
- `/Users/sethlim/Documents/codex/codex-rs/core/src/compact.rs`
- `/Users/sethlim/Documents/codex/codex-rs/core/templates/compact/prompt.md`
- `/Users/sethlim/Documents/codex/codex-rs/core/templates/compact/summary_prefix.md`
- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`

## Final Deliverable

This PR should leave Sunder with:

1. Better compaction summaries framed as explicit handoffs.
2. Safer repeated compaction because stored summaries are stripped before re-summarization.
3. A cheaper dedicated compaction model.
4. No duplicate Anthropic-native compaction path.
5. No change to Sunder's approved context assembly order.
