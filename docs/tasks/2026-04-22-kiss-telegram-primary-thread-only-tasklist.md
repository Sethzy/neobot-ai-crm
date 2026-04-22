# KISS Telegram Primary-Thread-Only Implementation Plan

**Goal:** Collapse Telegram routing to the client primary thread, remove Telegram branch/override features, and surface the primary chat in the shared Chats UI without breaking existing pairings.

**Architecture:** Ship this in three passes: a code-first safety cutover, a cleanup migration, then the UI/thread-surface pass. Keep `/agent` as a thin redirect page instead of deleting the route outright, reply deterministically to removed Telegram commands, and repoint every Telegram routing artifact (`conversation_channel_mappings`, `messaging_channel_connections`, unconsumed `telegram_pairing_sessions`, and `telegram_pending_questions`) before dropping the dormant profile column.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest + React Testing Library, Supabase Postgres/RLS/Realtime, `grammy`, TanStack Query, Tailwind + shadcn/ui.

**Design Doc:** `docs/product/plans/2026-04-22-002-refactor-kiss-telegram-primary-thread-only-plan.md`

**This tasklist intentionally bakes in the skeptical review outcomes:**
- Code deploy first, cleanup migration second.
- `/new` and `/main` get a fixed deprecation reply, not LLM fall-through.
- Old pairing sessions are neutralized by resolving primary at consume time.
- Pending Telegram question batches are cleared for any chat we repoint.
- Enforce one Telegram connection per client before forcing all Telegram traffic onto the client primary thread.
- Use `Main`, not `Home`.
- Keep Telegram CTA discoverable on the primary chat surface.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Write the minimal implementation" - Step
- "Run the focused tests and make sure they pass" - Step
- "Commit" - Step

## Execution Rules

- Use `@test-driven-development` on every parent task.
- Use `@systematic-debugging` if webhook behavior, Realtime behavior, or manual Telegram smoke diverges from tests.
- Use `@nextjs-supabase-auth` when touching authenticated settings pages or auth-backed route handlers.
- Apply schema changes with Supabase MCP, not ad-hoc dashboard edits.
- Regenerate local DB types after schema changes with:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- For any Managed Agents / Telegram smoke tests, force `claude-haiku-4-5`.
- Commit after each parent task. Use the PR letters from the design doc in the commit message.

## Relevant Files

**Preflight / rollout gating**
- No code files. Use Supabase MCP `execute_sql` against the target environment.

**Code-first backend cutover**
- Modify: `app/api/webhook/telegram/route.ts`
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`
- Modify: `src/lib/channels/telegram/user-connections.ts`
- Modify: `src/lib/channels/telegram/user-connections.test.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.test.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.test.ts`
- Modify: `app/settings/profile/page.tsx`
- Delete: `app/api/settings/profile/default-messaging-thread/route.ts`
- Delete: `app/api/settings/profile/default-messaging-thread/route.test.ts`
- Delete: `src/components/settings/profile/default-messaging-agent-form.tsx`
- Delete: `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`

**Cleanup migration**
- Create: `supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts`
- Create: `supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql`
- Modify: `src/types/database.ts`

**Primary-thread rename**
- Create: `supabase/migrations/__tests__/rename-primary-thread-main.test.ts`
- Create: `supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql`
- Modify: `src/types/database.ts`

**Thread list + route + CTA UI**
- Modify: `src/lib/chat/threads.ts`
- Modify: `src/lib/chat/__tests__/threads.test.ts`
- Modify: `src/contexts/thread-context.tsx`
- Modify: `src/contexts/thread-context.test.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-sidebar-thread-actions.test.tsx`
- Modify: `src/components/layout/all-chats-popover.tsx`
- Modify: `src/components/agent/telegram-cta-banner.tsx`
- Modify: `app/(dashboard)/agent/page.tsx`
- Create: `app/(dashboard)/agent/page.test.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.test.tsx`

---

### Task 1: Run preflight safety queries and set the rollout gate

**Files:**
- Modify: none

**Step 1: Run the preflight SQL in Supabase MCP**

Use Supabase MCP `execute_sql` with this exact query:

```sql
WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
),
override_drift AS (
  SELECT up.id AS user_id
  FROM public.user_profiles AS up
  JOIN public.clients AS c
    ON c.user_id = up.id
  JOIN primary_threads AS pt
    ON pt.client_id = c.client_id
  WHERE up.default_messaging_thread_id IS NOT NULL
    AND up.default_messaging_thread_id <> pt.primary_thread_id
),
mapping_drift AS (
  SELECT m.client_id, m.external_conversation_id
  FROM public.conversation_channel_mappings AS m
  JOIN primary_threads AS pt
    ON pt.client_id = m.client_id
  WHERE m.channel = 'telegram'
    AND m.thread_id <> pt.primary_thread_id
),
connection_drift AS (
  SELECT mc.client_id, mc.user_id
  FROM public.messaging_channel_connections AS mc
  JOIN primary_threads AS pt
    ON pt.client_id = mc.client_id
  WHERE mc.channel = 'telegram'
    AND mc.target_thread_id <> pt.primary_thread_id
),
session_drift AS (
  SELECT s.client_id, s.user_id
  FROM public.telegram_pairing_sessions AS s
  JOIN primary_threads AS pt
    ON pt.client_id = s.client_id
  WHERE s.consumed_at IS NULL
    AND s.target_thread_id <> pt.primary_thread_id
),
multi_user_clients AS (
  SELECT client_id, COUNT(*) AS telegram_connection_count
  FROM public.messaging_channel_connections
  WHERE channel = 'telegram'
  GROUP BY client_id
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM public.user_profiles WHERE default_messaging_thread_id IS NOT NULL) AS override_set_count,
  (SELECT COUNT(*) FROM override_drift) AS override_drift_count,
  (SELECT COUNT(*) FROM mapping_drift) AS mapping_drift_count,
  (SELECT COUNT(*) FROM connection_drift) AS connection_drift_count,
  (SELECT COUNT(*) FROM session_drift) AS session_drift_count,
  (SELECT COUNT(*) FROM multi_user_clients) AS multi_user_client_count;
