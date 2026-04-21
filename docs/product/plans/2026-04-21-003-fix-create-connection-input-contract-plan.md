---
title: "fix: Simplify create_connection input contract"
type: fix
status: active
date: 2026-04-21
origin: docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md
---

# fix: Simplify `create_connection` Input Contract

## Overview

`create_connection` is still failing the model's first attempt in repeated real traces even after the managed-agent version cleanup. The bug is now clearly the contract itself: the published schema only accepts `integrations: [{ integrationId: string }]`, while the model consistently reaches for simpler shapes like `integrations: ["notion"]` or `integrations: [{ provider: "notion" }]`.

This plan keeps the fix narrow and KISS:

- simplify the model-facing input contract
- tolerate the two common malformed shapes already seen in traces
- align the system skill and tool description with the actual accepted input

This directly supports the KISS connection-management requirement that a supported provider can be connected directly without catalog/discovery detours. (See origin: `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`, R2.)

## Problem Statement / Motivation

Three real managed-agent traces show the same failure pattern:

1. Thread `7354bbbf-c0eb-4ae5-83a6-dc716c8f924a`
   `create_connection` first receives `{"integrations":["notion"]}`, then `{"integrations":[{"provider":"notion"}]}`, both rejected by schema. The run ends without starting OAuth.
2. Thread `8a03c811-3f53-4709-8ba3-c4f05d5965ce`
   Same two malformed calls first. The model only recovers after detouring through `list_connections`, `reauthorize_connection`, and `delete_connection`, then finally calling `{"integrations":[{"integrationId":"notion"}]}`.
3. Thread `d0d314b2-96e9-4d3c-8c58-1d2ecb59061d`
   Same two malformed calls first. The model only succeeds after an extra `list_connections` step.

This is no longer a remote-version or stale-session issue:

- the runs are using current managed-agent behavior
- there is no `/agent/skills/system/...` read
- there is no retired `search_integrations` call
- the dispatcher is correctly rejecting invalid input

The root cause is that our guidance and schema disagree:

- `src/lib/runner/system-skills.ts` currently says to "call `create_connection` with the provider name inside the `integrations` array", which strongly implies `["notion"]`
- `src/lib/managed-agents/tools/browser-side/create-connection.ts` only accepts the nested object form with `integrationId`
- `toolsToActivate` is still present in the schema even though activation is out of scope for v1

The result is an avoidable schema fight before the actual OAuth flow begins.

## Proposed Solution

### Product Direction

Make `create_connection` accept the simplest model-facing shape for v1:

```json
{ "integrations": ["notion"] }
```

Keep the current output/result shape and chat card behavior unchanged. This is an input-contract fix, not a UX redesign.

### Technical Strategy

Use a tolerant input parser with a simple public contract:

1. **Primary accepted form:** `integrations: string[]`
   This matches the model's natural first guess and the current system-skill wording.
2. **Backward-compatible accepted forms:** continue accepting:
   - `[{ integrationId: "notion" }]`
   - `[{ provider: "notion" }]`
   - `[{ name: "notion" }]`
3. **Internal normalization:** convert every accepted form into one internal array of provider strings before running the existing connection logic.
4. **Remove activation-era noise from the public contract:** drop `toolsToActivate` from the published `create_connection` schema and examples. It is not used in the v1 KISS flow.
5. **Align all model-facing guidance:** update both the tool description and the system skill so the examples match the accepted shape exactly.

### Why This Approach

This is better than a docs-only tweak:

- we already have three traces showing the same schema failure
- the model's first guess is stable and predictable
- accepting the simple string-array shape removes unnecessary nesting from the v1 contract

This is also better than a larger redesign:

- no new tool
- no UI change
- no DB change
- no callback change
- no runner change

It is the smallest fix that makes the common case succeed on the first try.

## Technical Considerations

- **Keep the dispatcher strict.** Do not weaken global validation in `dispatcher.ts`. Fix this at the `create_connection` tool boundary so the rest of the tool system stays predictable.
- **Preserve existing output shape.** The connect card, callback flow, and post-OAuth behavior do not need to change.
- **Backward compatibility matters.** Older prompts, tests, or historical runs may still emit `{ integrationId: "..." }`, so the implementation should continue accepting that form.
- **`toolsToActivate` is dead weight in v1.** It is not used by current execution flow and keeps pulling the contract toward the old activation-era shape.
- **This should stay separate from the blocking `create_connection` plan.** The same-run blocking plan in `docs/product/plans/2026-04-20-001-feat-blocking-create-connection-plan.md` is a larger UX change. This bug fix should land independently first.
- **Republish all affected managed-agent models after the contract change.** Dev should validate on Haiku, but production selectors still expose Sonnet and Opus.

## Alternatives Considered

