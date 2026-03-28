# Extract Bootstrap From Context Assembly — Implementation Plan

**PR:** Out-of-plan (follow-up to PR 56: Context pipeline redesign). Extracts client storage bootstrap from the prompt-loading hot path.
**Decisions:** DATA-01 (Supabase + RLS), RUNNER-05 (context assembly), SESSION-07 (compaction)
**Goal:** Reduce first-message latency on serverless cold starts by making `loadSystemPromptState()` read-only.

**Architecture:** Move the one-time client storage bootstrap (`bootstrapMemoryFiles` + `bootstrapSkills`) out of context assembly and into a durable check at the chat route entrypoint. A new `is_bootstrapped` boolean on the `clients` table replaces the process-local `Set<string>` cache that evaporates on cold starts. After this change, `loadSystemPromptState()` performs zero storage writes — it only reads. Follows the Deep Agents pattern: init first, load second, inject third.

**Tech Stack:** Supabase (Postgres migration + Storage API), Vitest, Next.js API routes

**Design doc:** `docs/plans/2026-03-26-extract-bootstrap-from-context-assembly.md`

**Review decisions (2026-03-26):**
1. **strict-update** — `ensureClientBootstrap` treats UPDATE failure as fatal + test for it
2. **fix-route-tests** — fix Redis mock gap, add 2 route-level bootstrap boundary tests
3. **keep-skill-cache** — only remove memory-side process cache; keep skill-bootstrap cache
4. **skip-fold** — no query fold; `ensureClientBootstrap` does its own SELECT
5. **manual-types** — targeted manual patch for `is_bootstrapped` in `database.ts`
6. **route-regression** — bootstrap boundary assertions live on the chat route tests, not context tests

---

## Task 1: Add `is_bootstrapped` column to `clients`

**Files:**
- Create: `supabase/migrations/20260326090000_add_is_bootstrapped_to_clients.sql`
- Modify: `src/types/database.ts` (lines 345-386, clients type)

**Step 1: Write the migration**

```sql
-- Extract bootstrap from context assembly: durable initialization flag.
-- Replaces process-local Set<string> cache that evaporates on serverless cold starts.
ALTER TABLE public.clients
  ADD COLUMN is_bootstrapped BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.is_bootstrapped IS
  'True after client storage (memory files + skills) has been initialized. Checked once per chat turn to skip bootstrap.';
```

Save to `supabase/migrations/20260326090000_add_is_bootstrapped_to_clients.sql`.

**Step 2: Update the generated database types**

In `src/types/database.ts`, add `is_bootstrapped` to the `clients` table type in all three places (Row, Insert, Update):

In `Row` (after `crm_config_mode_until`):
```ts
          is_bootstrapped: boolean
```

In `Insert` (after `crm_config_mode_until`):
```ts
          is_bootstrapped?: boolean
```

In `Update` (after `crm_config_mode_until`):
```ts
          is_bootstrapped?: boolean
```

**Step 3: Verify types compile**

```
Run: npx tsc --noEmit
Expected: PASS (no type errors)
```

**Step 4: Commit**

```
git add supabase/migrations/20260326090000_add_is_bootstrapped_to_clients.sql src/types/database.ts
git commit -m "feat(pr57): add is_bootstrapped column to clients table"
```

---

## Task 2: Fix `bootstrapMemoryFiles` to throw on list errors

The current code at `src/lib/memory/bootstrap.ts:69` silently treats `bucket.list()` errors as "no files exist" — it proceeds to re-upload everything. The design requires fail-hard on infrastructure errors.

**Files:**
- Modify: `src/lib/memory/bootstrap.ts` (line 69)
- Test: `src/lib/memory/__tests__/bootstrap.test.ts`

**Step 5: Write the failing test for list error handling**

Add to the `describe("bootstrapMemoryFiles")` block in `src/lib/memory/__tests__/bootstrap.test.ts`:

```ts
  it("throws when a storage list call fails", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: null, error: { message: "storage unavailable" } })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(bootstrapMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "storage unavailable",
    );
    expect(mock.mockUpload).not.toHaveBeenCalled();
  });
```

**Step 6: Run test to verify it fails**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts -t "throws when a storage list call fails"
Expected: FAIL — currently the code proceeds without throwing
```

**Step 7: Implement the fix**

In `src/lib/memory/bootstrap.ts`, replace the destructured list calls (around line 69):

```ts
  const [rootResult, topicResult] = await Promise.all([
    bucket.list(clientId),
    bucket.list(`${clientId}/${MEMORY_TOPIC_DIRECTORY}`),
  ]);

  if (rootResult.error) {
    throw new Error(`Failed to list root memory files: ${getStorageErrorMessage(rootResult.error)}`);
  }
  if (topicResult.error) {
    throw new Error(`Failed to list topic memory files: ${getStorageErrorMessage(topicResult.error)}`);
  }

  const existingRoot = new Set((rootResult.data ?? []).map((f) => f.name));
  const existingTopic = new Set((topicResult.data ?? []).map((f) => f.name));