```

**Step 2: Record the gate outcome**

Expected:
- `multi_user_client_count = 0`
- Every other drift count can be non-zero; those are what the cleanup migration will fix

**Step 3: Stop immediately if the rollout gate is red**

If `multi_user_client_count > 0`, do not implement the forced-primary cutover yet.

Reason:
- `deliverToExternalChannels()` fans out by `conversation_channel_mappings.thread_id`
- if multiple users on one client are paired, forcing all Telegram traffic onto the client primary thread will leak replies across users

**Step 4: Paste the counts into the PR A description**

Include:
- `override_set_count`
- `override_drift_count`
- `mapping_drift_count`
- `connection_drift_count`
- `session_drift_count`
- `multi_user_client_count`

No commit for this task.

---

### Task 2: Ship the code-first backend cutover before touching the schema

**Files:**
- Modify: `app/api/webhook/telegram/route.ts`
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`
- Modify: `src/lib/channels/telegram/user-connections.ts`
- Modify: `src/lib/channels/telegram/user-connections.test.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.ts`
- Modify: `src/lib/settings/profile/messaging-preferences.test.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.ts`
- Modify: `app/api/telegram/generate-pairing-link/route.test.ts`
- Modify: `app/settings/profile/page.tsx`
- Delete: `app/api/settings/profile/default-messaging-thread/route.ts`
- Delete: `app/api/settings/profile/default-messaging-thread/route.test.ts`
- Delete: `src/components/settings/profile/default-messaging-agent-form.tsx`
- Delete: `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`

**Step 1: Add the failing webhook and pairing tests**

Extend `app/api/webhook/telegram/__tests__/route.test.ts` with these cases:

```typescript
it("replies with the fixed deprecation copy for /new and does not mutate routing", async () => {
  const response = await POST(createRequest({
    update_id: 700,
    message: {
      message_id: 70,
      text: "/new",
      chat: { id: 12345, type: "private" },
      from: { id: 7, is_bot: false, first_name: "Seth" },
    },
  }));

  expect(response.status).toBe(200);
  expect(api.sendMessage).toHaveBeenCalledWith(
    12345,
    "That command was removed. Open Sunder on web and use New Task.",
    expect.anything(),
  );
  expect(supabase.records.inserts.some((insert) => insert.table === "conversation_threads")).toBe(false);
  expect(mockUpdateTelegramConnectionTargetThread).not.toHaveBeenCalled();
});

it("pairs stale sessions onto the current primary thread instead of the stored session target", async () => {
  mockFindTelegramPairingSession.mockResolvedValue({
    clientId: "client-1",
    consumedAt: null,
    createdAt: "2026-04-21T00:00:00.000Z",
    deepLinkToken: "pair-token-123",
    displayCode: "GW-22E14A",
    expiresAt: "2099-03-20T20:10:00.000Z",
    id: "session-1",
    targetThreadId: "old-branch-thread",
    userId: "user-1",
  });

  // mock primary-thread lookup to return primary-thread-1
  // assert upsertTelegramChannelMapping uses primary-thread-1, not old-branch-thread
});
```

