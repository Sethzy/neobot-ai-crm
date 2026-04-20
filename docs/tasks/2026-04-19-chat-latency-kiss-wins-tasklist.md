# Chat Latency KISS Wins Implementation Plan

**Goal:** Make cold and warm chat turns feel snappy by removing avoidable hot-path work, bounding dependency waits, and restoring the test harness that protects streaming UX.

**Architecture:** Keep the current Managed Agents architecture. Fix the biggest user-facing latency regressions with boring changes: stop replaying full Anthropic history on warm turns, add explicit time budgets to external calls on the interactive chat path, and stop doing redundant warm-turn DB reads before the kickoff is sent. Do not add a model router, prompt-caching redesign, or session-prewarm system in this batch.

**Tech Stack:** Next.js App Router, Anthropic Managed Agents SDK, Supabase JS, Redis/node-redis, Vitest, Playwright MCP

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Modify: `src/components/chat/chat-panel.test.tsx:80-85`
- Modify: `src/lib/managed-agents/session-runner.ts:121-177`
- Modify: `src/lib/managed-agents/session-reconnect.ts:338-379`
- Modify: `src/lib/managed-agents/session-kickoff.ts:136-235`
- Modify: `src/lib/managed-agents/adapter.ts:444-685`
- Modify: `app/api/chat/route.ts:157-265`
- Modify: `src/lib/runner/system-reminder.ts:36-64`
- Modify: `src/lib/redis.ts:11-17`
- Test: `src/lib/managed-agents/__tests__/session-runner.test.ts`
- Test: `src/lib/managed-agents/__tests__/session-reconnect.test.ts`
- Test: `src/lib/managed-agents/__tests__/session-kickoff.test.ts`
- Test: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Test: `src/lib/__tests__/rate-limit.test.ts`
- Test: `app/api/chat/__tests__/route.test.ts`

## Skills To Use

- `@test-driven-development` for every parent task
- `@systematic-debugging` before touching hot-path latency code
- `@requesting-code-review` after each parent task is green

## Non-Goals For This Batch

- Do **not** build a generic model router
- Do **not** add a session prewarm system
- Do **not** redesign prompt caching
- Do **not** add a distributed cache layer for skills or connections
- Do **not** refactor unrelated chat UI components

---

### Task 1: Restore the `ChatPanel` test harness first

**Why:** The streaming/recovery UI suite currently fails before it reaches any assertions. Fix this first so the rest of the latency work has a reliable safety net.

**Files:**
- Modify: `src/components/chat/chat-panel.test.tsx:80-85`
- Test: `src/components/chat/chat-panel.test.tsx`

**Step 1: Write the failing test**

Add a focused smoke test near the top of `src/components/chat/chat-panel.test.tsx` that proves the panel can render while hooks using `useQuery` mount:

```tsx
it("renders without crashing when query-backed hooks mount", () => {
  renderPanel(<ChatPanel chatId="thread-1" />);
  expect(mockUseChat).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx
```

Expected: FAIL with `No "useQuery" export is defined on the "@tanstack/react-query" mock`

**Step 3: Write minimal implementation**

Replace the current mock with a partial mock that keeps the real module exports and overrides only what this file needs:

```tsx
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [],
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
      refetch: vi.fn(),
    })),
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
      setQueriesData: mockSetQueriesData,
    }),
  };
});
```

