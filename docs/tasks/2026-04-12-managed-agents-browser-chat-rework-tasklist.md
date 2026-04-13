# Managed Agents Browser Chat Rework Implementation Plan

**Goal:** Rework browser chat so it uses one streaming `POST /api/chat` request backed by `runManagedAgent()`, and delete the browser-only `send`/`stream` split transport.

**Architecture:** Keep Sunder's shared managed-agents runtime as the single source of truth: `runManagedAgent()` -> `consumeAnthropicSession()`. Add one browser-facing streaming route that reuses that runtime, then switch `ChatPanel` back to the boring `useChat` request model and remove `SessionChatTransport`, `POST /api/chat/send`, and `GET /api/chat/stream`.

**Tech Stack:** Next.js 15 App Router route handlers, React 19, `@ai-sdk/react` `useChat`, AI SDK streaming response helpers, Anthropic Managed Agents via `@anthropic-ai/sdk`, Supabase, Vitest.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Orientation

Read these first. Do not skip them.

- Design doc reference:
  - [managed-agents-official-reference-and-sunder-drift.md](/Users/sethlim/Documents/sunder-next-migration-20260225/roadmap%20docs/Sunder%20-%20Source%20of%20Truth/references/claude/managed-agents-official-reference-and-sunder-drift.md)
- Core runtime:
  - [src/lib/managed-agents/adapter.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/managed-agents/adapter.ts)
  - [src/lib/managed-agents/session-runner.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/managed-agents/session-runner.ts)
  - [src/lib/managed-agents/session-kickoff.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/managed-agents/session-kickoff.ts)
  - [src/lib/chat/extract-user-input.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/chat/extract-user-input.ts)
- Current browser drift:
  - [app/api/chat/send/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/chat/send/route.ts)
  - [app/api/chat/stream/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/chat/stream/route.ts)
  - [src/components/chat/session-chat-transport.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/chat/session-chat-transport.ts)
  - [src/components/chat/chat-panel.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/chat/chat-panel.tsx)
- Existing tests to reuse:
  - [src/lib/managed-agents/__tests__/adapter.test.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/managed-agents/__tests__/adapter.test.ts)
  - [app/api/chat/send/__tests__/route.test.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/chat/send/__tests__/route.test.ts)
  - [app/api/chat/stream/__tests__/route.test.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/chat/stream/__tests__/route.test.ts)

Official references to keep open while implementing:

- https://platform.claude.com/docs/en/managed-agents/overview
- https://platform.claude.com/docs/en/managed-agents/quickstart
- https://platform.claude.com/docs/en/api/beta/sessions/events
- `/Users/sethlim/Documents/managed_agents/utilities.py`
- `/Users/sethlim/Documents/managed_agents/CMA_iterate_fix_failing_tests.ipynb`
- `/Users/sethlim/Documents/managed_agents/CMA_gate_human_in_the_loop.ipynb`
- `/Users/sethlim/Documents/managed_agents/slack_data_bot.ipynb`

Relevant skills if you need them:

- `@nextjs-best-practices`
- `@vercel-react-best-practices`

## Relevant Files

**Create:**

- `app/api/chat/route.ts`
- `app/api/chat/__tests__/route.test.ts`

**Modify:**