Extend `app/api/telegram/generate-pairing-link/route.test.ts` with:

```typescript
it("always resolves the primary thread and never writes a per-user override", async () => {
  const response = await POST(new Request("http://localhost/api/telegram/generate-pairing-link", {
    method: "POST",
  }));

  expect(response.status).toBe(200);
  expect(mockCreateTelegramPairingSession).toHaveBeenCalledWith(
    supabase,
    expect.objectContaining({ targetThreadId: "thread-primary" }),
  );
});
```

Add a user-connections test for the new per-client guard:

```typescript
it("loads the existing Telegram connection for a client", async () => {
  const connection = await getTelegramConnectionForClient(supabase as never, "client-1");
  expect(connection?.clientId).toBe("client-1");
});
```

**Step 2: Run the focused tests and confirm they fail**

Run:

```bash
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts app/api/telegram/generate-pairing-link/route.test.ts src/lib/channels/telegram/user-connections.test.ts src/lib/settings/profile/messaging-preferences.test.ts
```

Expected:
- FAIL because `/new` and `/main` still branch
- FAIL because pairing still trusts `pairingSession.targetThreadId`
- FAIL because the default-thread profile code still exists

**Step 3: Replace Telegram branching with a fixed deprecation reply**

In `app/api/webhook/telegram/route.ts`:

```typescript
const REMOVED_TELEGRAM_COMMAND_REPLY =
  "That command was removed. Open Sunder on web and use New Task.";

async function handleRemovedCommand(
  ctx: TelegramWebhookContext,
  message: Record<string, unknown>,
): Promise<void> {
  const { numericChatId } = extractChatId(message);
  await sendPlainTelegramMessage(ctx.bot, numericChatId, REMOVED_TELEGRAM_COMMAND_REPLY);
}
```

Then replace the `/new` and `/main` branches in `processUpdate()` with:

```typescript
if (command?.command === "/new" || command?.command === "/main") {
  await handleRemovedCommand(ctx, update.message);
  return;
}
```

Delete `handleNewCommand()` and `handleMainCommand()` entirely.

**Step 4: Neutralize stale pairing sessions and enforce one Telegram connection per client**

In `src/lib/channels/telegram/user-connections.ts`, add:

```typescript
export async function getTelegramConnectionForClient(
  supabase: TelegramSupabaseClient,
  clientId: string,
): Promise<TelegramConnection | null> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapConnection(data as TelegramConnectionRow) : null;
}
```

In `pairTelegramChat()`:
- load `const primaryThread = await getPrimaryThread(ctx.supabase, pairingSession.clientId);`
- if missing, reply `"Primary thread not found."`
- use `primaryThread.thread_id` for both `upsertTelegramConnection()` and `upsertTelegramChannelMapping()`
- reject pairing if another user on the same client already has a Telegram connection

The critical write should look like:

```typescript
await upsertTelegramConnection(ctx.supabase, {
  clientId: pairingSession.clientId,
  externalConversationId: chatId,
  targetThreadId: primaryThread.thread_id,
  userId: pairingSession.userId,
});

await upsertTelegramChannelMapping(ctx.supabase, {
  chatId,
  clientId: pairingSession.clientId,
  threadId: primaryThread.thread_id,
});
```

**Step 5: Make default-thread resolution primary-only in code, but leave the column in place for one deploy**

In `src/lib/settings/profile/messaging-preferences.ts`, reduce the file to the one helper the app still needs:

```typescript
export async function getDefaultMessagingThreadForUser(
  supabase: MessagingPreferencesSupabaseClient,
  input: { clientId: string; userId: string },
): Promise<string> {
  void input.userId;
  const primaryThread = await getPrimaryThread(supabase, input.clientId);
  if (!primaryThread) {
    throw new Error("Primary thread not found.");
  }
  return primaryThread.thread_id;
}
```