If a specific query needs a different return shape, branch on `queryKey` inside the `useQuery` mock instead of adding more top-level mocks.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx
```

Expected: PASS for the new smoke test and the existing `ChatPanel` suite

**Step 5: Commit**

```bash
git add src/components/chat/chat-panel.test.tsx
git commit -m "test(prXX): restore chat panel query mocks"
```

---

### Task 2: Remove the warm-turn Anthropic history replay tax

**Why:** Warm turns should not get slower as a thread grows. Right now the route-owned session runner drains `events.list()` before it consumes the already-open live stream.

**Files:**
- Modify: `src/lib/managed-agents/session-runner.ts:121-177`
- Modify: `src/lib/managed-agents/session-reconnect.ts:338-379`
- Test: `src/lib/managed-agents/__tests__/session-runner.test.ts:148-168`
- Test: `src/lib/managed-agents/__tests__/session-reconnect.test.ts:240-313`

**Step 1: Write the failing test**

Add a runner test proving that route-owned turns always prefer the already-open live stream, even when `afterId` is non-null:

```ts
it("uses the live stream directly for warm turns opened before kickoff", async () => {
  (openSessionTail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    live: { [Symbol.asyncIterator]: async function* () {} },
    afterId: "evt_prev",
  });

  stubIteration([
    agentMessageTextEvent("evt_1", "hello"),
    statusIdleEvent("evt_idle", "end_turn"),
  ]);

  await consumeAnthropicSession({
    anthropic: fakeAnthropic(),
    sessionId: "sess_1",
    runId: "run_1",
    context: baseContext(),
    kickoffContent: [{ type: "text", text: "hi there" }],
  });

  expect(iterateSessionEventsAfter).toHaveBeenCalledWith(
    expect.anything(),
    "sess_1",
    expect.objectContaining({ afterId: "evt_prev" }),
    { preferLiveOnly: true },
  );
});
```

Add a reconnect test proving `events.list()` is not called when `preferLiveOnly: true` on a warm turn:

```ts
it("does not drain history when preferLiveOnly is true on a reused session", async () => {
  const list = vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      yield agentMessageTextEvent("evt_history", "should not be read");
    },
  }));

  const client = {
    beta: { sessions: { events: { list } } },
  } as never;

  const handle = {
    live: {
      [Symbol.asyncIterator]: async function* () {
        yield agentMessageTextEvent("evt_live", "hello");
        yield statusIdleEvent("evt_idle", "end_turn");
      },
    },
    afterId: "evt_prev",
  };

  const seen: string[] = [];
  for await (const event of iterateSessionEventsAfter(client, "sess_reused", handle, { preferLiveOnly: true })) {
    seen.push((event as { id: string }).id);
  }

  expect(list).not.toHaveBeenCalled();
  expect(seen).toEqual(["evt_live", "evt_idle"]);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/session-reconnect.test.ts
```

Expected: FAIL because warm turns currently pass `preferLiveOnly: false` or drain history first

**Step 3: Write minimal implementation**

In `src/lib/managed-agents/session-runner.ts`, use the already-open live stream for **all** Mode A turns:

```ts
const preferLiveOnly = true;

iterator = iterateSessionEventsAfter(
  anthropic,
  options.sessionId,
  liveHandle,
  { preferLiveOnly },
);
```

Keep the history-drain path in `iterateSessionEventsAfter()` for non-route consumers that explicitly need catch-up behavior. Do not add a new cursor-persistence system in this batch.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/session-reconnect.test.ts
```

Expected: PASS for the new warm-turn tests and no regressions in existing reconnect tests

**Step 5: Run the broader managed-agent unit suite**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/session-reconnect.test.ts src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/__tests__/session-kickoff.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/managed-agents/session-runner.ts src/lib/managed-agents/session-reconnect.ts src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/session-reconnect.test.ts
git commit -m "fix(prXX): remove warm-turn history replay"
```

---

### Task 3: Add explicit hot-path time budgets

**Why:** Interactive chat must not inherit the SDK defaults for retries and 10-minute timeouts. Bound Anthropic and Supabase waits on the request path.

**Files:**
- Modify: `src/lib/managed-agents/session-kickoff.ts:136-235`
- Modify: `src/lib/managed-agents/session-runner.ts:90-176`
- Modify: `app/api/chat/route.ts:157-214`
- Modify: `src/lib/runner/system-reminder.ts:36-64`
- Test: `src/lib/managed-agents/__tests__/session-kickoff.test.ts:172-247`
- Test: `src/lib/managed-agents/__tests__/session-runner.test.ts:105-145`
- Test: `app/api/chat/__tests__/route.test.ts`

**Step 1: Write the failing test**

Add a `session-kickoff` test that proves `sessions.create()` uses bounded request options:

```ts
it("opens sessions with chat-safe timeout and no SDK retries", async () => {
  createSession.mockResolvedValue({ id: "sess_1" });

  await getOrCreateSession({
    anthropic: stubAnthropic(),
    supabase: stubSupabase(),
    threadId: "thread-1",
    threadTitle: "Draft follow-up",
  });

  expect(createSession).toHaveBeenCalledWith(
    expect.objectContaining({
      agent: { type: "agent", id: "agent_123", version: 7 },
    }),
    expect.objectContaining({
      timeout: 2_500,
      maxRetries: 0,
    }),
  );
});
```

Add a runner test that proves kickoff send uses bounded request options:

```ts
expect(sendEvent).toHaveBeenCalledWith(
  "sess_1",
  expect.objectContaining({
    events: [
      expect.objectContaining({ type: "user.message" }),
    ],
  }),
  expect.objectContaining({
    timeout: 2_500,
    maxRetries: 0,
  }),
);
```

Add a route test that proves warm-turn thread lookup selects `session_id` so the route can make timeout-aware branching decisions later:

```ts
expect(runManagedAgent).toHaveBeenCalledWith(
  expect.objectContaining({
    existingSessionId: "sess_1",
  }),
);
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/session-runner.test.ts app/api/chat/__tests__/route.test.ts
```

Expected: FAIL because the current code does not pass request options or `existingSessionId`

**Step 3: Write minimal implementation**

Use boring constants local to the chat path:

```ts
const CHAT_ANTHROPIC_TIMEOUT_MS = 2_500;
const CHAT_ANTHROPIC_REQUEST_OPTIONS = {
  timeout: CHAT_ANTHROPIC_TIMEOUT_MS,
  maxRetries: 0,
} as const;
```

Apply them to:

- `anthropic.beta.sessions.create(...)`
- `anthropic.beta.sessions.retrieve(...)`
- `anthropic.beta.sessions.events.stream(...)`
- `anthropic.beta.sessions.events.send(...)`

Use `AbortSignal.timeout(...)` on the Supabase route queries:

```ts
const hotPathSignal = AbortSignal.timeout(800);

