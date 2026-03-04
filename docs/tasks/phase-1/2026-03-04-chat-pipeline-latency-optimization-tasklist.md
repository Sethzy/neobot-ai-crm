# Chat Pipeline Bug Fixes + Latency Optimization — Implementation Plan

**Context:** Prior session shipped chat SDK lazy thread creation (commit `ee38080`), followed by code review fixes (commits `a8de4ab`, `299d586`). During dogfooding, 3 bugs were found and fixed in working tree but not yet committed. This tasklist covers committing those bug fixes, then optimizing the pipeline latency.

**Current git state:** 6 files modified in working tree (uncommitted bug fixes + diagnostic logging).

---

## Part A: Bug Fixes (already implemented, need commit)

Three bugs were found and fixed during the debugging session. The fixes are already in the working tree.

### Bug 1: Duplicate messages in chat UI

**Root cause:** React strict mode (default in Next.js 15 dev) double-invokes effects. The reset effect in `chat-panel.tsx` unconditionally cleared `hasSentInitialMessage.current = false` on every mount, causing `sendMessage` to fire twice.

**Fix applied in** `src/components/chat/chat-panel.tsx`:
- Added `prevChatIdRef` to track when `chatId` actually changes
- Reset guards only fire when `chatId` differs from previous value (not on strict mode re-invocation)

```diff
+  const prevChatIdRef = useRef(chatId);
   useEffect(() => {
     hasAutoNamed.current = initialMessages.some((message) => message.role === "user");
-    hasSentInitialMessage.current = false;
-    hasReconciledCanonicalThreadId.current = false;
+    if (prevChatIdRef.current !== chatId) {
+      prevChatIdRef.current = chatId;
+      hasSentInitialMessage.current = false;
+      hasReconciledCanonicalThreadId.current = false;
+    }
   }, [chatId, initialMessages]);
```

**Tests:** 14 chat-panel tests pass. User confirmed "only one message seen."

### Bug 2: 500 error — bare catch block swallowing errors

**Root cause:** `route.ts` had `catch {}` with no logging. The actual error was `Could not find the table 'public.conversation_channel_mappings' in the schema cache` — 3 Supabase migrations hadn't been pushed. Migrations were applied via `npx supabase db push`.

**Fix applied in** `app/api/chat/route.ts`:
- Changed `catch {}` to `catch (error) { console.error(...) }` — permanent error log, not diagnostic

```diff
-  } catch {
+  } catch (error) {
+    console.error("[chat/route] Failed to process chat request:", error);
     return jsonError("Failed to process chat request.", 500);
   }
```

### Bug 3: Stream interrupted — no assistant response rendered

**Root cause:** The URL reconciliation callback fired `router.replace('/chat/{canonicalId}')` as soon as the response headers arrived. This triggered a full React navigation/remount, unmounting `ChatPanel` mid-stream. The `useChat` stream was killed before the assistant response arrived.

**Fix applied in** `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx`:
- Changed `router.replace` to `window.history.replaceState` — updates URL bar without React re-render

```diff
-      router.replace(`/chat/${canonicalThreadId}`);
+      window.history.replaceState(null, "", `/chat/${canonicalThreadId}`);
```

**Fix applied in** `app/(dashboard)/chat/[threadId]/chat-thread-page-client.test.tsx`:
- Updated test to assert `history.replaceState` instead of `router.replace`

---

## Part B: Latency Optimization (needs implementation)

**Problem:** The draft-to-session flow executes **15 sequential DB round-trips** to Supabase before the LLM call starts. Compared to the Dorabot reference implementation (which resolves sessions with in-memory Map lookups), Sunder's serverless architecture necessarily uses DB calls — but several are redundant or can be parallelized.

| Phase | Sequential DB calls | Waste |
|-------|-------------------|-------|
| Server component (`page.tsx`) | 3 (auth, resolveClientId, thread lookup) | resolveClientId + thread lookup always null for drafts |
| API route (`route.ts`) | 3 (auth, getUser, resolveClientId) | Cannot avoid — independent request context |
| processInboundMessage | 5 (Steps 1–4: mapping lookup, thread lookup, create, mapping insert, mapping readback) | Steps 1 & 2 are independent reads run sequentially |
| runAgent | 4 (stale cleanup, lock, persist msg, load context) | Cannot avoid — all necessary |