Delete:
- `ensureUserProfile()`
- `listAvailableMessagingThreads()`
- `saveDefaultMessagingThreadForUser()`

**Step 6: Delete the profile override surface**

Delete:
- `app/api/settings/profile/default-messaging-thread/route.ts`
- `app/api/settings/profile/default-messaging-thread/route.test.ts`
- `src/components/settings/profile/default-messaging-agent-form.tsx`
- `src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx`

Update `app/settings/profile/page.tsx` so it renders only `TelegramConnectRow` and simpler copy:

```tsx
<PageHeader
  title="Profile"
  description="Manage your personal Telegram connection for the main Sunder chat."
  descriptionClassName="max-w-3xl"
/>
```

Remove the default-thread data load entirely.

**Step 7: Run the focused tests again**

Run:

```bash
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts app/api/telegram/generate-pairing-link/route.test.ts src/lib/channels/telegram/user-connections.test.ts src/lib/settings/profile/messaging-preferences.test.ts
```

Expected: PASS

**Step 8: Commit**

```bash
git add app/api/webhook/telegram/route.ts app/api/webhook/telegram/__tests__/route.test.ts src/lib/channels/telegram/user-connections.ts src/lib/channels/telegram/user-connections.test.ts src/lib/settings/profile/messaging-preferences.ts src/lib/settings/profile/messaging-preferences.test.ts app/api/telegram/generate-pairing-link/route.ts app/api/telegram/generate-pairing-link/route.test.ts app/settings/profile/page.tsx
git rm app/api/settings/profile/default-messaging-thread/route.ts app/api/settings/profile/default-messaging-thread/route.test.ts src/components/settings/profile/default-messaging-agent-form.tsx src/components/settings/profile/__tests__/default-messaging-agent-form.test.tsx
git commit -m "refactor(prA): cut Telegram to primary-only code path"
```

---

### Task 3: Run the cleanup migration that repoints all Telegram routing state and drops the dormant column

**Files:**
- Create: `supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts`
- Create: `supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing migration contract test**

Create `supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql",
);

describe("telegram primary-thread-only cutover migration", () => {
  it("repoints mappings, connections, pairing sessions, and clears pending question rows", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("DELETE FROM public.telegram_pending_questions");
    expect(sql).toContain("UPDATE public.conversation_channel_mappings");
    expect(sql).toContain("UPDATE public.messaging_channel_connections");
    expect(sql).toContain("UPDATE public.telegram_pairing_sessions");
    expect(sql).toContain("DROP COLUMN IF EXISTS default_messaging_thread_id");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_connections_client_telegram_unique");
  });
});
```

**Step 2: Run the migration contract test and verify it fails**

Run:

```bash
pnpm test:run supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts
```

Expected: FAIL because the migration file does not exist yet.

**Step 3: Write the cleanup migration**

Create `supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql`:

```sql
WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
),
affected_telegram_chats AS (
  SELECT DISTINCT m.external_conversation_id AS chat_id
  FROM public.conversation_channel_mappings AS m
  JOIN primary_threads AS pt
    ON pt.client_id = m.client_id
  WHERE m.channel = 'telegram'
    AND m.thread_id <> pt.primary_thread_id

  UNION

  SELECT DISTINCT mc.external_conversation_id AS chat_id
  FROM public.messaging_channel_connections AS mc
  JOIN primary_threads AS pt
    ON pt.client_id = mc.client_id
  WHERE mc.channel = 'telegram'
    AND mc.target_thread_id <> pt.primary_thread_id
)
DELETE FROM public.telegram_pending_questions AS pq
USING affected_telegram_chats AS chats
WHERE pq.chat_id = chats.chat_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.conversation_channel_mappings AS m
SET thread_id = pt.primary_thread_id
FROM primary_threads AS pt
WHERE m.channel = 'telegram'
  AND m.client_id = pt.client_id
  AND m.thread_id <> pt.primary_thread_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.messaging_channel_connections AS mc
SET
  target_thread_id = pt.primary_thread_id,
  updated_at = now()
FROM primary_threads AS pt
WHERE mc.channel = 'telegram'
  AND mc.client_id = pt.client_id
  AND mc.target_thread_id <> pt.primary_thread_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.telegram_pairing_sessions AS s