auth.supabase
  .from("conversation_threads")
  .select("thread_id, title, session_id")
  .eq("thread_id", parsedBody.data.id)
  .eq("client_id", clientId)
  .eq("is_archived", false)
  .abortSignal(hotPathSignal)
  .maybeSingle();
```

Make `buildSystemReminder()` best-effort with a short timeout from the caller side:

```ts
const reminder = await Promise.race([
  buildSystemReminder(input.supabase, input.clientId),
  new Promise<string>((resolve) =>
    setTimeout(() => resolve("<system-reminder>\nActive connections: unknown\n</system-reminder>"), 150),
  ),
]);
```

Do not create a retry framework. Do not change global Anthropic client defaults for non-chat code.

**Step 4: Run targeted tests**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/session-runner.test.ts app/api/chat/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Run the full focused suite**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/adapter.test.ts app/api/chat/__tests__/route.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/managed-agents/session-kickoff.ts src/lib/managed-agents/session-runner.ts app/api/chat/route.ts src/lib/runner/system-reminder.ts src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/session-runner.test.ts app/api/chat/__tests__/route.test.ts
git commit -m "fix(prXX): bound chat hot-path waits"
```

---

### Task 4: Strip redundant warm-turn route and adapter work

**Why:** Warm turns should skip work that is only needed for brand-new sessions.

**Files:**
- Modify: `app/api/chat/route.ts:201-265`
- Modify: `src/lib/managed-agents/adapter.ts:444-685`
- Test: `app/api/chat/__tests__/route.test.ts:196-221`
- Test: `src/lib/managed-agents/__tests__/adapter.test.ts`

**Step 1: Write the failing test**

Add a route test proving warm turns skip `client_profile` / `user_preferences` loading when the thread already has a `session_id`:

```ts
it("skips client context lookup when the thread already has a session", async () => {
  maybeSingle.mockResolvedValueOnce({
    data: { thread_id: "t1", title: "Thread 1", session_id: "sess_1" },
    error: null,
  });

  await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "t1",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
    }),
  );

  expect(single).not.toHaveBeenCalled();
  expect(runManagedAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      existingSessionId: "sess_1",
      clientProfile: null,
      userPreferences: null,
    }),
  );
});
```

Add an adapter test proving that when `existingSessionId` is supplied, `getExistingSessionId()` is not called again:

```ts
it("uses input.existingSessionId and skips the duplicate session lookup", async () => {
  (getExistingSessionId as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
    throw new Error("should not be called");
  });

  await runManagedAgent({
    anthropic,
    supabase,
    clientId: "c1",
    threadId: "t1",
    input: "hello",
    existingSessionId: "sess_existing",
    clientProfile: null,
    userPreferences: null,
    threadTitle: "Thread 1",
  });

  expect(consumeAnthropicSession).toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: FAIL because the route always loads client context and the adapter always looks up `session_id` again

**Step 3: Write minimal implementation**

In `app/api/chat/route.ts`:

- select `session_id` with the thread row
- branch after the thread lookup
- skip the `clients` query when `existingThread?.session_id` is present
- pass `existingSessionId` into `runManagedAgent`

Example shape:

```ts
const threadResult = await auth.supabase
  .from("conversation_threads")
  .select("thread_id, title, session_id")
  ...

const existingSessionId = threadResult.data?.session_id ?? null;

let clientProfile: string | null = null;
let userPreferences: string | null = null;

if (!existingSessionId) {
  const clientContextResult = await auth.supabase
    .from("clients")
    .select("client_profile, user_preferences")
    .eq("client_id", clientId)
    .single();

  clientProfile = clientContextResult.data?.client_profile ?? null;
  userPreferences = clientContextResult.data?.user_preferences ?? null;
}
```

In `src/lib/managed-agents/adapter.ts`, extend the input type:

```ts
existingSessionId?: string | null;
```

Then prefer the supplied value:

```ts
const existingSessionId = input.existingSessionId ?? await getExistingSessionId({
  supabase: input.supabase,
  threadId: input.threadId,
});
```

Do not add new caches in this batch.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: PASS

**Step 5: Run the broader focused suite**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/__tests__/session-runner.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add app/api/chat/route.ts src/lib/managed-agents/adapter.ts app/api/chat/__tests__/route.test.ts src/lib/managed-agents/__tests__/adapter.test.ts
git commit -m "fix(prXX): skip redundant warm-turn setup"
```