**Net reduction:** 15 sequential round-trips → 12 (with 2 of those running in parallel → effectively 11). Saves ~300-600ms.

**Non-goals:** LLM call latency (~10-12s) is irreducible. Dev-mode cold compilation (~6s) goes away in production.

---

## Task Overview

| Task | Component | TDD? | Status |
|------|-----------|------|--------|
| 1 | Commit bug fixes (Part A) | N/A | Ready to commit |
| 2 | Early-return for draft routes in server component | Yes | Needs implementation |
| 3 | Parallelize Steps 1 & 2 in processInboundMessage | Yes | Needs implementation |
| 4 | Remove diagnostic logging + dead code cleanup | No (cleanup) | Needs implementation |
| 5 | Commit optimizations (Part B) | — | After Tasks 2–4 |

---

### Task 1: Commit Bug Fixes

The 3 bug fixes are already implemented in the working tree. Commit them as-is (diagnostic logging will be removed in Task 4).

**Files to stage:**
- `src/components/chat/chat-panel.tsx` — strict mode duplicate fix
- `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` — history.replaceState fix
- `app/(dashboard)/chat/[threadId]/chat-thread-page-client.test.tsx` — updated test
- `app/api/chat/route.ts` — console.error in catch block + diagnostic logging (temporary)
- `src/lib/chat/process-inbound-message.ts` — diagnostic logging (temporary)

**Do NOT stage:** `src/components/ai-elements/reasoning.tsx` or `tsconfig.tsbuildinfo` — unrelated changes.

**Steps:**
- [ ] Run `npx vitest run` — full suite passes
- [ ] Stage the 5 files listed above
- [ ] Commit with message:

```
fix(chat): strict mode duplicates, stream interruption, and error logging

- Prevent React strict mode from double-firing sendMessage via prevChatIdRef guard
- Use history.replaceState instead of router.replace for URL reconciliation
  (router.replace unmounts ChatPanel mid-stream, killing useChat)
- Add console.error to bare catch block in chat route (was swallowing errors)
- Add temporary diagnostic logging (will be removed in follow-up)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

### Task 2: Early-Return for Draft Routes in Server Component

**Files:**
- Modify: `app/(dashboard)/chat/[threadId]/page.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.test.tsx`

**Context:** When `isDraftRoute=true`, the thread doesn't exist yet — `resolveClientId` and the thread lookup are guaranteed wasted work. Middleware already guarantees the user is authenticated. This matches Dorabot's pattern: if you know it's new, skip the lookup.

**Current flow (draft route):**
```
await params                    ← necessary
isDraftRoute = true             ← necessary
threadIdSchema.safeParse(...)   ← necessary (fast, no DB)
createClient()                  ← DB round-trip #1
resolveClientId(supabase)       ← DB round-trip #2 (WASTED — result unused for drafts)
thread lookup query             ← DB round-trip #3 (WASTED — always null for drafts)
thread is null + isDraftRoute → render empty ChatThreadPageClient
```

**New flow (draft route):**
```
await params                    ← necessary
isDraftRoute = true             ← necessary
threadIdSchema.safeParse(...)   ← necessary (fast, no DB)
isDraftRoute → early return with empty ChatThreadPageClient (0 DB round-trips)
```

**Step 1: Write failing test — draft route skips all DB calls**

Add a new test case to `page.test.tsx` that asserts `mockCreateClient`, `mockResolveClientId`, and `mockListMessages` are NOT called when `draft=1`. This should FAIL against current code.

```typescript
it("skips all DB calls for draft routes (early return)", async () => {
  const element = await ChatThreadPage({
    params: Promise.resolve({ threadId: MISSING_THREAD_ID }),
    searchParams: Promise.resolve({ draft: "1" }),
  });
  render(element);

  expect(screen.getByTestId("thread-id")).toHaveTextContent(MISSING_THREAD_ID);
  expect(screen.getByTestId("initial-message-count")).toHaveTextContent("0");

  // Should NOT have called any DB functions
  expect(mockCreateClient).not.toHaveBeenCalled();
  expect(mockResolveClientId).not.toHaveBeenCalled();
  expect(mockListMessages).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
```

- [ ] Write the test
- [ ] Run it — confirm it FAILS (current code calls `mockCreateClient` and `mockResolveClientId`)

**Step 2: Implement early return for draft routes**

In `page.tsx`, move the `isDraftRoute` check BEFORE `createClient()`:

```typescript
export default async function ChatThreadPage({ params, searchParams }: ChatThreadPageProps) {
  const { threadId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const draftParam = resolvedSearchParams?.draft;
  const isDraftRoute = Array.isArray(draftParam) ? draftParam.includes("1") : draftParam === "1";

  if (!threadIdSchema.safeParse(threadId).success) {
    redirect("/chat");
    return null;
  }

  /** Draft routes skip DB work entirely — the thread doesn't exist yet
   *  and middleware already guarantees auth. */
  if (isDraftRoute) {
    return (
      <ChatThreadPageClient
        threadId={threadId}
        initialMessages={[]}
        isDraftRoute
      />
    );
  }

  // Non-draft: verify ownership and load messages
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  // ... rest unchanged
```

- [ ] Make the change
- [ ] Run all tests in `page.test.tsx` — all pass (new + existing)

**Step 3: Update existing draft test**

The existing test "renders an empty draft thread page when missing thread has draft=1" sets up Supabase mocks that are no longer needed. Update it to not depend on those mocks, or remove it in favor of the new test.

- [ ] Update or remove the old draft test
- [ ] Run all tests — confirm all pass

---

### Task 3: Parallelize Steps 1 & 2 in processInboundMessage

**Files:**
- Modify: `src/lib/chat/process-inbound-message.ts`
- Modify: `src/lib/chat/__tests__/process-inbound-message.test.ts`

**Context:** Steps 1 (`getThreadIdForExternalConversation`) and 2 (`findActiveThreadForClient`) are independent DB reads run sequentially. In Dorabot, session resolution is a single in-memory Map lookup. We can't match that in serverless, but we can at least run both lookups in parallel.

**Behavior contract (must be preserved — all 5 existing tests must continue passing):**
- If Step 1 returns a thread → use it (Step 2 result discarded)
- If Step 1 null + Step 2 returns a thread → use it
- If both null → proceed to Step 3 (create thread)
- Priority: mapping lookup wins over thread lookup

**Step 1: Write test — both lookups fire regardless of Step 1 result**

Add a test asserting that `findActiveThreadForClient` (via `supabase.from`) is called even when `getThreadIdForExternalConversation` returns a mapped thread. With the current sequential code, Step 2 only runs if Step 1 returns null. After parallelization, both always fire.

```typescript
it("runs mapping lookup and thread lookup in parallel", async () => {
  const requestedThreadId = "22222222-2222-4222-8222-222222222222";
  const supabase = createThreadLookupSupabase({ threadExists: true, threadId: requestedThreadId });
  mockGetThreadIdForExternalConversation.mockResolvedValue("thread-mapped");
  mockRunAgent.mockResolvedValue({ status: "queued" });

  await processInboundMessage({
    supabase: supabase as never,
    clientId: "client-123",
    channel: "web",
    externalConversationId: "external-1",
    messageText: "Hello",
    requestedThreadId,
  });

  // Both lookups should fire (parallel), even though Step 1 found a mapping
  expect(mockGetThreadIdForExternalConversation).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalled();

  // Mapping still wins
  expect(mockRunAgent).toHaveBeenCalledWith(
    expect.objectContaining({ threadId: "thread-mapped" }),
    supabase,
  );
});
```

- [ ] Write the test
- [ ] Run it — confirm it FAILS (current code skips Step 2 when Step 1 succeeds, so `supabase.from` is not called)

**Step 2: Implement Promise.all for Steps 1 & 2**

Replace the sequential await chain in `process-inbound-message.ts`:

```typescript
// Before (sequential):
let canonicalThreadId = await getThreadIdForExternalConversation(supabase, {
  clientId, channel, externalConversationId,
});
if (!canonicalThreadId && requestedThreadId && threadIdSchema.safeParse(requestedThreadId).success) {
  canonicalThreadId = await findActiveThreadForClient(supabase, clientId, requestedThreadId);
}

// After (parallel):
const validRequestedThreadId =
  requestedThreadId && threadIdSchema.safeParse(requestedThreadId).success
    ? requestedThreadId
    : null;

const [mappedThreadId, activeThreadId] = await Promise.all([
  getThreadIdForExternalConversation(supabase, {
    clientId, channel, externalConversationId,
  }),
  validRequestedThreadId
    ? findActiveThreadForClient(supabase, clientId, validRequestedThreadId)
    : Promise.resolve(null),
]);

/** Mapping lookup takes priority (channel routing canonical source). */
let canonicalThreadId = mappedThreadId ?? activeThreadId;
```

- [ ] Make the change
- [ ] Run ALL tests in `process-inbound-message.test.ts` — all 5 existing + 1 new must pass

---

### Task 4: Remove Diagnostic Logging + Dead Code Cleanup

**No TDD required** — pure cleanup with no behavior change.

**Step 1: Remove diagnostic logging from route.ts**

Remove these 4 `console.log` lines (keep the `console.error` in catch):
```
console.log("[chat/route] Resolving client ID for user:", user.id);
console.log("[chat/route] clientId:", clientId, "threadId:", threadId, "input:", input.slice(0, 50));
console.log("[chat/route] processInboundMessage result:", result.status, "threadId:", result.threadId);
console.log("[chat/route] Returning streaming response for thread:", result.threadId);
```

- [ ] Remove the 4 lines
- [ ] Verify no test regressions

**Step 2: Remove diagnostic logging from process-inbound-message.ts**

Remove all `console.log("[processInbound] ...")` statements (11 lines).

- [ ] Remove all 11 lines
- [ ] Run `process-inbound-message.test.ts` — all pass

**Step 3: Clean up dead useRouter import**

In `chat-thread-page-client.tsx`:
- Remove `import { useRouter } from "next/navigation";`
- Remove `const router = useRouter();`

In `chat-thread-page-client.test.tsx`:
- Remove `const mockReplace = vi.fn();`
- Remove the `vi.mock("next/navigation", ...)` block
- Remove `expect(mockReplace).not.toHaveBeenCalled();` from the replaceState test

- [ ] Make changes
- [ ] Run `chat-thread-page-client.test.tsx` — all 5 tests pass

---

### Task 5: Commit Optimizations

**Steps:**
- [ ] Run `npx vitest run` — full suite passes
- [ ] Stage all modified files
- [ ] Commit with message:

```
perf(chat): optimize draft-to-session pipeline latency

- Early-return for draft routes in server component (skip 2 DB round-trips)
- Parallelize mapping + thread lookup in processInboundMessage (Promise.all)
- Remove diagnostic logging from route.ts and process-inbound-message.ts
- Clean up dead useRouter import in chat-thread-page-client.tsx

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npx vitest run app/(dashboard)/chat/[threadId]/page.test.tsx` — all pass
- [ ] `npx vitest run src/lib/chat/__tests__/process-inbound-message.test.ts` — all pass
- [ ] `npx vitest run app/(dashboard)/chat/[threadId]/chat-thread-page-client.test.tsx` — all pass
- [ ] `npx vitest run src/components/chat/chat-panel.tsx` — all pass (chat-panel tests, separate file)
- [ ] `npx vitest run` — full suite, no regressions
- [ ] Manual smoke test: click suggestion on `/chat` → verify draft loads fast, message sends, response streams, URL updates to canonical thread ID

## Dorabot Reference Alignment

These changes close the unnecessary drift from the Dorabot reference implementation:

| Drift | Dorabot pattern | Sunder fix |
|-------|----------------|------------|
| Draft route does 3 DB queries to confirm thread doesn't exist | `chat.send` returns immediately with sessionKey, no pre-check | Early-return for `isDraftRoute` before any DB calls (Task 2) |
| Steps 1 & 2 are sequential | Single in-memory `sessionRegistry.get(key)` lookup | `Promise.all` both lookups (Task 3) |

Remaining drift is **intentional** — inherent to serverless + multi-tenant:
- DB-backed state (vs in-memory) — Vercel Functions are stateless
- Dual auth resolution in server component + API route — separate request contexts
- Stale run cleanup RPC — serverless functions can die mid-run
- Context assembly re-reads all messages — no persistent session continuation in AI SDK v6
- Atomic channel mapping with readback — concurrent request safety