- `src/components/chat/chat-panel.tsx`
- `src/lib/chat/extract-user-input.ts`
- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/__tests__/adapter.test.ts`
- `src/components/chat/chat-panel.test.tsx`

**Delete:**

- `app/api/chat/send/route.ts`
- `app/api/chat/stream/route.ts`
- `src/components/chat/session-chat-transport.ts`
- `app/api/chat/send/__tests__/route.test.ts`
- `app/api/chat/stream/__tests__/route.test.ts`
- `src/components/chat/__tests__/session-chat-transport.test.ts`
- `src/components/chat/session-chat-transport.test.ts`

## Task Structure

### Task 1: Add the unified streaming browser chat route

**Files:**
- Create: `app/api/chat/route.ts`
- Create: `app/api/chat/__tests__/route.test.ts`
- Modify: `src/lib/chat/extract-user-input.ts`
- Reference: `src/lib/managed-agents/adapter.ts`
- Reference: `app/api/chat/send/route.ts`

**Why:** This is the architectural pivot. Browser chat needs one route that owns the whole turn and returns a streaming response from `runManagedAgent()`.

**Step 1: Write the failing route contract test for a normal user message**

Create `app/api/chat/__tests__/route.test.ts` with the smallest green-path test first:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateRequest,
  resolveClientId,
  checkRateLimit,
  runManagedAgent,
  getAnthropicClient,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveClientId: vi.fn(),
  checkRateLimit: vi.fn(),
  runManagedAgent: vi.fn(),
  getAnthropicClient: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/managed-agents/adapter", () => ({ runManagedAgent }));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({ getAnthropicClient }));

import { POST } from "../route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({
      kind: "ok",
      userId: "u1",
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { thread_id: "t1", title: "Thread 1" },
                    error: null,
                  }),
                }),
                maybeSingle: async () => ({
                  data: { thread_id: "t1", title: "Thread 1" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
    });
    resolveClientId.mockResolvedValue("c1");
    checkRateLimit.mockResolvedValue({ allowed: true });
    getAnthropicClient.mockReturnValue({});
    runManagedAgent.mockResolvedValue(new ReadableStream());
  });

  it("delegates a normal user message to runManagedAgent", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "c1",
        threadId: "t1",
        input: "hello",
      }),
    );
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `FAIL` because `app/api/chat/route.ts` does not exist yet.

**Step 3: Implement the minimal route**

Create `app/api/chat/route.ts` as a thin wrapper over `runManagedAgent()`.

Start with this shape:

```ts
/**
 * Browser chat route for Managed Agents.
 * Streams one turn directly from `runManagedAgent()`.
 *
 * @module app/api/chat/route
 */
import { createUIMessageStreamResponse } from "ai";
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { extractUserInput } from "@/lib/chat/extract-user-input";
import { allowedModelIds, DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { runManagedAgent } from "@/lib/managed-agents/adapter";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  id: z.string().min(1),
  messages: z.array(
    z.object({
      id: z.string().optional(),
      role: z.string(),
      parts: z.array(z.unknown()).optional(),
    }),
  ).min(1),
  selectedChatModel: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request body.", 400);

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;

  const { allowed, retryAfter } = await checkRateLimit(`chat:${auth.userId}`, 30, 60);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please wait before sending more messages." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter ?? 60),
        },
      },
    );
  }

  const clientId = await resolveClientId(auth.supabase, auth.userId);
  const selectedChatModel = parsed.data.selectedChatModel ?? DEFAULT_CHAT_MODEL;
  if (!allowedModelIds.has(selectedChatModel)) {
    return jsonError("Invalid selected chat model.", 400);
  }

  const lastMessage = parsed.data.messages[parsed.data.messages.length - 1];
  const { text, fileParts } = extractUserInput({ parts: lastMessage.parts ?? [] });
  if (!text && fileParts.length === 0) {
    return jsonError("Message must contain text or files.", 400);
  }

  const anthropic = getAnthropicClient();
  const stream = await runManagedAgent({
    anthropic,
    supabase: auth.supabase,
    clientId,
    threadId: parsed.data.id,
    input: text ?? "",
    fileParts,
    userMessageSourceId: lastMessage.id,
    clientProfile: null,
    userPreferences: null,
    threadTitle: null,
    selectedChatModel,
  });

  return createUIMessageStreamResponse({ stream: stream as never });
}
```

Do not overbuild this on the first pass. Just get the test green and stream via `runManagedAgent()`.

**Step 4: Run the route test again**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `PASS`.

**Step 5: Add failing tests for invalid body, invalid model, and empty message**

Add three tests:

```ts
it("returns 400 for invalid body", async () => {});
it("returns 400 for invalid selected chat model", async () => {});
it("returns 400 when the last message has no text or files", async () => {});
```

**Step 6: Run only the new failing tests**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts -t "returns 400"
```

Expected: at least one failure because the route shape is still incomplete.

**Step 7: Implement the minimal validation to pass**

Do not add abstractions. Keep validation in `route.ts`.

**Step 8: Run the full route test file**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `PASS`.

**Step 9: Commit**

