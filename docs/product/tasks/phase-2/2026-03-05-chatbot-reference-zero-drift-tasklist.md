# Chat Convergence Tasklist (Strict Reference Parity)

Objective: converge Sunder chat to Vercel official chatbot patterns with minimal drift.
Reference repo: `/Users/sethlim/Documents/chatbot`

## Parity Rules (Non-Negotiable)

1. Mirror the reference request/stream shape exactly where possible:
- `prepareSendMessagesRequest`
- `createUIMessageStream` + `createUIMessageStreamResponse`
- `data-chat-title` stream part
- `/api/chat/[id]/stream` resume endpoint
- `useAutoResume` behavior

2. Allowed Sunder-specific deltas (must remain explicit):
- Keep TanStack Query (no SWR migration).
- Keep runner ownership of message persistence (`runAgent` still persists user/assistant and handles queue drain).
- Keep model routing internal (do not add user model selection to UI in this PR series).
- Keep route group `app/(dashboard)` instead of `app/(chat)`.

3. No hidden drift: every deviation from reference must be documented in PR description.

---

## PR1 — Transport + API Body Contract Parity

Goal: match reference client request shaping (`message` vs `messages`) and route parsing via schema.

### Files
- Create: `app/api/chat/schema.ts`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `app/api/chat/route.ts`
- Modify: `src/components/chat/chat-panel.test.tsx`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

### Required changes
1. Add request schema in `app/api/chat/schema.ts` mirroring reference structure:
- `id: uuid`
- `message?: user UIMessage`
- `messages?: UIMessage[]` (permissive for continuation/tool approval)

2. In `ChatPanel`, configure `DefaultChatTransport` with `prepareSendMessagesRequest`:
- Normal send: `{ id, message: lastMessage }`
- Continuation/tool-approval send: `{ id, messages }`

3. In `/api/chat`, parse body with schema (remove loose manual parsing branches).

4. Resolve input only from `message` (single) or latest user in `messages`.

### Red/Green
- Red: tests fail for missing `prepareSendMessagesRequest` + schema path.
- Green: targeted tests pass.

### Commit
`feat(chat): align transport payload and route schema with reference chatbot`

---

## PR2 — Stream Wrapper Parity (`createUIMessageStream`)

Goal: replace direct `toUIMessageStreamResponse()` return with reference wrapper pattern.

### Files
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

### Required changes
1. Import `createUIMessageStream` and `createUIMessageStreamResponse` from `ai`.

2. Wrap runner stream:
- `const stream = createUIMessageStream({ ... })`
- `execute({ writer }) { writer.merge(result.streamResult.toUIMessageStream()) }`
- `return createUIMessageStreamResponse({ stream })`

3. Set `originalMessages` when request uses `messages` continuation flow.

4. Keep queue behavior unchanged:
- if runner returns queued, return `202 { status: "queued" }`.

### Red/Green
- Red: stream wrapper assertions fail.
- Green: route tests pass.

### Commit
`feat(chat): wrap runner output in createUIMessageStream response`

---

## PR3 — Lazy Thread Creation in API (Reference Pattern)

Goal: move thread creation to first POST when thread id does not exist.

### Files
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

### Required changes
1. If thread not found:
- create only when `message.role === "user"`
- otherwise return 404

2. Insert into `conversation_threads` with `{ thread_id, client_id, title: null }`.

3. Continue into `runAgent` after successful lazy create.

### Red/Green
- Add tests for:
- missing thread + user message => creates and streams
- missing thread + non-user continuation => 404
- insert error => 500

### Commit
`feat(chat): add server-authoritative lazy thread creation`

---

## PR4 — `/chat` and URL Transition Parity

Goal: remove sessionStorage handoff and follow reference URL transition timing.

### Files
- Modify: `app/(dashboard)/chat/page.tsx`
- Create: `app/(dashboard)/chat/chat-draft-page.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx`
- Delete: `src/lib/chat/initial-message-handoff.ts`
- Modify tests for all above

### Required changes
1. Convert `/chat` page to server component that generates draft chat id (UUID) and renders `ChatPanel` directly (no eager DB create).

2. Make page dynamic (reference uses `cookies()`; equivalent dynamic signal is acceptable).