SET target_thread_id = pt.primary_thread_id
FROM primary_threads AS pt
WHERE s.client_id = pt.client_id
  AND s.consumed_at IS NULL
  AND s.target_thread_id <> pt.primary_thread_id;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_default_messaging_thread_id_fkey;

DROP INDEX IF EXISTS idx_user_profiles_default_messaging_thread_id;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS default_messaging_thread_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_connections_client_telegram_unique
  ON public.messaging_channel_connections (client_id)
  WHERE channel = 'telegram';
```

**Step 4: Apply the migration with Supabase MCP**

Use Supabase MCP `apply_migration` with:
- `name`: `telegram_primary_thread_only_cutover`
- `query`: the SQL above

Do not deploy this migration before Task 2 code is live.

**Step 5: Verify the cleanup with one SQL read**

Use Supabase MCP `execute_sql`:

```sql
WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
SELECT
  EXISTS (
    SELECT 1
    FROM public.conversation_channel_mappings AS m
    JOIN primary_threads AS pt
      ON pt.client_id = m.client_id
    WHERE m.channel = 'telegram'
      AND m.thread_id <> pt.primary_thread_id
  ) AS has_mapping_drift,
  EXISTS (
    SELECT 1
    FROM public.messaging_channel_connections AS mc
    JOIN primary_threads AS pt
      ON pt.client_id = mc.client_id
    WHERE mc.channel = 'telegram'
      AND mc.target_thread_id <> pt.primary_thread_id
  ) AS has_connection_drift,
  EXISTS (
    SELECT 1
    FROM public.telegram_pairing_sessions AS s
    JOIN primary_threads AS pt
      ON pt.client_id = s.client_id
    WHERE s.consumed_at IS NULL
      AND s.target_thread_id <> pt.primary_thread_id
  ) AS has_session_drift,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'default_messaging_thread_id'
  ) AS override_column_still_exists;
```

Expected:
- every boolean is `false`

**Step 6: Regenerate local types and rerun the contract test**

Run:

```bash
npx supabase gen types typescript --local > src/types/database.ts
pnpm test:run supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql src/types/database.ts
git commit -m "refactor(prA): repoint Telegram routing state to primary"
```

---

### Task 4: Rename the primary thread from Agent to Main

**Files:**
- Create: `supabase/migrations/__tests__/rename-primary-thread-main.test.ts`
- Create: `supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing migration contract test**

Create `supabase/migrations/__tests__/rename-primary-thread-main.test.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql",
);

describe("rename primary thread to Main", () => {
  it("updates existing primary rows and future bootstrap writes", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("UPDATE public.conversation_threads");
    expect(sql).toContain("SET title = 'Main'");
    expect(sql).toContain("VALUES (p_client_id, 'Main', true, true)");
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test:run supabase/migrations/__tests__/rename-primary-thread-main.test.ts
```

Expected: FAIL because the migration file does not exist yet.

**Step 3: Write the rename migration**

Create `supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql`:

```sql
UPDATE public.conversation_threads
SET title = 'Main'
WHERE is_primary = true
  AND title IN ('Agent', 'Home');
```

Then, in the same migration file, copy the current body of `public.ensure_autopilot_for_client()` from:

```text
supabase/migrations/20260323100001_update_bootstrap_for_primary_thread.sql
```

Replace every primary-thread title write from `'Agent'` to `'Main'`. Do not edit the old migration file in place.

**Step 4: Apply, regenerate types, and rerun the test**

Use Supabase MCP `apply_migration`, then run:

```bash
npx supabase gen types typescript --local > src/types/database.ts
pnpm test:run supabase/migrations/__tests__/rename-primary-thread-main.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/__tests__/rename-primary-thread-main.test.ts supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql src/types/database.ts
git commit -m "refactor(prB): rename primary thread to Main"
```

---

### Task 5: Surface the primary thread in the shared Chats UI and keep `/agent` as a redirect

**Files:**
- Modify: `src/lib/chat/threads.ts`
- Modify: `src/lib/chat/__tests__/threads.test.ts`
- Modify: `src/contexts/thread-context.tsx`
- Modify: `src/contexts/thread-context.test.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-sidebar-thread-actions.test.tsx`
- Modify: `src/components/layout/all-chats-popover.tsx`
- Modify: `src/components/agent/telegram-cta-banner.tsx`
- Modify: `app/(dashboard)/agent/page.tsx`
- Create: `app/(dashboard)/agent/page.test.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.tsx`
- Modify: `app/(dashboard)/chat/[threadId]/page.test.tsx`