```bash
git add app/api/chat/route.ts app/api/chat/__tests__/route.test.ts src/lib/chat/extract-user-input.ts
git commit -m "feat(chat): add unified managed-agents browser route"
```

### Task 2: Load client context and match the old chat behavior

**Files:**
- Modify: `app/api/chat/route.ts`
- Test: `app/api/chat/__tests__/route.test.ts`
- Reference: `app/api/chat/send/route.ts`
- Reference: `src/lib/managed-agents/session-kickoff.ts`

**Why:** The first green route above will stream, but it will not yet preserve all the old behavior around thread lookup, title reuse, or client profile/preferences.

**Step 1: Write the failing test for thread lookup + context loading**

Add a test asserting the route passes client context and thread title into `runManagedAgent()`:

```ts
it("loads thread and client context before calling runManagedAgent", async () => {
  // mock conversation_threads and clients lookups
  // assert runManagedAgent got threadTitle/clientProfile/userPreferences
});
```

Expected assertion:

```ts
expect(runManagedAgent).toHaveBeenCalledWith(
  expect.objectContaining({
    threadTitle: "Thread 1",
    clientProfile: "profile",
    userPreferences: "prefs",
  }),
);
```

**Step 2: Run the failing test**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts -t "loads thread and client context"
```

Expected: `FAIL`.

**Step 3: Implement the minimal thread/context loading**

In `app/api/chat/route.ts`:

- read `conversation_threads` for `thread_id`, `title`
- insert the thread row if missing
- load `clients.client_profile`, `clients.user_preferences`
- pass `threadTitle`, `clientProfile`, `userPreferences` into `runManagedAgent()`

Copy the boring query shape from `app/api/chat/send/route.ts`. Do not invent a new thread bootstrap abstraction.

**Step 4: Run the route tests**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `PASS`.

**Step 5: Commit**

```bash
git add app/api/chat/route.ts app/api/chat/__tests__/route.test.ts
git commit -m "feat(chat): load thread and client context in unified route"
```

### Task 3: Support approval continuations on the unified route

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/chat/__tests__/route.test.ts`
- Reference: `src/components/chat/session-chat-transport.ts`
- Reference: `app/api/tool-confirm/route.ts`
- Reference: `src/lib/managed-agents/adapter.ts`

**Why:** The browser currently routes approval responses through custom transport logic. Once the transport is deleted, the route must recognize approval-continuation messages itself.

**Step 1: Write the failing approval-continuation test**

Add a test that mirrors the existing trailing-message approval logic:

```ts
it("routes approval responses to resumeManagedAgentFromApproval", async () => {
  // messages end with a tool-invocation part having approval response state
});
```

Mock:

```ts
vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent,
  resumeManagedAgentFromApproval,
}));
```

Expected assertion:

```ts
expect(resumeManagedAgentFromApproval).toHaveBeenCalledWith(
  expect.objectContaining({
    approvalId: "toolu_123",
    approved: true,
  }),
);
expect(runManagedAgent).not.toHaveBeenCalled();
```

**Step 2: Run the failing approval test**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts -t "approval responses"
```

Expected: `FAIL`.

**Step 3: Implement the minimal approval extraction**

In `app/api/chat/route.ts`, copy the logic conceptually from `extractApprovalFromMessages()` in the deleted transport:

- inspect only the last two messages
- find trailing `tool-invocation` part with `state === "approval-responded"` or `state === "output-denied"`
- map it to:
  - `approvalId`
  - `approved`
  - optional `denyMessage`
- call `resumeManagedAgentFromApproval()`

When `resumeManagedAgentFromApproval()` returns `streaming`, return that stream.

When it returns `missing` or `error`, map that to a JSON error response.

**Step 4: Run the route tests**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `PASS`.

**Step 5: Commit**

```bash
git add app/api/chat/route.ts app/api/chat/__tests__/route.test.ts
git commit -m "feat(chat): support approval continuations on unified route"
```

### Task 4: Switch the browser UI back to the boring `useChat` path

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/chat/chat-panel.test.tsx`
- Delete later: `src/components/chat/session-chat-transport.ts`

**Why:** Once the server route exists, the custom transport should stop owning chat behavior.

**Step 1: Write the failing UI wiring test**