3. In `ChatPanel`, on submit path:
- if current pathname is `/chat`, call `window.history.pushState({}, "", `/chat/${chatId}`)` **before** `sendMessage`.
- Do not defer URL replacement to `onFinish`.

4. Remove `initialMessage` handoff logic and all `sessionStorage` bridge code.

### Red/Green
- Tests cover:
- no eager createThread
- no handoff key usage
- URL changes before send on draft route

### Commit
`feat(chat): convert /chat to draft chat panel and remove message handoff`

---

## PR5 — Server-Side Title Generation via Data Stream

Goal: match reference `data-chat-title` pattern.

### Files
- Create: `src/lib/ai/title.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `src/components/chat/chat-panel.tsx` (or handler if PR6)
- Delete: `src/lib/chat/thread-title.ts`
- Update tests

### Required changes
1. Add `generateTitleFromUserMessage` using `generateText` + gateway tier model.

2. On new-thread path in `/api/chat`, start `titlePromise` before stream execution.

3. In `createUIMessageStream.execute`:
- merge model stream first
- await title promise
- write `data-chat-title`
- persist title update in `conversation_threads`

4. Remove client-side truncation auto-name flow.

### Commit
`feat(chat): generate titles server-side and stream data-chat-title`

---

## PR6 — DataStream Provider/Handler Parity

Goal: mirror reference `onData -> DataStreamProvider -> DataStreamHandler` structure.

### Files
- Create: `src/components/chat/data-stream-provider.tsx`
- Create: `src/components/chat/data-stream-handler.tsx`
- Create: `src/hooks/use-auto-resume.ts`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/chat/page.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Update tests

### Required changes
1. Add provider in dashboard chat layout tree.

2. `ChatPanel.onData` appends incoming data parts to provider queue.

3. `DataStreamHandler` consumes deltas and handles at minimum:
- `data-chat-title` => invalidate TanStack Query thread list keys

4. Implement `useAutoResume` pattern:
- if `autoResume` and last initial message is user, call `resumeStream()` once.

### Commit
`feat(chat): add data stream provider/handler and reference-style auto-resume`

---

## PR7 — Resume Endpoint Parity

Goal: provide reconnect endpoint expected by SDK transport.

### Files
- Create: `app/api/chat/[id]/stream/route.ts`
- Add/Update tests if present

### Required changes
1. Add `GET` handler returning `204` (reference baseline).

### Commit
`feat(chat): add /api/chat/[id]/stream endpoint for stream resumption`

---

## PR8 — Cleanup and Full Verification

### Required checks
1. `npx tsc --noEmit`
2. `npx vitest run`
3. Ensure dead paths removed:
- `initial-message-handoff`
- client auto-name hook usage
- direct `toUIMessageStreamResponse()` return in route

### Commit
`chore(chat): clean up convergence and verify types/tests`

---

## Acceptance Checklist (Must Pass)

1. `/chat` opens directly into a draft chat panel with fresh UUID and no DB write.
2. First submit updates URL to `/chat/{id}` immediately and begins stream.
3. If thread does not exist, `/api/chat` lazily creates it on first user message.
4. API response is wrapped with `createUIMessageStreamResponse`.
5. New-thread title appears from server via `data-chat-title`, then thread list refreshes.
6. Existing thread route can call `resumeStream` safely; `/api/chat/[id]/stream` exists.
7. No sessionStorage handoff remains.
8. All tests and typecheck pass.

## Reference Anchors

- `/Users/sethlim/Documents/chatbot/app/(chat)/api/chat/route.ts`
- `/Users/sethlim/Documents/chatbot/app/(chat)/api/chat/schema.ts`
- `/Users/sethlim/Documents/chatbot/components/chat.tsx`
- `/Users/sethlim/Documents/chatbot/hooks/use-auto-resume.ts`
- `/Users/sethlim/Documents/chatbot/components/data-stream-provider.tsx`
- `/Users/sethlim/Documents/chatbot/components/data-stream-handler.tsx`
- `/Users/sethlim/Documents/chatbot/app/(chat)/page.tsx`
- `/Users/sethlim/Documents/chatbot/app/(chat)/chat/[id]/page.tsx`
- `/Users/sethlim/Documents/chatbot/app/(chat)/api/chat/[id]/stream/route.ts`