```

This replaces the current code:
```ts
  // OLD — silently treats errors as empty
  const [{ data: rootData }, { data: topicData }] = await Promise.all([...]);
  const existingRoot = new Set((rootData ?? []).map((f) => f.name));
  const existingTopic = new Set((topicData ?? []).map((f) => f.name));
```

**Step 8: Run tests to verify they pass**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
Expected: ALL PASS
```

**Step 9: Commit**

```
git add src/lib/memory/bootstrap.ts src/lib/memory/__tests__/bootstrap.test.ts
git commit -m "fix(pr57): throw on storage list errors in bootstrapMemoryFiles"
```

---

## Task 3: Add `ensureClientBootstrap()` with durable DB check

**Files:**
- Modify: `src/lib/memory/bootstrap.ts`
- Test: `src/lib/memory/__tests__/bootstrap.test.ts`

**Step 10: Write the failing tests for `ensureClientBootstrap`**

Add a new `describe("ensureClientBootstrap")` block in `src/lib/memory/__tests__/bootstrap.test.ts`.

First, update the imports:

```ts
import { _resetBootstrapCache, bootstrapMemoryFiles, ensureClientBootstrap } from "../bootstrap";
```

Then add:

```ts
describe("ensureClientBootstrap", () => {
  let mock: ReturnType<typeof createMockStorage>;

  function createMockClientWithDb(opts: { isBootstrapped: boolean }) {
    mock = createMockStorage();

    if (!opts.isBootstrapped) {
      mock.mockList
        .mockResolvedValueOnce({
          data: [fileEntry("SOUL.md"), fileEntry("USER.md"), fileEntry("MEMORY.md")],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [
            fileEntry("preferences.md"),
            fileEntry("growth-plan.md"),
            fileEntry("patterns.md"),
            fileEntry("key-decisions.md"),
          ],
          error: null,
        });
    }

    const mockSingle = vi.fn().mockResolvedValue({
      data: { is_bootstrapped: opts.isBootstrapped },
      error: null,
    });

    let updateError: { message: string } | null = null;
    const updateEq = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: null, error: updateError }),
    );
    const update = vi.fn(() => ({ eq: updateEq }));
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: mockSingle }),
    });

    const mockFrom = vi.fn((table: string) => {
      if (table === "clients") return { select, update };
      return {};
    });

    const client = {
      ...mock.client,
      from: mockFrom,
    } as unknown as SupabaseClient;

    return {
      client, mockFrom, mockSingle, update, updateEq,
      setUpdateError: (msg: string) => { updateError = { message: msg }; },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    _resetBootstrapCache();
  });

  it("skips bootstrap when is_bootstrapped is true", async () => {
    const { client } = createMockClientWithDb({ isBootstrapped: true });

    await ensureClientBootstrap(client, CLIENT_ID);

    expect(mock.mockList).not.toHaveBeenCalled();
    expect(mock.mockUpload).not.toHaveBeenCalled();
  });

  it("runs bootstrap and sets flag when is_bootstrapped is false", async () => {
    const { client, update } = createMockClientWithDb({ isBootstrapped: false });

    await ensureClientBootstrap(client, CLIENT_ID);

    expect(mock.mockList).toHaveBeenCalled();
    expect(mockBootstrapSkills).toHaveBeenCalledWith(client, CLIENT_ID);
    expect(update).toHaveBeenCalledWith({ is_bootstrapped: true });
  });

  it("does not set is_bootstrapped if bootstrap throws", async () => {
    const { client, update } = createMockClientWithDb({ isBootstrapped: false });
    mock.mockList.mockReset();
    mock.mockList.mockResolvedValueOnce({
      data: null,
      error: { message: "storage down" },
    });

    await expect(ensureClientBootstrap(client, CLIENT_ID)).rejects.toThrow("storage down");
    expect(update).not.toHaveBeenCalled();
  });

  it("throws when the UPDATE to set is_bootstrapped fails", async () => {
    const db = createMockClientWithDb({ isBootstrapped: false });
    db.setUpdateError("connection lost");

    await expect(ensureClientBootstrap(db.client, CLIENT_ID)).rejects.toThrow(
      "connection lost",
    );
  });
});
```

