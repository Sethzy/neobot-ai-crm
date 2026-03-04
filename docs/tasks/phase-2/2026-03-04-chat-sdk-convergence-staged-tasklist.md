# Chat SDK Convergence: Staged TDD Implementation Plan

**Goal:** Move from current web-only chat flow to a Chat SDK-aligned architecture in safe stages, starting with Dorabot-lite UX (Option 1) and ending at server-authoritative lazy thread creation (Option 2) that is ready for Telegram/WhatsApp adapters.

**Status:** Planning/handoff document for execution by another developer.

**Primary references:**
- `https://chat-sdk.dev/docs/architecture`
- `https://chat-sdk.dev/docs/migration-guides/message-parts`
- `https://github.com/vercel/ai-chatbot/blob/main/app/(chat)/page.tsx`
- `https://github.com/vercel/ai-chatbot/blob/main/components/chat.tsx`
- `https://github.com/vercel/ai-chatbot/blob/main/app/(chat)/api/chat/route.ts`

**Current repo baseline (already completed):**
- Server-rendered thread page with server-loaded `initialMessages`
- Route-level ownership checks for thread page and `/api/chat`
- Runner server persistence on user + assistant messages
- URL-driven active thread highlight in sidebar

---

## Non-Negotiable TDD Rules

For every behavior change:

1. Write a failing test first.
2. Run only targeted tests and confirm expected failure reason.
3. Implement minimum code to pass.
4. Re-run targeted tests.
5. Refactor only after green.
6. Run focused suite + `npx tsc --noEmit`.

No production behavior changes before red.

---

## Stage Map

1. Stage A: Option 1 UX and launcher simplification (quick win)
2. Stage B: API contract hardening toward Chat SDK transport shape
3. Stage C: True Option 2 (server-lazy create on first message)
4. Stage D: Multi-channel foundation (Telegram/WhatsApp-ready core)
5. Stage E: Cleanup and decision-doc alignment

---

## Stage A — Option 1 UX (Dorabot-lite) [PR-A1 to PR-A3]

### PR-A1: `/chat` as draft surface (no redirect spinner)

**Objective:** Replace launcher redirect behavior with a real draft chat surface.

**RED**
- Update `app/(dashboard)/chat/page.test.tsx`:
  - expect draft UI render (prompt + composer + suggestions)
  - expect no redirect to latest thread

**GREEN**
- Modify `app/(dashboard)/chat/page.tsx` to render draft UI directly.
- Keep this stage client-side and minimal.

**REFACTOR**
- Extract draft suggestion constants if repeated.

**VERIFY**
- `npx vitest run app/(dashboard)/chat/page.test.tsx`

---

### PR-A2: Remove explicit Sessions “New Chat” button

**Objective:** Chat nav is the new-draft entry; Sessions lists only real threads.

**RED**
- Update:
  - `src/components/layout/app-sidebar.test.tsx`
  - `src/components/layout/app-sidebar-thread-actions.test.tsx`
- Add assertions:
  - no `New Chat` button in Sessions section
  - thread navigation/archive behavior unchanged

**GREEN**
- Remove `New Chat` button path and `isCreatingThread` local state from `src/components/layout/app-sidebar.tsx`.

**REFACTOR**
- Remove dead imports (`Plus`, unused callbacks).

**VERIFY**
- `npx vitest run src/components/layout/app-sidebar.test.tsx src/components/layout/app-sidebar-thread-actions.test.tsx`

---

### PR-A3: First-submit handoff from draft to thread route

**Objective:** From `/chat` draft, first submit creates thread, navigates to `/chat/{id}`, and sends the first message exactly once.

**RED**
- Extend tests in:
  - `app/(dashboard)/chat/page.test.tsx`
  - `src/components/chat/chat-panel.test.tsx` (or add `chat-thread-page-client` tests)
- Cases:
  - create thread on submit
  - initial message handoff sends once only
  - failure path unlocks retry (no stuck pending state)

**GREEN**
- Implement handoff via `sessionStorage` or equivalent one-shot bridge:
  - store first message keyed by thread id at draft submit
  - consume once in thread client layer
  - clear key immediately after consumption

**REFACTOR**
- Consolidate handoff key helpers to avoid string duplication.

**VERIFY**
- `npx vitest run app/(dashboard)/chat/page.test.tsx src/components/chat/chat-panel.test.tsx app/(dashboard)/chat/[threadId]/page.test.tsx`

---

## Stage B — Chat SDK Transport Shape [PR-B1]

### PR-B1: Align send payload shaping with Chat SDK pattern

**Objective:** Keep `id` in client requests and use explicit request shaping similar to `prepareSendMessagesRequest`.

**RED**
- Extend `src/components/chat/chat-panel.test.tsx`:
  - normal turn sends latest user message payload
  - continuation/tool-approval style sends `messages` payload

**GREEN**
- Update transport config in `src/components/chat/chat-panel.tsx` to shape body explicitly.
- Preserve current `/api/chat` compatibility.

**REFACTOR**
- Isolate payload shaping logic in pure helper function for direct tests.

**VERIFY**
- `npx vitest run src/components/chat/chat-panel.test.tsx src/lib/ai/__tests__/chat-route.test.ts`

---

## Stage C — True Option 2 (Server-Lazy Thread Create) [PR-C1 to PR-C3]

### PR-C1: `/api/chat` supports “id not yet persisted” lazy create

**Objective:** Server creates thread if incoming `id` does not exist for client.