Add a test in `src/components/chat/chat-panel.test.tsx` that asserts `useChat` is called without `SessionChatTransport` and uses the default `/api/chat` path.

Sketch:

```ts
it("uses the default useChat transport after the rework", () => {
  // render ChatPanel
  // assert useChat got no custom SessionChatTransport instance
});
```

If the current test setup mocks `useChat`, assert:

```ts
expect(useChat).toHaveBeenCalledWith(
  expect.objectContaining({
    id: "thread-1",
    transport: undefined,
  }),
);
```

If the test harness makes that assertion awkward, assert the inverse:

```ts
expect(SessionChatTransport).not.toHaveBeenCalled();
```

**Step 2: Run the failing UI test**

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx
```

Expected: `FAIL`.

**Step 3: Implement the minimal `ChatPanel` cleanup**

In `src/components/chat/chat-panel.tsx`:

- remove the `SessionChatTransport` import
- remove the memoized transport creation
- remove the transport cleanup effect
- remove `setSelectedChatModel()` calls on the transport
- keep `useChat` with:
  - `id`
  - `messages`
  - `generateId`
  - `experimental_throttle`
  - `sendAutomaticallyWhen`
  - `onData`
  - `onFinish`
  - `onError`
- if AI SDK expects a custom request body for `selectedChatModel`, use the supported `body` option on `useChat` instead of a custom transport

Minimal target:

```ts
const { messages, sendMessage, status, error, setMessages, addToolApprovalResponse } = useChat({
  id: chatId,
  messages: initialMessages,
  body: { selectedChatModel },
  generateId: () => crypto.randomUUID(),
  experimental_throttle: STREAM_UI_THROTTLE_MS,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  onData: ...,
  onFinish: ...,
  onError: ...,
});
```

Do not reintroduce transport logic elsewhere.

**Step 4: Run the component tests**

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx
```

Expected: `PASS`.

**Step 5: Commit**

```bash
git add src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx
git commit -m "refactor(chat): remove custom browser transport from chat panel"
```

### Task 5: Harden the adapter tests around the route we are now using in browser chat

**Files:**
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Reference: `src/lib/managed-agents/adapter.ts`

**Why:** Browser chat is now directly using `runManagedAgent()`. Its tests need to explicitly cover the browser-facing contract, not just Telegram reuse.

**Step 1: Add a failing test for first-turn file uploads on new sessions**

Add:

```ts
it("uploads files and passes them as initialResources when creating a new session", async () => {
  // mock uploadFilePartsToAnthropic to return one file
  // expect createSessionForThread to receive initialResources
});
```

Expected assertion:

```ts
expect(createSessionForThread).toHaveBeenCalledWith(
  expect.objectContaining({
    initialResources: [
      expect.objectContaining({
        type: "file",
        file_id: "file_1",
      }),
    ],
  }),
);
```

**Step 2: Run the focused failing adapter test**

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts -t "initialResources"
```

Expected: `FAIL` if the assertion is wrong or coverage is missing.

**Step 3: Add a failing test for approval resume stream passthrough**

Add:

```ts
it("returns a stream from resumeManagedAgentFromApproval without completing the run early", async () => {
  // cover the browser approval-resume contract explicitly
});
```

**Step 4: Run the focused adapter tests**

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts -t "approval"
```

Expected: initial failures.

**Step 5: Adjust only the tests or minimal implementation if needed**

If `adapter.ts` already behaves correctly, fix only the test expectations. Do not rewrite working runtime code for test convenience.

**Step 6: Run the full adapter test file**

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: `PASS`.

**Step 7: Commit**

```bash
git add src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/adapter.ts
git commit -m "test(chat): harden adapter coverage for browser route reuse"
```

### Task 6: Delete the split transport and legacy routes

**Files:**
- Delete: `app/api/chat/send/route.ts`
- Delete: `app/api/chat/stream/route.ts`
- Delete: `src/components/chat/session-chat-transport.ts`
- Delete: `app/api/chat/send/__tests__/route.test.ts`
- Delete: `app/api/chat/stream/__tests__/route.test.ts`
- Delete: `src/components/chat/__tests__/session-chat-transport.test.ts`
- Delete: `src/components/chat/session-chat-transport.test.ts`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `app/api/tool-confirm/route.ts` if imports/comments still mention the split transport

