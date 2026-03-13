# json-render Inline Mode Migration — Handover

## Status

**Planned, not yet implemented.** Reference document complete; awaiting review before execution.

## Context

The agent's `show_view` tool (PR42a) is fundamentally broken: `z.unknown()` on the spec param gives Gemini Flash zero structural guidance, so the LLM fails to produce valid specs ~80% of the time. The manual `getViewCatalogPrompt()` duplicates what the library generates automatically and still isn't enough to compensate.

The fix is to migrate from our custom tool-call pattern to json-render's native **Inline Mode** — the documented, first-class way to produce UI specs. In inline mode the LLM writes spec JSONL inside ` ```spec ` fences as part of its normal text output; the library's stream transform handles the rest.

## Grounding

| Resource | Location |
|---|---|
| **Reference document (patterns + drift analysis)** | `roadmap docs/Sunder - Source of Truth/references/json-render/json-render-inline-mode-reference.md` |
| **Official json-render repo (cloned locally)** | `/Users/sethlim/Documents/json-render` |
| **Official reference app for inline mode** | `/Users/sethlim/Documents/json-render/examples/chat/` |
| **Sunder v2 plan** | `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` |

## Goal

**Zero drift from the official json-render inline mode patterns**, except for 3 justified divergences documented below.

## What Changes

### Server: 1 line

In `app/api/chat/route.ts`, wrap the stream with `pipeJsonRender()`:

```typescript
// Line ~293 — inside createUIMessageStream execute callback
// Before:
writer.merge(result.streamResult.toUIMessageStream());

// After:
import { pipeJsonRender } from "@json-render/core";
writer.merge(pipeJsonRender(result.streamResult.toUIMessageStream()));
```

That's it for the server. `pipeJsonRender` detects ` ```spec ` fences in the LLM output and converts JSONL patches into `SpecDataPart` chunks on the wire.

### Prompt: replace manual with catalog.prompt()

In `src/lib/ai/system-prompt.ts`, replace the hand-written `VIEW_GUIDANCE_PROMPT = getViewCatalogPrompt()` with:

```typescript
import { catalog } from "@/lib/views/catalog";

const VIEW_GUIDANCE_PROMPT = catalog.prompt({
  mode: "inline",
  customRules: [
    "Charts are snapshot-only. Use compact aggregated data, do not imply refresh or live dashboards.",
    "Keep the full UI spec under about 4KB.",
    "For repeated rows, prefer repeat + $item over one element per record.",
  ],
});
```

Delete `getViewCatalogPrompt()` from `src/lib/views/catalog.ts`. Also add `example` fields to each component definition in the catalog (the LLM uses these as few-shot examples).

Add workflow instructions to the system prompt telling the LLM when and how to emit ` ```spec ` fences:

```
WORKFLOW for data views:
1. Call CRM tools to gather the data.
2. Write a brief conversational summary.
3. Output the JSONL UI spec wrapped in a ```spec fence.
Emit /state patches BEFORE elements that reference them.
```

### Renderer: new file, replaces ViewCard

Create `src/lib/views/renderer.tsx` — copy the ExplorerRenderer pattern from the reference:

```typescript
"use client";
import { Renderer, StateProvider, VisibilityProvider, ActionProvider, type Spec, type ComponentRenderer } from "@json-render/react";
import { registry } from "./registry";

const fallback: ComponentRenderer = ({ element }) => (
  <div className="p-3 border border-dashed rounded-lg text-muted-foreground text-sm">
    Unknown component: {element.type}
  </div>
);

export function ViewRenderer({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  if (!spec) return null;
  return (
    <StateProvider initialState={spec.state ?? {}}>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer spec={spec} registry={registry} fallback={fallback} loading={loading} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
```

Key difference from our old `ViewCard`: state comes from `spec.state`, not a separate prop. No `handlers={{}}` on `ActionProvider`. Has `fallback` and `loading` props.

### Client: add useJsonRenderMessage to message rendering

In the chat message display component:

1. Import `useJsonRenderMessage` from `@json-render/react` and `SPEC_DATA_PART_TYPE` from `@json-render/core`
2. Call `const { spec, text, hasSpec } = useJsonRenderMessage(message.parts)`
3. Build ordered segments by iterating `message.parts` — detect `SPEC_DATA_PART_TYPE` to know where the view appears inline
4. Render `<ViewRenderer spec={spec} loading={isLast && isStreaming} />` at the segment position
5. Fallback: if `hasSpec` but no segment position found, render at end

The reference implementation for this is in `/Users/sethlim/Documents/json-render/examples/chat/app/page.tsx`, lines 127–279 (`MessageBubble` component).

### Cleanup: remove tool-call pattern

| File to Remove | Why |
|---|---|
| `src/lib/runner/tools/views/show-view.ts` | Tool replaced by inline mode |
| `src/lib/runner/tools/views/show-view.test.ts` | Tests for removed tool |
| `src/components/views/view-card.tsx` | Replaced by `ViewRenderer` |
| `src/components/views/view-card.test.tsx` | Tests for removed component |
| `src/components/chat/show-view-inline.tsx` | Lazy wrapper no longer needed |

Also remove the `show_view` special-casing in `src/components/chat/tool-call-inline.tsx` (lines ~67-72 that bypass pill UI for successful show_view results).

Unregister `show_view` from the runner's tool set.

## Justified Drift (3 Items Only)

These are the **only** places where Sunder intentionally diverges from the reference. If you find any other drift, flag it — it's a bug.

### 1. Agent orchestration: `runAgent()` stays

**Reference** uses `ToolLoopAgent` from `ai` SDK.
**Sunder** uses `runAgent()` — a custom orchestration loop with queue serialization, tenant isolation, message quotas, approval gates, Langfuse tracing, and 7-layer context assembly.

**We only change one thing:** wrapping its output stream with `pipeJsonRender()`. Everything else in `runAgent` is untouched.

### 2. Chat client: Sunder's hooks stay

**Reference** uses `useChat` + `DefaultChatTransport`.
**Sunder** has custom chat hooks handling threads, resumable streams (Redis), approval UI, and data-chat-title.

**We only add:** `useJsonRenderMessage` and segment-based rendering in the message display layer. The transport, hook, and thread management are unchanged.

### 3. CRM-specific components stay in catalog

**Reference** has generic data components (Metric, Table, BarChart, etc.).
**Sunder** has domain-specific CRM components (StatMetric, DealCard, ContactCard, TaskItem, chart panels).

These follow the exact same pattern (Zod schema + description + example in `defineCatalog`, React implementation in `defineRegistry`), just with CRM-specific props. No structural drift.

## Review Checklist

Use this to verify zero drift. For each item, compare Sunder's implementation against the reference file noted.

### Server route (`app/api/chat/route.ts`)
_Reference: `examples/chat/app/api/generate/route.ts`_

- [ ] `pipeJsonRender()` wraps `result.streamResult.toUIMessageStream()` inside `writer.merge()`
- [ ] Import is `import { pipeJsonRender } from "@json-render/core"`
- [ ] No other stream transformations between the LLM output and `pipeJsonRender`
- [ ] Everything else in the route (auth, threads, approvals, quota, Redis) is unchanged

### Catalog (`src/lib/views/catalog.ts`)
_Reference: `examples/chat/lib/render/catalog.ts`_

- [ ] Uses `defineCatalog(schema, { components, actions: {} })` — same as reference
- [ ] `schema` imported from `@json-render/react/schema`
- [ ] shadcn definitions imported from `@json-render/shadcn/catalog`
- [ ] Each custom component has: `props` (Zod), `description` (string), `example` (object)
- [ ] Nullable props use `.nullable()`, not `.optional()` — match reference convention
- [ ] Components with children use `slots: ["default"]`
- [ ] `getViewCatalogPrompt()` is **deleted** (replaced by `catalog.prompt()`)

### System prompt (`src/lib/ai/system-prompt.ts`)
_Reference: `examples/chat/lib/agent.ts`_