---

### Task 5: Make degraded Redis fail open faster

**Why:** Availability is fixed, but a cold degraded request can still spend ~2 seconds waiting for Redis before chat proceeds.

**Files:**
- Modify: `src/lib/redis.ts:11-17`
- Test: `src/lib/__tests__/rate-limit.test.ts:97-110`

**Step 1: Write the failing test**

Tighten the existing degraded-mode test to enforce a smaller budget:

```ts
it("fails open within 1 second when Redis is unreachable", async () => {
  mockGetRedisClient.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 800);
      }),
  );

  const startedAt = Date.now();
  const result = await checkRateLimit("user:123", 30, 60);

  expect(result).toEqual({ allowed: true, remaining: 30 });
  expect(Date.now() - startedAt).toBeLessThan(1_000);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/__tests__/rate-limit.test.ts
```

Expected: FAIL if the real timeout is still longer than the new threshold or the code is not aligned with the tighter budget

**Step 3: Write minimal implementation**

Lower the connect timeout in `src/lib/redis.ts` to a visibly faster degraded-mode budget:

```ts
const REDIS_CONNECT_TIMEOUT_MS = 750;
```

Keep the existing cooldown behavior:

```ts
const REDIS_FAILURE_COOLDOWN_MS = 30_000;
```

Do not add a new circuit-breaker subsystem.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/lib/__tests__/rate-limit.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/redis.ts src/lib/__tests__/rate-limit.test.ts
git commit -m "fix(prXX): reduce degraded redis wait"
```

---

### Task 6: Verify the changes through the real UI

**Why:** The customer only feels what happens in the browser. Validate both latency and UX after the code is green.

**Files:**
- Modify: none
- Test: browser-only verification with Playwright MCP

**Step 1: Start the app with latency logs enabled**

Run:

```bash
DEBUG_LATENCY=1 pnpm dev --port 3002
```

Expected: Next.js dev server starts on `http://localhost:3002`

**Step 2: Run focused unit tests before opening the browser**

Run:

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx src/lib/managed-agents/__tests__/session-runner.test.ts src/lib/managed-agents/__tests__/session-reconnect.test.ts src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/adapter.test.ts app/api/chat/__tests__/route.test.ts src/lib/__tests__/rate-limit.test.ts
```

Expected: PASS

**Step 3: Verify warm-turn latency with Playwright MCP**

Use Playwright MCP to:

1. Open `http://localhost:3002/chat`
2. Log in if needed
3. Create one fresh thread
4. Send five short messages on that **same** thread: `hi`, `2 + 2`, `ping`, `say hi`, `hello again`
5. Take screenshots before send, during submitted state, and after response for each turn
6. Check browser console errors after each turn

Expected:

- no visual breakage
- no new browser console errors
- submitted state appears immediately after Enter
- warm-turn TTFT in server logs does **not** climb with thread length

**Step 4: Verify cold-turn latency with Playwright MCP**

Use Playwright MCP to send three fresh-thread prompts:

- `say hi`
- `what is 2 + 2?`
- `what time is it`

Expected:

- no speculative skill reads for trivial prompts
- no dead-air regressions
- cold-turn TTFT improves or stays at the current accepted floor

**Step 5: Record the latency note for the PR**

Add this note to the PR description or engineering handoff:

```md
Warm-turn TTFT:
- run 1: ___ ms
- run 2: ___ ms
- run 3: ___ ms
- run 4: ___ ms
- run 5: ___ ms

Cold-turn TTFT:
- say hi: ___ ms
- what is 2 + 2?: ___ ms
- what time is it: ___ ms

Browser QA:
- screenshots captured: yes
- console errors: none / list them
```

Expected: one short latency summary that a reviewer can read without digging through logs

---

## Done Definition

- Warm turns do not scan full Anthropic session history before first token
- Interactive Anthropic and Supabase waits are explicitly bounded on the chat path
- Warm turns skip `client_profile` / `user_preferences` loading and duplicate `session_id` lookup
- Redis degraded mode fails open faster than today
- `src/components/chat/chat-panel.test.tsx` passes again
- Browser verification is complete with screenshots and console checks

## Final Review Pass

After each parent task:

```bash
git status --short
pnpm vitest run <focused tests for that task>
```

Then request a report-only review with `@requesting-code-review`.

If any step starts to require new infrastructure, stop and cut scope back to the smallest user-visible win.
