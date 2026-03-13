# json-render Inline Mode Migration — TDD Tasklist

**Handover:** `docs/product/handovers/json-render-inline-mode-handover.md`
**Branch:** `feat/json-render-inline-mode`
**Approach:** TDD — write failing tests first, then implement to green, then refactor.

---

## Phase 1: Catalog — Add examples + prompt generation

### 1a. Test: each custom component has an `example` field
- [x] Write test in `src/lib/views/catalog.test.ts`
- [x] Assert every component in the catalog has a non-empty `example` object
- [x] Run → RED

### 1b. Implement: add `example` fields to all 14 components
- [x] Add `example` to each component definition in `catalog.ts`
- [x] Use reference patterns: StatMetric example, Table with `$state` binding, chart with data array, etc.
- [x] Run → GREEN

### 1c. Test: `catalog.prompt({ mode: "inline" })` returns valid prompt
- [x] Assert `catalog.prompt({ mode: "inline" })` returns a string containing component names
- [x] Assert it does NOT throw
- [x] Run → GREEN (catalog.prompt already exists in library)

### 1d. Cleanup: delete `getViewCatalogPrompt()`
- [x] Remove the function from `catalog.ts`
- [x] Remove its test coverage if any exists in `catalog.test.ts`
- [x] Verify no other imports reference it (grep)

---

## Phase 2: Renderer — New file with provider stack

### 2a. Test: `ViewRenderer` renders spec with correct provider nesting
- [x] Write test in `src/lib/views/renderer.test.tsx`
- [x] Assert `StateProvider > VisibilityProvider > ActionProvider > Renderer` nesting
- [x] Assert `StateProvider` receives `spec.state`
- [x] Assert `Renderer` receives `registry`, `fallback`, `loading` props
- [x] Run → RED

### 2b. Test: `ViewRenderer` returns null when spec is null
- [x] Assert `render(<ViewRenderer spec={null} />)` produces no output
- [x] Run → RED

### 2c. Implement: create `src/lib/views/renderer.tsx`
- [x] Copy pattern from reference `ExplorerRenderer`
- [x] `"use client"`, import providers from `@json-render/react`
- [x] `fallback` component for unknown types
- [x] `loading` prop passed through
- [x] Run → GREEN

---

## Phase 3: System prompt — Replace hand-rolled with `catalog.prompt()`

### 3a. Test: system prompt contains inline mode instructions
- [x] Write/update test in system prompt test file
- [x] Assert output contains `` ```spec `` fence instruction
- [x] Assert output contains `/state` patch ordering instruction
- [x] Assert output does NOT contain old `getViewCatalogPrompt()` text patterns
- [x] Run → RED

### 3b. Implement: replace `VIEW_GUIDANCE_PROMPT`
- [x] Replace `getViewCatalogPrompt()` call with `catalog.prompt({ mode: "inline", customRules: [...] })`
- [x] Add workflow instructions (3-step: gather data → summarize → emit spec fence)
- [x] Add `/state` ordering instruction
- [x] Run → GREEN

---

## Phase 4: Server route — Wrap stream with `pipeJsonRender()`

### 4a. Implement: one-line change in `app/api/chat/route.ts`
- [x] `import { pipeJsonRender } from "@json-render/core"`
- [x] Change line ~293: `writer.merge(pipeJsonRender(result.streamResult.toUIMessageStream()))`
- [x] No other stream transforms between LLM output and `pipeJsonRender`

> Note: Route is hard to unit test in isolation. Verified via integration / manual QA.

---

## Phase 5: Client — Segment-based message rendering

### 5a. Test: segment builder correctly handles spec data parts
- [x] Write test in `src/components/chat/message-bubble.test.tsx`
- [x] Given parts array with text + SPEC_DATA_PART_TYPE + text, assert 3 segments in order: text, spec, text
- [x] Given parts with no spec, assert no spec segment
- [x] Given parts with spec but no detected position, assert fallback (spec at end)
- [x] Run → RED

### 5b. Test: ViewRenderer receives correct props
- [x] Assert `loading={true}` when `isLast && isStreaming`
- [x] Assert `loading={false}` otherwise
- [x] Run → RED

### 5c. Implement: update `message-bubble.tsx`
- [x] Import `useJsonRenderMessage` from `@json-render/react`
- [x] Import `SPEC_DATA_PART_TYPE` from `@json-render/core`
- [x] Import `ViewRenderer` from `@/lib/views/renderer`
- [x] Replace current show_view-specific rendering with segment builder loop
- [x] Build ordered segments: text / tools / spec
- [x] Render `<ViewRenderer spec={spec} loading={isLast && isStreaming} />` at segment position
- [x] Fallback: if `hasSpec && !specInserted`, render at end
- [x] Run → GREEN

---

## Phase 6: Cleanup — Remove tool-call pattern

### 6a. Test: no references to show_view remain
- [x] Grep for `show_view`, `show-view`, `ShowView`, `show_view` across codebase
- [x] Assert zero matches (excluding this tasklist and handover doc)

### 6b. Delete files
- [x] `src/lib/runner/tools/views/show-view.ts`
- [x] `src/lib/runner/tools/views/show-view.test.ts`
- [x] `src/lib/runner/tools/views/index.ts` (barrel export)
- [x] `src/components/views/view-card.tsx`
- [x] `src/components/views/view-card.test.tsx`
- [x] `src/components/chat/show-view-inline.tsx`

### 6c. Remove show_view special-casing
- [x] `tool-call-inline.tsx`: remove `isRenderableShowViewOutput()` helper (lines 37-58) and show_view bypass (lines 67-73)
- [x] Remove `ShowViewInline` import

### 6d. Unregister from runner
- [x] Remove `show_view` from the runner's tool set (find where `createViewTools()` is called)
- [x] Remove/update `createViewTools` import

### 6e. Verify build
- [x] `pnpm tsc --noEmit` passes
- [x] `pnpm test` passes (no broken imports)
- [x] No stale references remain

---

## Phase 7: Final verification

- [x] All tests green
- [x] TypeScript compiles clean
- [x] Grep confirms zero show_view references
- [ ] Manual smoke: LLM emits `` ```spec `` fences, spec renders inline in chat