- [ ] Uses `catalog.prompt({ mode: "inline", customRules: [...] })` — not hand-rolled prompt text
- [ ] Includes workflow instructions telling the LLM to emit ` ```spec ` fences
- [ ] Includes data binding instructions: "emit /state patches BEFORE elements that reference them"
- [ ] `customRules` contains only Sunder-specific rules (chart snapshot limits, 4KB cap, repeat preference)
- [ ] No duplicate component listings — `catalog.prompt()` generates these automatically

### Renderer (`src/lib/views/renderer.tsx`)
_Reference: `examples/chat/lib/render/renderer.tsx`_

- [ ] Exact provider nesting: `StateProvider > VisibilityProvider > ActionProvider > Renderer`
- [ ] `StateProvider initialState={spec.state ?? {}}` — state from spec, not separate prop
- [ ] `ActionProvider` has **no** `handlers` prop
- [ ] Has `fallback` component renderer for unknown types
- [ ] Has `loading` prop passed to `Renderer`
- [ ] Returns `null` when `spec` is null
- [ ] Is a `"use client"` component

### Registry (`src/lib/views/registry.tsx`)
_Reference: `examples/chat/lib/render/registry.tsx`_

- [ ] Uses `defineRegistry(catalog, { components })` — returns `{ registry, handlers }`
- [ ] shadcn implementations imported from `@json-render/shadcn`
- [ ] Custom component renderers receive `({ props, children, bindings, emit })`
- [ ] Data props defensively coerced: `Array.isArray(data) ? data : []`

### Client message rendering
_Reference: `examples/chat/app/page.tsx` lines 127-279_

- [ ] `useJsonRenderMessage(message.parts)` returns `{ spec, text, hasSpec }`
- [ ] `SPEC_DATA_PART_TYPE` used to detect spec position in parts array
- [ ] Segments built by iterating `message.parts` — text, tools, and spec segments in order
- [ ] Spec rendered at detected position (not always at bottom)
- [ ] `loading={isLast && isStreaming}` passed to renderer
- [ ] Fallback: if `hasSpec && !specInserted`, render at end of message

### Cleanup
- [ ] `show_view` tool is unregistered from the runner
- [ ] `show-view.ts`, `show-view.test.ts` deleted
- [ ] `view-card.tsx`, `view-card.test.tsx` deleted
- [ ] `show-view-inline.tsx` deleted
- [ ] `tool-call-inline.tsx` no longer has show_view special-casing
- [ ] No references to `show_view` remain in codebase (grep for `show_view`, `show-view`, `ShowView`)

### Imports (verify no stale or wrong imports)
- [ ] `pipeJsonRender` from `@json-render/core` (not from somewhere else)
- [ ] `useJsonRenderMessage` from `@json-render/react`
- [ ] `SPEC_DATA_PART_TYPE` from `@json-render/core`
- [ ] `schema` from `@json-render/react/schema`
- [ ] No direct imports of `createJsonRenderTransform` (use `pipeJsonRender` wrapper instead)

## Files Summary

| File | Action | Lines Changed (est.) |
|---|---|---|
| `app/api/chat/route.ts` | Edit (1 line + 1 import) | ~3 |
| `src/lib/ai/system-prompt.ts` | Edit (replace VIEW_GUIDANCE_PROMPT) | ~15 |
| `src/lib/views/catalog.ts` | Edit (add examples, delete getViewCatalogPrompt) | ~40 |
| `src/lib/views/renderer.tsx` | **New file** | ~30 |
| `src/lib/views/registry.tsx` | Minor edit (verify pattern) | ~5 |
| Chat message display component | Edit (add useJsonRenderMessage + segments) | ~60 |
| `src/components/chat/tool-call-inline.tsx` | Edit (remove show_view special case) | -10 |
| `src/lib/runner/tools/views/show-view.ts` | **Delete** | -120 |
| `src/lib/runner/tools/views/show-view.test.ts` | **Delete** | -90 |
| `src/components/views/view-card.tsx` | **Delete** | -35 |
| `src/components/views/view-card.test.tsx` | **Delete** | -58 |
| `src/components/chat/show-view-inline.tsx` | **Delete** | -25 |

Net: ~150 lines added, ~340 removed.
