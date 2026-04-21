---
title: Redesign global search to an Attio-style split panel
type: feat
status: active
date: 2026-04-21
---

# Redesign global search to an Attio-style split panel

## Overview

Replace the current global command menu with a true global search panel that behaves like the Attio screenshots: a populated idle state, a ranked result list on the left, a live preview pane on the right, and an action footer that makes keyboard navigation legible.

This is not a small visual polish on `src/components/command-menu.tsx`. The current implementation was intentionally designed as a thin `cmdk` dialog with grouped results and no empty-state content. The new target changes both the interaction model and the data model.

The investigation also makes one boundary clear:

- **Twenty is useful for ranking strategy**, especially unified scoring across object types.
- **Twenty is not the recents model to copy.** Its empty search state is effectively "search everything with an empty query," not a per-user recent-record history.

## What We Learned

### Current Sunder behavior

The current global search is intentionally narrow:

- `src/components/command-menu.tsx` shows nothing until the user types at least 2 characters.
- Results are grouped by type and rendered as a flat list with only `title` + `subtitle`.
- Selecting an item immediately navigates away.
- There is no preview pane, no idle state, no keyboard footer, and no concept of recent records.

The backend is equally thin:

- `supabase/migrations/20260305010000_add_search_records_rpc.sql` runs four independent `ILIKE` queries.
- Each subquery is ordered by `updated_at DESC` and capped at `LIMIT 3`.
- Results are concatenated with `UNION ALL`.
- There is no unified score, no cross-type global ordering, and no company support.

### Twenty search behavior

Twenty's search backend is stronger than ours but still not Attio:

- The front end always sends a search request, including when the query is empty.
- The server first uses `tsvector` ranking, with `ILIKE` fallback only when tokenization fails.
- Global ordering is `ts_rank_cd DESC`, then `ts_rank DESC`, then object-type priority.
- Object-type tie-break priority is `person > company > opportunity > note > task`.
- Empty query returns all searchable records with zero ranks, which then collapse to object priority order rather than true recency.

Implication:

- If we copy Twenty literally, blank search will show a relevance-less object-priority dump.
- That does **not** match Attio's "recently useful things" feel.

### Attio target from screenshots

The target UI has four distinct properties:

1. **Populated idle state**
   Opening search already shows records before typing.
2. **Split panel layout**
   Left column is the result list. Right column is the focused record preview.
3. **Rich row metadata**
   Logos/avatars, type pills, secondary identifiers, and a visibly selected row.
4. **Actionable footer**
   Navigation hint on the left, actions button in the middle, primary "Open record" CTA on the right.

The right preview is not optional decoration. It is the core reason the panel feels useful before committing to navigation.

## Why The Current UI Is Problematic

The current UI fails at the exact jobs Attio solves well:

1. **Blank state is a dead end**
   Opening search shows an empty box because `useSearchRecords` is disabled below 2 chars and `CommandMenu` renders no idle content.

2. **Result quality is too shallow**
   We only expose `title` and `subtitle`, so the user cannot disambiguate records confidently. Attio gives enough context to decide before opening.

3. **Grouping beats ranking**
   Our results are rendered in hard sections (`Contacts`, `Deals`, `Tasks`, `Threads`) instead of a unified ranked list. That is worse for "find the thing I probably mean" workflows.

4. **No preview means high navigation cost**
   The user must open a record to inspect it. Attio lets the user verify the target in-panel.

5. **The data contract is wrong for the UI**
   Our RPC returns only 4 entity types and excludes companies, even though companies are a first-class CRM surface in the product.

6. **The shell itself is undersized for the target**
   `src/components/ui/command.tsx` constrains the interaction to a compact list dialog (`max-h-72`, single-column list assumptions), which is structurally incompatible with the desired split-panel search experience.

## Proposed Product Direction

Build a new `GlobalSearchPanel` with three explicit states:

### 1. Idle / Recent

Shown immediately on open.

- Left column shows recently viewed or recently opened records.
- Right column previews the currently highlighted record.
- No query required.

### 2. Search Results

Shown once the user types.

- Left column switches to a single ranked mixed-entity list.
- Right column updates as keyboard selection changes.
- `Enter` opens the selected record.

### 3. No Results / Error

Still preserve the split layout.

- Left column communicates no results or failure.
- Right column either preserves the last valid preview or shows an empty helper state.

## Ranking And Recency Plan

### Ranked search

Do **not** keep the current `UNION ALL + LIMIT 3 per type` approach.

We need a unified result set with:

- one cross-entity ranking model
- one overall `LIMIT`
- enough metadata to render list rows without extra round-trips

Preferred direction:

- add a new search RPC backed by Postgres full-text search and/or `pg_trgm`
- return one normalized row shape for `company | contact | deal | task | thread`
- include a `score` column and sort globally by `score DESC`
- use lightweight type-priority only as a tie-breaker, not as the main ranking strategy