**Why:** This is the actual simplification. Do not leave dead architecture around.

**Step 1: Write one failing smoke test that proves the legacy imports are gone**

Add or update a `chat-panel` test so it fails if `SessionChatTransport` is still imported.

Minimal pattern:

```ts
it("does not reference SessionChatTransport anywhere in ChatPanel", async () => {
  const moduleText = await import("node:fs/promises").then((fs) =>
    fs.readFile("src/components/chat/chat-panel.tsx", "utf8"),
  );
  expect(moduleText).not.toContain("SessionChatTransport");
});
```

If this feels too ugly, skip the file-content test and rely on TypeScript compile failures after deletion. Do not overengineer deletion tests.

**Step 2: Delete the transport file and legacy route files**

Run:

```bash
rm app/api/chat/send/route.ts
rm app/api/chat/stream/route.ts
rm src/components/chat/session-chat-transport.ts
rm app/api/chat/send/__tests__/route.test.ts
rm app/api/chat/stream/__tests__/route.test.ts
rm src/components/chat/__tests__/session-chat-transport.test.ts
rm src/components/chat/session-chat-transport.test.ts
```

**Step 3: Clean up stale comments and imports**

Search:

```bash
rg -n "/api/chat/send|/api/chat/stream|SessionChatTransport|send/stream split" src app
```

Expected: only references you still intentionally want.

**Step 4: Fix any remaining code or comments**

Likely places:

- `src/components/chat/chat-panel.tsx`
- `app/api/tool-confirm/route.ts`
- `src/lib/chat/extract-user-input.ts`

**Step 5: Run targeted tests**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts src/components/chat/chat-panel.test.tsx src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: `PASS`.

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(chat): remove legacy managed-agents split transport"
```

### Task 7: Final verification and regression sweep

**Files:**
- No required code changes
- Optional doc touch-up if stale comments remain

**Why:** The rework deletes infrastructure. You need a clean proof that the simple path still handles the whole product surface.

**Step 1: Run the relevant test suite**

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts src/lib/managed-agents/__tests__/adapter.test.ts src/components/chat/chat-panel.test.tsx app/api/tool-confirm/__tests__/route.test.ts app/api/webhook/telegram/route.test.ts
```

Expected: `PASS`.

**Step 2: Run a repo-wide grep for stale architecture**

```bash
rg -n "SessionChatTransport|/api/chat/send|/api/chat/stream|openSessionTail|iterateSessionEventsForever" src app docs
```

Expected:

- no browser chat references to the deleted split architecture
- `openSessionTail` may still exist only if other non-browser code legitimately uses it

**Step 3: Manual browser QA**

Run the app:

```bash
pnpm dev
```

Then verify manually:

1. New thread first message streams immediately.
2. Existing thread follow-up streams immediately.
3. File upload on first turn still works.
4. Custom tool turn continues normally.
5. Approval-gated tool pauses and resume works.
6. Thread navigation after first message no longer drops the turn.
7. Interrupt still works if supported in the visible UI.

**Step 4: Record regressions immediately**

If any of the seven manual checks fail, stop and add a regression test before changing code.

**Step 5: Final commit**

```bash
git add -A
git commit -m "test(chat): verify managed-agents browser chat rework"
```

## Notes For The Engineer

- Do not rewrite `consumeAnthropicSession()`. It is the right architecture already.
- Do not add a new transport abstraction.
- Do not reintroduce a background worker for browser chat.
- Copy old query shapes from `app/api/chat/send/route.ts` where useful. Delete the file after the new route is fully green.
- Keep the solution DRY and boring. If you catch yourself inventing a helper for one call site, stop.
- Prefer adapting tests from the current `send` route and adapter tests instead of writing brand-new elaborate mocks.

## Definition of Done

- Browser chat uses `POST /api/chat` only.
- Browser chat no longer imports or instantiates `SessionChatTransport`.
- `runManagedAgent()` is the browser route's execution path.
- Approval continuations still work.
- Legacy `send` and `stream` routes are deleted.
- Targeted Vitest suite passes.
- Manual browser QA passes.

Tasklist complete and saved to `docs/tasks/2026-04-12-managed-agents-browser-chat-rework-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.
