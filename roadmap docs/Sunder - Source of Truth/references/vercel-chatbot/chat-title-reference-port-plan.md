# Vercel Chatbot Chat Title Reference And Port Plan

Date: 2026-04-12

Reference repo:
- `vercel/chatbot`
- Remote: `https://github.com/vercel/chatbot`
- Local clone: `/Users/sethlim/Documents/chatbot`
- Pinned revision: `a047187bdce8a47ccf1debdfac0c411afe0f08e2`
- Commit subject: `2026-03-03 fix(ai): validate models server-side and fix reasoning detection (#1444)`

Sources used:
- Local source inspection of `vercel/chatbot`
- DeepWiki on `vercel/chatbot`
- Context7 AI SDK docs for `createUIMessageStream` custom data parts

## Recommendation

For first-turn thread naming, Sunder should follow the `vercel/chatbot` pattern as closely as possible.

The canonical pattern is:

1. Detect a brand-new chat on the server.
2. Insert the thread row immediately with a placeholder title.
3. Kick off title generation immediately from the first user message using a dedicated helper model and prompt.
4. Start the main response stream without waiting for title generation.
5. When the title promise resolves, write `data-chat-title` into the UI stream.
6. Persist the generated title to the database.
7. Let the client invalidate thread history when it sees `data-chat-title`.

This is infrastructure-owned behavior. It must not depend on the assistant deciding to call a rename tool.

## Canonical Reference Pattern

### 1. New thread detection and placeholder save

Reference file:
- `app/(chat)/api/chat/route.ts`

Reference behavior:
- Look up the chat by id.
- If it does not exist and the first message is a user message:
  - save the chat immediately with title `"New chat"`
  - start `titlePromise = generateTitleFromUserMessage({ message })`

Relevant reference lines:
- `app/(chat)/api/chat/route.ts:97-116`

Important pattern:
- The placeholder row is written before title generation finishes.
- Title generation begins immediately and asynchronously.

### 2. Dedicated helper for title generation

Reference files:
- `app/(chat)/actions.ts`
- `lib/ai/prompts.ts`
- `lib/ai/providers.ts`

Reference behavior:
- `generateTitleFromUserMessage` uses a dedicated title model, not the main chat model.
- It uses a dedicated title prompt with examples.
- It trims formatting noise from the model output.

Relevant reference lines:
- `app/(chat)/actions.ts:20-34`
- `lib/ai/prompts.ts:126-137`
- `lib/ai/providers.ts:45-50`

Important pattern:
- Title generation is small, cheap, and purpose-built.
- It is not part of the assistant’s reasoning loop.

### 3. Non-blocking stream emission

Reference file:
- `app/(chat)/api/chat/route.ts`

Reference behavior:
- Start the main `streamText(...)` response first.
- Merge that response into the UI stream.
- Then await `titlePromise`.
- When it resolves:
  - emit `data-chat-title`
  - persist title to the database

Relevant reference lines:
- `app/(chat)/api/chat/route.ts:153-196`

Important pattern:
- Title generation does not block the chat response from starting.
- The title update is a side-channel UI data part, not a normal assistant message.

### 4. Persist generated title separately from the message stream

Reference file:
- `lib/db/queries.ts`

Reference behavior:
- `updateChatTitleById({ chatId, title })` performs a dedicated database write.
- This write is independent from message persistence.

Relevant reference lines:
- `lib/db/queries.ts:518-528`

Important pattern:
- There is a dedicated, explicit title write path.
- The route does not rely on a tool call or client mutation to make the title durable.

### 5. Client reacts to `data-chat-title`

Reference files:
- `components/data-stream-handler.tsx`
- `lib/types.ts`

Reference behavior:
- The client listens for `data-chat-title`.
- On receipt, it invalidates or revalidates thread history.
- The event is modeled as a custom streamed UI data type.

Relevant reference lines:
- `components/data-stream-handler.tsx:25-30`
- `lib/types.ts:32-44`

Important pattern:
- The title update is handled as transient stream data.
- The sidebar refreshes from the database source of truth.

## Smallest Reference File Set To Study

These are the files to copy from or keep open side-by-side during implementation.

### Must-study reference files

1. `app/(chat)/api/chat/route.ts`
   - Core orchestration.
   - Shows `titlePromise` lifecycle.
   - Shows where `data-chat-title` is written.

2. `app/(chat)/actions.ts`
   - Title helper implementation.
   - Shows output cleanup logic.

3. `lib/ai/prompts.ts`
   - Title prompt wording and examples.

4. `lib/ai/providers.ts`
   - Dedicated title model selection.

5. `components/data-stream-handler.tsx`
   - Client-side handling for `data-chat-title`.

6. `lib/db/queries.ts`
   - Dedicated title persistence function.

7. `lib/types.ts`
   - Custom UI data typing for `"chat-title"`.

### Helpful but not essential reference files

1. `lib/db/schema.ts`
   - Understands the reference `chat.title` storage model.

2. `lib/ai/models.ts`
   - Confirms the title model is treated as a first-class dedicated model.