### Recents

Do **not** infer recents from the ranked search endpoint.

We need an explicit recent-records source. There are two options:

1. **Correct option**
   Persist per-user record opens in a dedicated table and use that to drive idle search.
2. **Cheap fallback**
   Reuse `updated_at DESC` across CRM entities.

Recommendation: choose option 1. Attio's feel depends on user recency, not generic record freshness.

## Implementation Plan

### Phase 1: Replace the shell

- Introduce a dedicated `GlobalSearchPanel` component instead of forcing the existing `CommandDialog` API to carry a split layout.
- Keep the existing global open/close wiring in `src/components/layout/app-layout.tsx`.
- Preserve keyboard open/close behavior (`Cmd+K`, `Esc`) while changing the visual structure.

### Phase 2: Add richer entity coverage

- Expand global search to include `companies`.
- Keep `contacts`, `deals`, `tasks`, and `threads`.
- Confirm whether `notes` belong in v1. Default: no, unless there is strong product value.

### Phase 3: Replace backend search contract

- Add a new Supabase migration via Supabase MCP.
- Replace `search_records(query text)` with a richer RPC or add a new endpoint to avoid breaking existing code during rollout.
- Move from per-type caps to a unified scored result list.
- Return richer row metadata, for example:
  - `entity_type`
  - `record_id`
  - `title`
  - `secondary_text`
  - `tertiary_text`
  - `badge_label`
  - `avatar_url`
  - `score`

### Phase 4: Add preview data fetching

- On left-list highlight, fetch the selected record's preview payload.
- Keep the search result payload compact. Do not stuff the entire preview panel into the search RPC.
- Create typed preview queries per entity so the right pane can show:
  - company: domain, industry/tags, location, linked channels
  - contact: company, email, phone, recent interactions
  - deal: company, stage, amount, owners/contacts, next task
  - task: status, due date, linked deal/contact
  - thread: title, latest activity, linked CRM record if any

### Phase 5: Add persisted recents

- Add a per-user recent-records table.
- Write to it when the user opens a record from list pages, drawers, or search.
- Use this table to populate idle search.
- Order recents by `last_opened_at DESC`, deduplicated by `(user_id, entity_type, record_id)`.

### Phase 6: Polish interaction details

- Arrow keys change left-list selection and right preview in lockstep.
- `Enter` opens selected record.
- Add footer affordances similar to Attio:
  - navigation hint
  - actions affordance
  - primary open-record CTA
- Preserve focus in the input while selection changes.
- Remove the current hard 2-character gate; searching should begin as soon as typing starts.

## Acceptance Criteria

- [ ] Opening global search with an empty query shows useful recent records instead of a blank panel.
- [ ] Search results are shown in one ranked mixed-entity list rather than per-type groups.
- [ ] Companies are searchable alongside contacts, deals, tasks, and threads.
- [ ] Highlighting a result updates a live preview pane without navigating away.
- [ ] The preview pane renders meaningful entity-specific metadata for at least company, contact, and deal.
- [ ] Keyboard navigation is first-class: `Cmd+K`, arrows, `Enter`, `Esc`.
- [ ] The implementation uses a dedicated recent-record model rather than pretending blank search is "recents."

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Overloading one RPC with both search and preview concerns | High | Split compact search results from entity preview fetches. |
| Copying Twenty too literally and losing Attio's recents feel | High | Keep Twenty only for ranking inspiration, not empty-state behavior. |
| Scope creep into a full command palette/action system | Medium | Keep this project focused on record search and preview first. |
| Performance regressions from preview fetching on highlight | Medium | Debounce highlight-driven preview fetches and cache with TanStack Query. |
| Ambiguity around what counts as a "recent" record | Medium | Define recents as explicit per-user opens, not global `updated_at`. |

## Out of Scope

- Ask-AI behavior inside search
- Multi-step command execution or slash actions
- Browser-style search history syncing across devices beyond the app's own persisted recents
- Broad CRM search for agents/tooling (`search_crm`) unless it directly supports the user-facing UI

## Sources

- Current UI shell: `src/components/command-menu.tsx`
- Current command primitives: `src/components/ui/command.tsx`
- Current backend search RPC: `supabase/migrations/20260305010000_add_search_records_rpc.sql`
- Original CRM UX design: `docs/product/designs/2026-03-04-crm-ux-upgrade-design.md`
- Twenty front-end search hook: `/Users/sethlim/Documents/twenty/packages/twenty-front/src/modules/command-menu/hooks/useCommandMenuSearchRecords.tsx`
- Twenty search service: `/Users/sethlim/Documents/twenty/packages/twenty-server/src/engine/core-modules/search/services/search.service.ts`
- Twenty object priority ranking: `/Users/sethlim/Documents/twenty/packages/twenty-server/src/engine/core-modules/search/constants/standard-objects-by-priority-rank.ts`