**Step 11: Run tests to verify they fail**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts -t "ensureClientBootstrap"
Expected: FAIL — ensureClientBootstrap is not exported yet
```

**Step 12: Implement `ensureClientBootstrap`**

In `src/lib/memory/bootstrap.ts`, add after the existing `bootstrapMemoryFiles` export:

```ts
/**
 * Durable one-time client storage initialization.
 *
 * Checks `is_bootstrapped` on the `clients` row. If false, runs the full
 * bootstrap (memory files + skills) and sets the flag. If true, returns
 * immediately — no storage calls at all.
 *
 * Call from entrypoints (chat route) BEFORE context assembly. This replaces
 * the old pattern of calling bootstrapMemoryFiles inside loadSystemPromptState.
 */
export async function ensureClientBootstrap(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { data: client, error: selectError } = await supabase
    .from("clients")
    .select("is_bootstrapped")
    .eq("client_id", clientId)
    .single();

  if (selectError) {
    throw new Error(`Failed to check bootstrap status: ${selectError.message}`);
  }

  if (client?.is_bootstrapped) {
    return;
  }

  await bootstrapMemoryFiles(supabase, clientId);

  const { error: updateError } = await supabase
    .from("clients")
    .update({ is_bootstrapped: true })
    .eq("client_id", clientId);

  if (updateError) {
    throw new Error(`Failed to mark client as bootstrapped: ${updateError.message}`);
  }
}
```

**Step 13: Run tests to verify they pass**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
Expected: ALL PASS
```

**Step 14: Commit**

```
git add src/lib/memory/bootstrap.ts src/lib/memory/__tests__/bootstrap.test.ts
git commit -m "feat(pr57): add ensureClientBootstrap with durable DB check"
```

---

## Task 4: Remove bootstrap from `loadSystemPromptState()`

**Files:**
- Modify: `src/lib/runner/context.ts` (line 22, line 294)
- Test: `src/lib/runner/__tests__/context.test.ts`
- Test: `src/lib/runner/__tests__/context-crm-config.test.ts`

**Step 15: Remove bootstrap from context.ts**

In `src/lib/runner/context.ts`:

1. Remove the import (line 22):
```ts
// DELETE:
import { bootstrapMemoryFiles } from "@/lib/memory/bootstrap";
```

2. Remove the bootstrap call from `loadSystemPromptState` (line 294). Replace:
```ts
  await bootstrapMemoryFiles(supabase, clientId);
  [memoryContext, userSkills, systemReminder, compactionState] = await Promise.all([
```
With:
```ts
  [memoryContext, userSkills, systemReminder, compactionState] = await Promise.all([
```

**Step 16: Remove bootstrap mocks from context tests**

In `src/lib/runner/__tests__/context.test.ts`:

1. Remove `mockBootstrapMemoryFiles` from the `vi.hoisted` block (line 21):
```ts
// DELETE:
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
```

2. Remove the bootstrap mock registration (lines 39-41):
```ts
// DELETE:
vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));
```

In `src/lib/runner/__tests__/context-crm-config.test.ts`:

1. Remove `mockBootstrapMemoryFiles` from the `vi.hoisted` block (line 19):
```ts
// DELETE:
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
```

2. Remove the bootstrap mock registration (lines 32-34):
```ts
// DELETE:
vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));
```

**Step 17: Run all context tests**

```
Run: npx vitest run src/lib/runner/__tests__/context.test.ts src/lib/runner/__tests__/context-crm-config.test.ts
Expected: ALL PASS
```

**Step 18: Commit**

```
git add src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts src/lib/runner/__tests__/context-crm-config.test.ts
git commit -m "refactor(pr57): remove bootstrap from loadSystemPromptState — now read-only"
```

---

## Task 5: Call `ensureClientBootstrap` from the chat route + route-level tests

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts` (fix Redis mock + add bootstrap tests)

**Step 19: Add the import and call in the chat route**

In `app/api/chat/route.ts`, add the import:

```ts
import { ensureClientBootstrap } from "@/lib/memory/bootstrap";
```

Right after `clientId = resolvedClientId;` (~line 196), fire the bootstrap promise:

```ts
    clientId = resolvedClientId;
    _t("resolve_client_id");

    // Fire bootstrap early — overlaps with CRM config check + thread lookup.
    // No-op SELECT on already-bootstrapped clients (99%+ of requests).
    const bootstrapPromise = ensureClientBootstrap(supabase, resolvedClientId);
```

Just before `runAgent()` (~line 290), await it:

```ts
    await bootstrapPromise;
    _t("ensure_bootstrap");

    _t("pre_run_agent");