**Step 1: Add the failing thread-list, redirect, and CTA tests**

In `src/lib/chat/__tests__/threads.test.ts`, replace the old primary-filter assertion with:

```typescript
test("orders primary first, then pinned, then updated_at desc", async () => {
  const client = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  await listThreads(client as never, "client-1");

  const eqCalls = client.calls.methods.filter((c) => c.method === "eq");
  expect(eqCalls).not.toContainEqual({ method: "eq", args: ["is_primary", false] });

  const orderCalls = client.calls.methods.filter((c) => c.method === "order");
  expect(orderCalls).toContainEqual({ method: "order", args: ["is_primary", { ascending: false }] });
  expect(orderCalls).toContainEqual({ method: "order", args: ["is_pinned", { ascending: false }] });
  expect(orderCalls).toContainEqual({ method: "order", args: ["updated_at", { ascending: false }] });
});
```

Create `app/(dashboard)/agent/page.test.tsx`:

```typescript
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AgentPage from "./page";

const mockCreateClient = vi.fn();
const mockResolveClientId = vi.fn();
const mockGetPrimaryThread = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId: (...args: unknown[]) => mockResolveClientId(...args) }));
vi.mock("@/lib/chat/threads", () => ({ getPrimaryThread: (...args: unknown[]) => mockGetPrimaryThread(...args) }));

describe("/agent redirect page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to the primary chat route", async () => {
    mockCreateClient.mockResolvedValue({});
    mockResolveClientId.mockResolvedValue("client-1");
    mockGetPrimaryThread.mockResolvedValue({ thread_id: "thread-primary" });

    const element = await AgentPage();
    expect(element).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/chat/thread-primary");
  });
});
```

In `app/(dashboard)/chat/[threadId]/page.test.tsx`, add a case:

```typescript
it("renders the Telegram CTA banner for the primary thread when Telegram is not connected", async () => {
  // mock thread row as { thread_id: VALID_THREAD_ID, is_primary: true }
  // mock supabase auth.getUser and messaging_channel_connections maybeSingle() => null
  // expect screen.getByText(/Connect Telegram to message your main Sunder chat from your phone/i)
});
```

**Step 2: Run the focused tests and confirm they fail**

Run:

```bash
pnpm test:run src/lib/chat/__tests__/threads.test.ts app/\(dashboard\)/chat/\[threadId\]/page.test.tsx app/\(dashboard\)/agent/page.test.tsx src/components/layout/app-sidebar-thread-actions.test.tsx
```

Expected:
- FAIL because `listThreads()` still filters primary out
- FAIL because `/agent` still renders the old page
- FAIL because the shared chat page does not render the CTA banner for the primary thread

**Step 3: Change the thread query and thread-context mapping**

In `src/lib/chat/threads.ts`, make the list query:

```typescript
const { data, error } = await supabase
  .from("conversation_threads")
  .select("*")
  .eq("client_id", clientId)
  .eq("is_archived", false)
  .order("is_primary", { ascending: false })
  .order("is_pinned", { ascending: false })
  .order("updated_at", { ascending: false });
```

Keep `ThreadProvider` mapping `isPrimary: thread.is_primary` as-is and update `src/contexts/thread-context.test.tsx` to assert the primary flag is hydrated.

**Step 4: Update the chat rail and popover icon branches**

In both `src/components/layout/app-sidebar.tsx` and `src/components/layout/all-chats-popover.tsx`, use the same icon branch:

```tsx
const iconName =
  thread.sourceType === "automation_run"
    ? "automations"
    : thread.isPrimary
      ? "home"
      : "chat";
```

Also:
- remove `{ label: "Agent", href: "/agent", icon: "agent" }` from `primaryNavItems`
- keep archive actions hidden for any pinned thread

**Step 5: Replace the old `/agent` page with a redirect stub**

Overwrite `app/(dashboard)/agent/page.tsx` so it only redirects:

```tsx
import { redirect } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getPrimaryThread } from "@/lib/chat/threads";
import { createClient } from "@/lib/supabase/server";

export default async function AgentPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const primaryThread = await getPrimaryThread(supabase, clientId);

  redirect(primaryThread ? `/chat/${primaryThread.thread_id}` : "/chat");
}
```