3. `lib/ai/models.mock.ts`
   - Useful if we want model-level tests for the helper pattern.

## Sunder Current State

Current Sunder files:
- `app/api/chat/route.ts`
- `src/lib/managed-agents/adapter.ts`
- `src/lib/ai/title.ts`
- `src/components/chat/data-stream-handler.tsx`
- `src/components/chat/chat-panel.tsx`
- `src/lib/managed-agents/tools/utility/rename-chat.ts`
- `src/lib/ai/platform-instructions.ts`
- `src/contexts/thread-context.tsx`

Current behavior:

1. `app/api/chat/route.ts` looks up `conversation_threads`.
2. If missing, it inserts the row with `title: null`.
3. It passes `threadTitle` into `runManagedAgent(...)`.
4. There is no deterministic first-turn title generation in this route.
5. There is no producer of `data-chat-title` in the managed-agents stream path.
6. The only explicit title mutation path is the `rename_chat` tool.
7. The UI falls back to `"New Chat"` when thread title is null.

Relevant Sunder lines:
- `app/api/chat/route.ts:187-232`
- `src/lib/managed-agents/adapter.ts:455-508`
- `src/lib/ai/title.ts:15-27`
- `src/components/chat/data-stream-handler.tsx:25-33`
- `src/lib/managed-agents/tools/utility/rename-chat.ts:42-75`
- `src/lib/ai/platform-instructions.ts:43-47`
- `src/contexts/thread-context.tsx:128-133`

## Unjustified Drift In Sunder Today

These are the drifts we should remove.

### 1. First-turn naming depends on agent behavior

Current Sunder uses `rename_chat` as the only real title writer on the main chat path.

That is not how `vercel/chatbot` works.

Reference behavior:
- first-turn naming is deterministic infrastructure behavior

Current Sunder behavior:
- first-turn naming is heuristic model behavior

This is the root architectural bug.

### 2. New browser threads are created with `title: null`

Current Sunder inserts `conversation_threads.title = null` for new chat threads in `app/api/chat/route.ts`.

Reference behavior:
- write a placeholder title immediately

This drift is not justified.

### 3. `data-chat-title` is consumed but not produced in the managed-agent path

Sunder already has:
- `ChatPanel.onData(...)`
- `DataStreamHandler`
- tests for `data-chat-title`

But the managed-agent stream path does not emit that data part.

Reference behavior:
- server writes `data-chat-title`
- client invalidates thread history

This drift is not justified.

### 4. Product instructions claim titles are auto-generated, but code does not guarantee it

`src/lib/ai/platform-instructions.ts` says:
- thread titles are usually auto-generated after the first user message

That statement matches the reference architecture, but not the current Sunder implementation.

This drift is not justified.

## Necessary Drift From The Reference

These drifts are real, but they are caused by architecture differences and are acceptable.

### 1. Stream writer location differs

In `vercel/chatbot`, the route itself owns `createUIMessageStream(...)`.

In Sunder, the route returns the stream from `runManagedAgent(...)`, and `createUIMessageStream(...)` lives in:
- `src/lib/managed-agents/adapter.ts`

Consequence:
- We cannot copy the reference route code 1:1.
- We should copy the pattern, but title emission belongs in the adapter where the `writer` exists.

This is the main justified drift.

### 2. Database shape differs

Reference:
- `chat` table
- keyed by `id`
- tied to `userId`

Sunder:
- `conversation_threads` table
- keyed by `thread_id`
- tenant-scoped by `client_id`

Consequence:
- Sunder must always filter title writes by both `thread_id` and `client_id`.

This drift is required for tenant isolation.

### 3. Query cache layer differs

Reference:
- SWR revalidation via `mutate(unstable_serialize(...))`

Sunder:
- TanStack Query invalidation via `queryClient.invalidateQueries(...)`

Consequence:
- Client behavior should stay the same, but implementation will remain TanStack-native.

This drift is required by existing frontend architecture.

### 4. Title model wiring differs

Reference:
- title model comes from `lib/ai/providers.ts`

Sunder:
- title model helper is in `src/lib/ai/title.ts`
- current product policy pins helper calls through `src/lib/ai/gateway.ts`

Consequence:
- The helper can remain in `src/lib/ai/title.ts`
- The pattern should still match the reference: dedicated model, dedicated prompt, dedicated cleanup

This drift is acceptable if product model routing should remain unchanged.

## Porting Strategy For Sunder

Default principle:
- copy the `vercel/chatbot` feature pattern exactly
- drift only where managed-agents architecture forces it

### Task 1. Start deterministic title generation on new thread creation

Goal:
- make the route own the decision to generate a first-turn title

Sunder files to touch:
- `app/api/chat/route.ts`
- `app/api/chat/__tests__/route.test.ts`

Reference files to copy from:
- `vercel/chatbot/app/(chat)/api/chat/route.ts`

Expected changes:
- detect `isNewThread`
- insert placeholder title instead of `null`
- create `titlePromise` from the first user text
- pass `titlePromise` and `isNewThread` into `runManagedAgent(...)`

Notes:
- The route should not wait for title generation before returning the stream.