```

**Step 20: Fix the Redis mock gap in chat route tests**

In `src/lib/ai/__tests__/chat-route.test.ts`, update the Redis mock (line 75-78) to include `getRedisClient`:

```ts
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  setActiveStreamId: mockSetActiveStreamId,
  clearActiveStreamId: mockClearActiveStreamId,
}));
```

**Step 21: Add bootstrap mock to chat route tests**

In `src/lib/ai/__tests__/chat-route.test.ts`:

Add `mockEnsureClientBootstrap` to the `vi.hoisted` block:

```ts
  mockEnsureClientBootstrap: vi.fn().mockResolvedValue(undefined),
```

Add the mock registration after the other mocks:

```ts
vi.mock("@/lib/memory/bootstrap", () => ({
  ensureClientBootstrap: mockEnsureClientBootstrap,
}));
```

**Step 22: Add route-level bootstrap boundary tests**

Add these tests inside the `describe("POST /api/chat")` block:

```ts
  it("returns 500 without calling runAgent when ensureClientBootstrap fails", async () => {
    mockEnsureClientBootstrap.mockRejectedValueOnce(new Error("storage down"));

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to process chat request." });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("awaits ensureClientBootstrap before calling runAgent", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { toUIMessageStream: vi.fn(() => new ReadableStream()) },
    });

    await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(mockEnsureClientBootstrap).toHaveBeenCalledWith(mockSupabase, "client-456");
    expect(mockEnsureClientBootstrap.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunAgent.mock.invocationCallOrder[0],
    );
  });
```

**Step 23: Run chat route tests**

```
Run: npx vitest run src/lib/ai/__tests__/chat-route.test.ts
Expected: ALL PASS
```

**Step 24: Commit**

```
git add app/api/chat/route.ts src/lib/ai/__tests__/chat-route.test.ts
git commit -m "feat(pr57): call ensureClientBootstrap from chat route with route-level tests"
```

---

## Task 6: Remove memory-side process cache

Now that `ensureClientBootstrap` handles the durable check, the process-local `Set<string>` cache in `bootstrap.ts` is redundant. Keep the skill-bootstrap cache untouched.

**Files:**
- Modify: `src/lib/memory/bootstrap.ts`
- Test: `src/lib/memory/__tests__/bootstrap.test.ts`

**Step 25: Remove the process cache from `bootstrap.ts`**

In `src/lib/memory/bootstrap.ts`:

1. Delete the cache Set (line 28):
```ts
// DELETE:
const bootstrappedClients = new Set<string>();
```

2. Delete the early-return check inside `bootstrapMemoryFiles` (line 64):
```ts
// DELETE:
  if (bootstrappedClients.has(clientId)) return;
```

3. Delete the cache add at the end of `bootstrapMemoryFiles` (before `bootstrapSkills` call):
```ts
// DELETE:
  bootstrappedClients.add(clientId);
```

4. Delete the reset helper:
```ts
// DELETE:
export function _resetBootstrapCache(): void {
  bootstrappedClients.clear();
}
```

**Step 26: Update bootstrap test imports and setup**

In `src/lib/memory/__tests__/bootstrap.test.ts`:

1. Remove `_resetBootstrapCache` from the import:
```ts
import { bootstrapMemoryFiles, ensureClientBootstrap } from "../bootstrap";
```

2. Remove `_resetBootstrapCache()` from both `beforeEach` blocks.

3. Delete the test "skips storage calls on warm invocations (process cache)" — that behavior no longer exists.

**Step 27: Run bootstrap tests**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
Expected: ALL PASS
```

**Step 28: Commit**

```
git add src/lib/memory/bootstrap.ts src/lib/memory/__tests__/bootstrap.test.ts
git commit -m "refactor(pr57): remove memory-side process cache — DB boolean replaces it"
```

---

## Task 7: Final verification

**Step 29: Run all affected test files**

```
Run: npx vitest run src/lib/memory/__tests__/bootstrap.test.ts src/lib/runner/__tests__/context.test.ts src/lib/runner/__tests__/context-crm-config.test.ts src/lib/ai/__tests__/chat-route.test.ts
Expected: ALL PASS
```

**Step 30: Run TypeScript type check**

```
Run: npx tsc --noEmit
Expected: PASS
```

**Step 31: Verify the key behavioral change**

Read the final state of `src/lib/runner/context.ts`:
- `loadSystemPromptState()` should have NO reference to `bootstrapMemoryFiles`
- The `Promise.all` should start immediately
- No imports from `@/lib/memory/bootstrap`