**Step 6: Keep the Telegram CTA discoverable on the primary chat route**

Update `src/components/agent/telegram-cta-banner.tsx` copy:

```tsx
<p>
  Connect Telegram to message your main Sunder chat from your phone.
  Pair it once from your profile settings.
</p>
```

Update `app/(dashboard)/chat/[threadId]/page.tsx`:
- select `thread_id, is_primary` instead of only `thread_id`
- load the authenticated user
- read `messaging_channel_connections` for `user_id + channel = telegram`
- render `TelegramCtaBanner` only when `thread.is_primary === true` and the user has no Telegram connection

The render shape should become:

```tsx
<>
  {thread.is_primary && !telegramConnection ? <TelegramCtaBanner /> : null}
  <ChatThreadPageClient ... />
  <DataStreamHandler />
</>
```

**Step 7: Run the focused tests again**

Run:

```bash
pnpm test:run src/lib/chat/__tests__/threads.test.ts app/\(dashboard\)/chat/\[threadId\]/page.test.tsx app/\(dashboard\)/agent/page.test.tsx src/components/layout/app-sidebar-thread-actions.test.tsx src/contexts/thread-context.test.tsx
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/lib/chat/threads.ts src/lib/chat/__tests__/threads.test.ts src/contexts/thread-context.tsx src/contexts/thread-context.test.tsx src/components/layout/app-sidebar.tsx src/components/layout/app-sidebar-thread-actions.test.tsx src/components/layout/all-chats-popover.tsx src/components/agent/telegram-cta-banner.tsx app/\(dashboard\)/agent/page.tsx app/\(dashboard\)/agent/page.test.tsx app/\(dashboard\)/chat/\[threadId\]/page.tsx app/\(dashboard\)/chat/\[threadId\]/page.test.tsx
git commit -m "refactor(prC): surface Main thread in chats rail"
```

---

### Task 6: Run final verification and close the rollout

**Files:**
- Modify: none

**Step 1: Run the focused regression suite**

Run:

```bash
pnpm test:run app/api/webhook/telegram/__tests__/route.test.ts app/api/telegram/generate-pairing-link/route.test.ts src/lib/channels/telegram/user-connections.test.ts src/lib/settings/profile/messaging-preferences.test.ts supabase/migrations/__tests__/telegram-primary-thread-only-cutover.test.ts supabase/migrations/__tests__/rename-primary-thread-main.test.ts src/lib/chat/__tests__/threads.test.ts app/\(dashboard\)/chat/\[threadId\]/page.test.tsx app/\(dashboard\)/agent/page.test.tsx src/contexts/thread-context.test.tsx
```

Expected: PASS

**Step 2: Run typecheck and lint**

Run:

```bash
pnpm exec tsc --noEmit
pnpm lint
```

Expected:
- both commands exit `0`

**Step 3: Verify that no UI surface still links to the old `/agent` route**

Run:

```bash
rg -n 'href="/agent"|href={"/agent"}|redirect\\("/agent"|redirect\\(`/agent|\"/agent\"' app src
```

Expected:
- only the redirect stub at `app/(dashboard)/agent/page.tsx`
- ignore storage-path references like `/agent/...` used for durable files

**Step 4: Run the manual smoke**

Checklist:
1. Open the web app and confirm the `Main` thread is first in Chats.
2. Confirm the `Agent` primary-nav item is gone.
3. Open `/agent` directly and confirm it lands on `/chat/<primary_thread_id>`.
4. On the `Main` thread, with Telegram disconnected, confirm the banner is visible and links to `/settings/profile`.
5. Pair Telegram from Profile.
6. Send a Telegram message and confirm it lands in `Main`.
7. Type `/new` in Telegram and confirm the bot replies: `That command was removed. Open Sunder on web and use New Task.`
8. Confirm the thread mapping does not change after `/new`.
9. Create a web-only `New Task` thread and confirm it does not receive Telegram delivery.
10. If you run an agent turn during this smoke, set the model to `claude-haiku-4-5`.

**Step 5: Commit the verification-only closeout if needed**

```bash
git add -A
git commit -m "refactor(prC): verify Telegram primary-thread-only rollout"
```

Skip this commit if there are no code changes after verification.