**RED**
- Extend `src/lib/ai/__tests__/chat-route.test.ts`:
  - valid `id` not found -> server creates thread -> proceeds
  - invalid id -> still `400`
  - existing id -> no extra create call

**GREEN**
- Update `app/api/chat/route.ts`:
  - on missing thread, create thread server-side (for same client)
  - preserve ownership and archived checks

**REFACTOR**
- Extract route-level thread resolution helper:
  - `resolveOrCreateThreadForChatRequest(...)`

**VERIFY**
- `npx vitest run src/lib/ai/__tests__/chat-route.test.ts src/lib/runner/__tests__/run-agent.test.ts`

---

### PR-C2: Return canonical thread id metadata from `/api/chat`

**Objective:** Let clients reconcile URL/state when server creates canonical thread.

**RED**
- Extend `src/lib/ai/__tests__/chat-route.test.ts`:
  - response includes canonical thread id metadata for both created/existing paths

**GREEN**
- Include canonical thread id in response metadata (header-first approach for minimal diff).
- Document chosen key (example: `x-thread-id`).

**REFACTOR**
- Centralize response creation helper to avoid metadata drift.

**VERIFY**
- `npx vitest run src/lib/ai/__tests__/chat-route.test.ts`

---

### PR-C3: Client reconciles URL with canonical thread id

**Objective:** If current path is draft or mismatched id, client updates URL once canonical id is known.

**RED**
- Add tests (chat panel or route client wrapper):
  - after first send, URL becomes `/chat/{canonicalThreadId}`
  - no duplicate navigation
  - no stream interruption

**GREEN**
- Read canonical thread id metadata from API response and call `router.replace` when needed.

**REFACTOR**
- Keep URL reconciliation in one utility function.

**VERIFY**
- `npx vitest run src/components/chat/chat-panel.test.tsx app/(dashboard)/chat/[threadId]/page.test.tsx`

---

## Stage D — Multi-Channel Foundation [PR-D1 to PR-D2]

### PR-D1: Shared inbound orchestration service

**Objective:** Web route and future channel adapters call one shared server function.

**RED**
- Add tests for new service module:
  - accepts channel + external conversation id + message text
  - resolves thread mapping
  - runs/queues via runner consistently

**GREEN**
- Introduce service (example path): `src/lib/chat/process-inbound-message.ts`
- Refactor `app/api/chat/route.ts` to thin adapter over the service.

**REFACTOR**
- Remove duplicated validation between route and service where appropriate.

**VERIFY**
- `npx vitest run src/lib/chat/__tests__/process-inbound-message.test.ts src/lib/ai/__tests__/chat-route.test.ts`

---

### PR-D2: Channel mapping + idempotency

**Objective:** Prevent duplicate thread/message creation on Telegram/WhatsApp webhook retries.

**RED**
- Add tests for:
  - duplicate delivery idempotency
  - same external conversation maps to same thread
  - conflicting mappings are rejected safely

**GREEN**
- Add schema + data access for mapping table (migration required):
  - `channel`
  - `external_conversation_id`
  - `thread_id`
  - `client_id`
  - unique constraints and indexes
- Add idempotency key checks in inbound service.

**REFACTOR**
- Extract idempotency utilities and mapping queries.

**VERIFY**
- targeted mapping/inbound tests + `npx tsc --noEmit`

---

## Stage E — Cleanup + Architecture Decision Updates [PR-E1]

### PR-E1: Remove obsolete state paths and update source-of-truth docs

**Objective:** Eliminate transitional complexity and keep docs consistent with implemented behavior.

**RED**
- Add/adjust tests proving URL is single source for active session state.

**GREEN**
- Remove now-obsolete `activeThreadId/selectThread` navigation coupling from `src/contexts/thread-context.tsx` if no longer required by runtime.
- Update source-of-truth docs for:
  - “thread creation timing”
  - “chat entry behavior”
  - “multi-channel thread mapping”

**REFACTOR**
- Remove dead code and unused test fixtures.

**VERIFY**
- focused chat/sidebar/context tests + typecheck

---

## Execution Commands (per PR)

Use only focused tests for red/green loops, then run a wider focused suite:

```bash
npx vitest run \
  app/(dashboard)/chat/page.test.tsx \
  app/(dashboard)/chat/[threadId]/page.test.tsx \
  src/components/chat/chat-panel.test.tsx \
  src/components/layout/app-sidebar.test.tsx \
  src/components/layout/app-sidebar-thread-actions.test.tsx \
  src/lib/ai/__tests__/chat-route.test.ts \
  src/lib/runner/__tests__/run-agent.test.ts \
  src/contexts/thread-context.test.tsx

npx tsc --noEmit
```

---

## Risk Controls

1. Keep streaming contract stable until PR-C2 introduces explicit metadata.
2. Feature-flag PR-C2/C3 URL reconciliation if rollout risk is high.
3. Keep migrations isolated and reversible in PR-D2.
4. Do not mix route UX changes and API contract changes in the same PR.

---

## Done Criteria

1. `/chat` is a real draft surface (no redirect spinner).
2. No explicit Sessions “New Chat” button.
3. First message from draft creates/uses canonical thread and streams reliably.
4. `/api/chat` is server-authoritative for thread existence/creation.
5. URL reconciles to canonical thread id without duplicate send.
6. Shared inbound path exists for future Telegram/WhatsApp adapters.
7. Idempotency + channel mapping prevent duplicate retries.
8. Architecture docs reflect final behavior.