### Task 2. Emit `data-chat-title` from the managed-agent stream wrapper

Goal:
- replicate the reference `writer.write({ type: "data-chat-title", data: title })` behavior

Sunder files to touch:
- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/__tests__/adapter.test.ts`

Reference files to copy from:
- `vercel/chatbot/app/(chat)/api/chat/route.ts`

Expected changes:
- after managed-agent streaming starts, await `titlePromise` if present
- write `data-chat-title` to the same UI stream writer
- persist the generated title to `conversation_threads`

Notes:
- This is where Sunder must drift from the exact file placement of the reference.
- The emitted data-part name should remain exactly `data-chat-title`.

### Task 3. Align the title helper with the reference helper

Goal:
- keep Sunder’s helper dedicated, cheap, and deterministic

Sunder files to touch:
- `src/lib/ai/title.ts`
- optional: `src/lib/ai/gateway.ts` if model routing changes are desired

Reference files to copy from:
- `vercel/chatbot/app/(chat)/actions.ts`
- `vercel/chatbot/lib/ai/prompts.ts`
- `vercel/chatbot/lib/ai/providers.ts`

Expected changes:
- keep helper isolated from chat-runner logic
- prefer copying the reference prompt wording and examples closely
- keep the same output cleanup pattern

Notes:
- If product policy requires `google/gemini-3-flash`, that is an acceptable drift.
- If cost and latency allow, adopting the reference title model choice is also reasonable.

### Task 4. Add a dedicated server-side title persistence path

Goal:
- make title persistence explicit and infrastructure-owned

Sunder files to touch:
- recommended: `src/lib/chat/threads.ts`
- or perform the update directly inside `src/lib/managed-agents/adapter.ts`

Reference files to copy from:
- `vercel/chatbot/lib/db/queries.ts`

Expected changes:
- create or reuse a narrow helper equivalent to `updateChatTitleById`
- write title using `thread_id` plus `client_id`
- do not route initial title generation through `rename_chat`

Notes:
- `rename_chat` should remain available for later explicit renames.
- It should not be the first-turn title mechanism.

### Task 5. Keep the existing client data-part handling and only extend tests if needed

Goal:
- preserve the current client-side path because it already matches the reference well

Sunder files to verify:
- `src/components/chat/data-stream-handler.tsx`
- `src/components/chat/data-stream-handler.test.tsx`
- `src/components/chat/chat-panel.tsx`
- `src/components/chat/chat-panel.test.tsx`
- `src/components/chat/message-bubble.test.tsx`

Reference files to copy from:
- `vercel/chatbot/components/data-stream-handler.tsx`
- `vercel/chatbot/lib/types.ts`

Expected changes:
- likely no production code changes needed here
- confirm existing tests still reflect the intended `data-chat-title` behavior

## Copy-Exact Recommendations

These should match the reference as closely as possible.

### Preserve exactly

1. A dedicated `titlePromise` started only for a new thread.
2. A dedicated title helper model and prompt.
3. Non-blocking title generation.
4. A custom streamed UI data part named `data-chat-title`.
5. A dedicated database write for the generated title.
6. Client invalidation of thread history on `data-chat-title`.

### Do not preserve

1. Reliance on the assistant to call `rename_chat` on first turn.
2. Null-only thread creation for the main browser chat path.
3. Any design where the client invents the title locally without a DB write.

## Testing Checklist For The Port

### Sunder tests to add or extend

1. `app/api/chat/__tests__/route.test.ts`
   - new thread creates placeholder title
   - new thread starts title generation
   - existing thread does not start title generation

2. `src/lib/managed-agents/__tests__/adapter.test.ts`
   - emits `data-chat-title` when `titlePromise` resolves
   - persists generated title to the database
   - does not emit title on follow-up turns
   - title generation failure does not fail the main chat stream

3. `src/components/chat/data-stream-handler.test.tsx`
   - keep existing invalidation behavior green

4. `src/components/chat/chat-panel.test.tsx`
   - keep existing `onData` storage behavior green

### Reference tests and docs to inspect if needed

Reference docs:
- DeepWiki: `vercel/chatbot` architecture and chat API pages
- AI SDK docs: `createUIMessageStream`, custom data parts, `onData`

Reference code:
- `vercel/chatbot/app/(chat)/api/chat/route.ts`
- `vercel/chatbot/app/(chat)/actions.ts`
- `vercel/chatbot/components/data-stream-handler.tsx`
- `vercel/chatbot/lib/db/queries.ts`
- `vercel/chatbot/lib/types.ts`

## Final Decision

Sunder should adopt the `vercel/chatbot` pattern for first-turn thread naming with minimal drift.

The only meaningful drift we should accept is this:
- in Sunder, the stream writer lives in `src/lib/managed-agents/adapter.ts`, so title emission must happen there instead of directly in the route

Everything else should converge toward the reference:
- deterministic first-turn title generation
- dedicated helper model and prompt
- explicit title persistence
- `data-chat-title` stream event
- client cache invalidation from that event

The current `rename_chat` tool should remain in the product, but only as a later override mechanism, not as the infrastructure path for the initial title.