### 1. Docs only

Rejected. Three traces show the same malformed inputs even after version cleanup. Schema-only rejection is too brittle for a high-frequency launch flow.

### 2. Keep the nested object shape and only add coercion

Better than nothing, but still not the cleanest v1 contract. If the simplest real request is "connect Notion," the public shape should look like that request.

### 3. Add a second helper tool for provider lookup / schema discovery

Rejected. This would reintroduce the exact lifecycle complexity the KISS launch plan removed.

## Implementation Phases

### Phase 1: Simplify and Normalize the Tool Input

**Goal:** `create_connection` accepts the natural v1 request shape without retries.

- 1a. Update `src/lib/managed-agents/tools/browser-side/create-connection.ts` input parsing so `integrations` accepts:
  - `string`
  - `{ integrationId: string }`
  - `{ provider: string }`
  - `{ name: string }`
- 1b. Normalize each item into a single internal provider string before existing slug normalization and Supabase/Composio logic runs.
- 1c. Remove `toolsToActivate` from the published schema and implementation types.

### Phase 2: Align Model-Facing Guidance

**Goal:** The prompt, tool description, and examples all describe the same contract.

- 2a. Rewrite the `create_connection` tool description to show the exact preferred example:
  `{"integrations":["notion"]}`
- 2b. Update `src/lib/runner/system-skills.ts` so it no longer implies a shape different from the tool schema.
- 2c. Keep the existing no-jargon user-copy rule (`connect` / `sign in`, not `OAuth` / `authorize`).

### Phase 3: Tests

**Goal:** Lock the bug down with direct regression coverage.

- 3a. Update `src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts` to cover:
  - `{"integrations":["notion"]}` succeeds on first attempt
  - `{"integrations":[{"integrationId":"notion"}]}` still works
  - `{"integrations":[{"provider":"notion"}]}` is accepted
  - `{"integrations":[{"name":"notion"}]}` is accepted
- 3b. Remove or rewrite tests that still reference `toolsToActivate`.
- 3c. Update any UI tests that assert the old input shape if they inspect `create_connection` input payloads directly.

### Phase 4: Republish and Verify

**Goal:** Confirm the first tool call succeeds in real managed-agent traces.

- 4a. Republish the Anthropic managed-agent versions for the models that expose `create_connection`.
- 4b. Validate in dev with Haiku on a fresh thread:
  - prompt: "Connect my Notion so I can test it."
  - expected first tool call: `create_connection` with the accepted simple shape
  - no schema retry loop
- 4c. Spot-check one production-capable model config after republish to confirm the declaration rolled out correctly.

## Acceptance Criteria

- [ ] A fresh `create_connection` call succeeds when the model sends `{"integrations":["notion"]}`.
- [ ] The two malformed shapes observed in traces, `[{ provider: "notion" }]` and `[{ name: "notion" }]`, are accepted and normalized.
- [ ] The legacy object shape `[{ integrationId: "notion" }]` continues to work.
- [ ] `toolsToActivate` is removed from the public `create_connection` contract.
- [ ] The `create_connection` description and the system-skill guidance show the same canonical input example.
- [ ] On a fresh managed-agent trace, the connection flow reaches the connect card without first hitting `Invalid input for create_connection`.

## Success Metrics

- `create_connection` first-attempt success rate for direct provider prompts reaches effectively `100%` in local/dev verification.
- Real traces for "Connect my Notion" no longer show the two-step schema retry loop.
- No regression in duplicate-provider rejection, unsupported-provider rejection, or connect-card rendering.

## Dependencies & Risks

- **Republish required.** This fix changes the published tool schema/description, so local code changes alone are not enough.
- **Historical threads may still reuse old cached sessions.** Verification should use a fresh thread or a cleared cached `session_id`.
- **There is a small compatibility risk in removing `toolsToActivate`.** If any hidden caller still sends it, tolerant parsing should ignore unknown legacy fields rather than fail hard.

## Sources

### Origin

- `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`

### Trace Evidence

- Thread `7354bbbf-c0eb-4ae5-83a6-dc716c8f924a` — repeated invalid `create_connection` input before failure
- Thread `8a03c811-3f53-4709-8ba3-c4f05d5965ce` — repeated invalid `create_connection` input before eventual recovery
- Thread `d0d314b2-96e9-4d3c-8c58-1d2ecb59061d` — repeated invalid `create_connection` input before eventual recovery

### Relevant Code

- `src/lib/managed-agents/tools/browser-side/create-connection.ts`
- `src/lib/runner/system-skills.ts`
- `src/lib/managed-agents/dispatcher.ts`
- `scripts/managed-agents/create-agent.ts`
- `src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts`
- `src/components/chat/tool-call-inline.test.tsx`
