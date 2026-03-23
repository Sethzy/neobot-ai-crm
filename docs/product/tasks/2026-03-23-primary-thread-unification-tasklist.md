# Primary Thread Unification Implementation Plan

**PR:** Out-of-plan — Agent page + primary thread (Manus pattern)
**Goal:** Unify autopilot, Telegram, and web chat into one primary thread accessed via a new `/agent` page, so the user has a single home for their persistent assistant.

**Architecture:** Add `is_primary` boolean column to `conversation_threads` with a partial unique index (one primary per client). Rename "Sunder Autopilot" to "Agent" and mark it `is_primary = true`. Create `/agent` page that always shows the primary thread chat (reuse existing `ChatPanel`), with an inline Telegram CTA banner when not yet paired — no Telegram gate, "the first conversation IS the product." Telegram pairing routes to primary thread instead of creating a new one. Sidebar: add "Agent" nav item, rename "Chat" to "New Task", filter primary thread from SESSIONS list. Add `/main` Telegram command to switch back to primary thread.

**Review corrections applied:**
1. **No Telegram gate** — `/agent` always shows the primary thread chat immediately. Telegram pairing is an inline banner/CTA, not a blocking onboarding screen. Rationale: "the first conversation IS the product" (PR 38 onboarding principle). The Manus deploy gate was over-copied from the design doc.
2. **Trigger-based backfill** — migration derives primary thread from `agent_triggers.trigger_type = 'pulse'` (the canonical source) instead of fragile title matching. Falls back to title match only if no trigger exists.

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres migration), React, Tailwind, shadcn, Vitest

**Design doc:** `roadmap docs/Sunder - Source of Truth/references/deepagents/04-primary-thread-unification-design-doc.md`

**Prerequisite:** Runner unification (Doc 03) — already shipped.

---

## Relevant Files

**Create:**
- `supabase/migrations/20260323100000_add_thread_is_primary.sql` — migration
- `app/(dashboard)/agent/page.tsx` — Agent page (server component, always shows primary thread)
- `src/components/agent/telegram-cta-banner.tsx` — inline banner when Telegram not connected

**Modify:**
- `src/types/database.ts` — add `is_primary` to thread types (regenerate)
- `src/types/chat.ts` — add `isPrimary` to Thread interface
- `src/lib/chat/threads.ts` — add `getPrimaryThread()`, update `listThreads()` filter
- `src/contexts/thread-context.tsx:128-137` — map `is_primary` to `isPrimary`
- `src/components/layout/app-sidebar.tsx:48-54` — add Agent nav, rename Chat to New Task
- `src/components/layout/app-sidebar.tsx:203` — filter primary from SESSIONS
- `src/components/icons/app-icons.tsx` — add `agent` and `compose` icon names
- `src/lib/autopilot/constants.ts:8` — rename `AUTOPILOT_THREAD_TITLE` to `PRIMARY_THREAD_TITLE`
- `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql:101-103` — create with `is_primary = true`, `title = 'Agent'`
- `app/api/webhook/telegram/route.ts:266-298` — pairing: look up primary thread
- `app/api/webhook/telegram/route.ts` — add `/main` command handler

**Test:**
- `src/lib/chat/__tests__/threads.test.ts` — test `getPrimaryThread()` and filtered listing
- `src/lib/runner/__tests__/run-autopilot.test.ts` — no changes needed (wrapper doesn't care about thread)
- `app/api/webhook/telegram/__tests__/telegram-commands.test.ts` — test `/main` command + pairing-to-primary

**No changes needed:**
- `src/lib/runner/run-autopilot.ts` — wrapper delegates to `runAgent`, doesn't touch thread lookup
- `src/lib/channels/deliver.ts` — queries mappings by `thread_id`, works automatically
- `app/(dashboard)/chat/page.tsx` — stays as-is, becomes "New Task" by label change only
- `app/(dashboard)/chat/[threadId]/page.tsx` — renders any thread by ID, unchanged

---

### Task 1: Add `is_primary` column migration

**Files:**
- Create: `supabase/migrations/20260323100000_add_thread_is_primary.sql`

**Context:** The `conversation_threads` table needs an `is_primary` boolean column. A partial unique index ensures at most one primary thread per client. Existing autopilot threads get migrated to `is_primary = true` and renamed to "Agent". The backfill uses `agent_triggers.trigger_type = 'pulse'` as the canonical source (more reliable than title matching), with a title-based fallback for edge cases.

**Step 1: Write the migration SQL**

Create `supabase/migrations/20260323100000_add_thread_is_primary.sql`:

```sql
-- Add is_primary column to conversation_threads.
-- One primary thread per client (the persistent main session).
ALTER TABLE conversation_threads
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- Backfill: derive primary thread from pulse trigger (canonical source),
-- then fall back to title match for clients without a trigger.
UPDATE conversation_threads ct
SET is_primary = true, title = 'Agent'
FROM agent_triggers at
WHERE at.thread_id = ct.thread_id
  AND at.trigger_type = 'pulse';

-- Fallback: title-based match for any remaining unpaired autopilot threads.
UPDATE conversation_threads
SET is_primary = true, title = 'Agent'
WHERE title = 'Sunder Autopilot'
  AND is_pinned = true
  AND is_primary = false;

-- Ensure at most one primary per client (partial unique index).
-- Created AFTER backfill to avoid conflicts during migration.
CREATE UNIQUE INDEX idx_conversation_threads_primary
  ON conversation_threads (client_id)
  WHERE is_primary = true;
```

**Step 2: Apply the migration locally**

```bash
npx supabase db reset
```

Or if using remote:
```bash
npx supabase migration up --local
```

Expected: Migration applies without error. Existing "Sunder Autopilot" threads become primary with title "Agent".

**Step 3: Regenerate database types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Verify `is_primary` appears in the `conversation_threads` Row/Insert/Update types.

**Step 4: Commit**

```bash
git add supabase/migrations/20260323100000_add_thread_is_primary.sql src/types/database.ts
git commit -m "feat(primary-thread): add is_primary column to conversation_threads"
```

---

### Task 2: Update bootstrap to create primary thread

**Files:**
- Modify: `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql:95-110`
- Modify: `src/lib/autopilot/constants.ts:8`

**Context:** The bootstrap function creates "Sunder Autopilot" threads for new signups. It needs to create "Agent" threads with `is_primary = true` instead. The `AUTOPILOT_THREAD_TITLE` constant changes to match.

**Step 1: Update the bootstrap SQL**

In `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql`, change three places:

Line 95 — thread lookup fallback:
```sql
-- Change:
      AND title = 'Sunder Autopilot'
-- To:
      AND (title = 'Agent' OR title = 'Sunder Autopilot')
```

Lines 101-103 — thread creation:
```sql
-- Change:
    INSERT INTO public.conversation_threads (client_id, title, is_pinned)
    VALUES (p_client_id, 'Sunder Autopilot', true)
-- To:
    INSERT INTO public.conversation_threads (client_id, title, is_pinned, is_primary)
    VALUES (p_client_id, 'Agent', true, true)
```

Line 109 — thread restoration:
```sql
-- Change:
      title = COALESCE(title, 'Sunder Autopilot')
-- To:
      title = 'Agent',
      is_primary = true
```

**Step 2: Rename the constant**

In `src/lib/autopilot/constants.ts`, change line 8:

```typescript
// Change:
export const AUTOPILOT_THREAD_TITLE = "Sunder Autopilot";
// To:
export const PRIMARY_THREAD_TITLE = "Agent";
```

**Step 3: Find and update all references to `AUTOPILOT_THREAD_TITLE`**

```bash
npx grep -r "AUTOPILOT_THREAD_TITLE" src/
```

Update any imports/usages to use `PRIMARY_THREAD_TITLE`.

**Step 4: Apply migration reset and verify**

```bash
npx supabase db reset
```

Expected: New clients get a thread with `title = 'Agent'`, `is_pinned = true`, `is_primary = true`.

**Step 5: Commit**

```bash
git add supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql src/lib/autopilot/constants.ts
git commit -m "feat(primary-thread): bootstrap creates Agent primary thread"
```

---

### Task 3: Add `getPrimaryThread()` and filter primary from listing

**Files:**
- Modify: `src/lib/chat/threads.ts:44-56`
- Create or Modify: `src/lib/chat/__tests__/threads.test.ts`
- Modify: `src/types/chat.ts:8-13`

**Context:** The thread listing (`listThreads`) currently returns ALL non-archived threads including the pinned autopilot thread. The sidebar SESSIONS section should only show task threads (not primary). We also need a `getPrimaryThread()` query for the Agent page.

**Step 1: Write the failing test for `getPrimaryThread`**

Add to or create `src/lib/chat/__tests__/threads.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));
mockSelect.mockReturnValue({ eq: mockEq });

describe("getPrimaryThread", () => {
  it("queries for the primary thread of a client", async () => {
    const mockThread = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Agent",
      is_primary: true,
      is_pinned: true,
      is_archived: false,
    };
    mockEq.mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockThread, error: null }) }) });

    const { getPrimaryThread } = await import("../threads");
    const result = await getPrimaryThread(mockFrom as never, "client-1");

    expect(result).toEqual(mockThread);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/chat/__tests__/threads.test.ts --reporter=verbose
```

Expected: FAIL — `getPrimaryThread` is not exported.

**Step 3: Implement `getPrimaryThread`**

Add to `src/lib/chat/threads.ts` after line 95 (after `getThread`):

```typescript
/**
 * Loads the primary thread for a client, or null if none exists.
 */
export async function getPrimaryThread(
  supabase: ChatSupabaseClient,
  clientId: string,
): Promise<ThreadRow | null> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/chat/__tests__/threads.test.ts --reporter=verbose
```

Expected: PASS

**Step 5: Write the failing test for filtered listing**

Add a test that verifies `listThreads` excludes primary threads:

```typescript
describe("listThreads", () => {
  it("excludes primary threads from the listing", async () => {
    // Test should verify the query includes is_primary = false filter
    // This is a characterization test — will pass after we add the filter
  });
});
```

**Step 6: Update `listThreads` to filter out primary**

In `src/lib/chat/threads.ts`, line 49, add a filter:

```typescript
// Change:
    .eq("is_archived", false)
// To:
    .eq("is_archived", false)
    .eq("is_primary", false)
```

**Step 7: Add `isPrimary` to the Thread interface**

In `src/types/chat.ts`, add `isPrimary` to the Thread interface:

```typescript
export interface Thread {
  id: string;
  title: string;
  isPinned: boolean;
  isPrimary: boolean;
  createdAt: Date;
}
```

**Step 8: Update thread context mapping**

In `src/contexts/thread-context.tsx`, line 130-135, add `isPrimary`:

```typescript
// Change:
      threadRows.map((thread) => ({
        id: thread.thread_id,
        title: thread.title ?? "New Chat",
        isPinned: thread.is_pinned,
        createdAt: new Date(thread.created_at),
      })),
// To:
      threadRows.map((thread) => ({
        id: thread.thread_id,
        title: thread.title ?? "New Chat",
        isPinned: thread.is_pinned,
        isPrimary: thread.is_primary,
        createdAt: new Date(thread.created_at),
      })),
```

**Step 9: Run all tests**

```bash
npx vitest run src/lib/chat/ --reporter=verbose
```

Expected: ALL PASS

**Step 10: Commit**

```bash
git add src/lib/chat/threads.ts src/lib/chat/__tests__/threads.test.ts src/types/chat.ts src/contexts/thread-context.tsx
git commit -m "feat(primary-thread): add getPrimaryThread query and filter primary from listing"
```

---

### Task 4: Sidebar — add Agent nav item, rename Chat to New Task

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx:48-54,203`
- Modify: `src/components/icons/app-icons.tsx`

**Context:** The sidebar AGENT section currently starts with "Chat". We need to add "Agent" as the first item (pointing to `/agent`) and rename "Chat" to "New Task" with a compose icon. The SESSIONS section already won't show the primary thread (filtered in Task 3).

**Step 1: Add icon names to app-icons**

In `src/components/icons/app-icons.tsx`, add two new entries to the `appIcons` object (before `area: MapPinIcon`):

```typescript
  agent: BotMessageSquareIcon,
  compose: PenLineIcon,
```

These icons already exist in the imports (`BotMessageSquareIcon` at line 49, `PenLineIcon` at line 60).

**Step 2: Update sidebar nav items**

In `src/components/layout/app-sidebar.tsx`, change lines 48-54:

```typescript
// Change:
const agentNavItems: NavigationItem[] = [
  { label: "Chat", href: "/chat", icon: "chat" },
  { label: "Skills", href: "/skills", icon: "document" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Automations", href: "/automations", icon: "automations" },
  { label: "Memory", href: "/memory", icon: "memory" },
];

// To:
const agentNavItems: NavigationItem[] = [
  { label: "Agent", href: "/agent", icon: "agent" },
  { label: "New Task", href: "/chat", icon: "compose" },
  { label: "Skills", href: "/skills", icon: "document" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Automations", href: "/automations", icon: "automations" },
  { label: "Memory", href: "/memory", icon: "memory" },
];
```

**Step 3: Verify the active state logic**

Check `src/components/layout/app-sidebar.tsx:126-129` — the `isActive` check uses `pathname.startsWith(item.href)`. Since `/agent` and `/chat` don't overlap, this works without changes. Verify by reading the `renderNavItems` function.

**Step 4: Run the app locally and verify sidebar visually**

```bash
npm run dev
```

Navigate to `/agent` and verify:
- "Agent" nav item is highlighted
- "New Task" shows in the sidebar pointing to `/chat`
- SESSIONS list doesn't show the primary/Agent thread

**Step 5: Commit**

```bash
git add src/components/icons/app-icons.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(primary-thread): add Agent nav item, rename Chat to New Task"
```

---

### Task 5: Create the Agent page

**Files:**
- Create: `app/(dashboard)/agent/page.tsx`
- Create: `src/components/agent/telegram-cta-banner.tsx`

**Context:** The `/agent` page always shows the primary thread chat — no Telegram gate. "The first conversation IS the product." If Telegram isn't connected yet, an inline banner/CTA appears above the chat encouraging the user to pair. The page reuses the existing message-loading pattern from `app/(dashboard)/chat/[threadId]/page.tsx`.

**Important:** Match the exact message-loading and normalization pattern from `app/(dashboard)/chat/[threadId]/page.tsx:32-59` and its `ChatThreadPageClient` component. Do NOT duplicate the message mapping — read the existing thread page and follow its pattern exactly.

**Step 1: Create the Telegram CTA banner component**

Create `src/components/agent/telegram-cta-banner.tsx`:

```typescript
/**
 * Inline banner encouraging Telegram pairing on the Agent page.
 * Shown when Telegram is not yet connected. Non-blocking — chat works without it.
 * @module components/agent/telegram-cta-banner
 */
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function TelegramCtaBanner() {
  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-4 max-w-3xl mx-auto">
        <p>
          Connect Telegram to message your agent from your phone.
          Pulses, web chat, and Telegram all flow into this thread.
        </p>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/settings">Connect Telegram</Link>
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Create the Agent page server component**

Create `app/(dashboard)/agent/page.tsx`. Follow the exact pattern from `app/(dashboard)/chat/[threadId]/page.tsx` for loading messages and rendering the chat. The key differences:
- Uses `getPrimaryThread()` instead of a URL param for the thread ID
- Adds the Telegram CTA banner when no Telegram mapping exists
- Falls back to a "Thread not found" redirect if primary thread doesn't exist (shouldn't happen — bootstrap creates it)

Read `app/(dashboard)/chat/[threadId]/page.tsx` and its client wrapper to match the exact imports, message normalization, and component composition.

**Step 3: Verify the page renders**

```bash
npm run dev
```

Navigate to `/agent`:
- Primary thread chat visible immediately (with message history)
- If Telegram not connected: banner appears above the chat with "Connect Telegram" link
- If Telegram connected: no banner, just chat

**Step 4: Verify type checking**

```bash
npx tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add app/\(dashboard\)/agent/page.tsx src/components/agent/telegram-cta-banner.tsx
git commit -m "feat(primary-thread): create Agent page — always shows primary thread, inline Telegram CTA"
```

---

### Task 6: Telegram pairing — route to primary thread

**Files:**
- Modify: `app/api/webhook/telegram/route.ts:266-298`
- Test: `app/api/webhook/telegram/__tests__/` (if test file exists)

**Context:** Currently `handleStartCommand` creates a NEW thread on pairing (lines 266-273). It should instead look up the existing primary thread and point the channel mapping there. No new thread creation needed.

**Step 1: Write the failing test**

Check if a test file exists for telegram commands. If not, create one. The test should verify that pairing looks up the primary thread and maps to it instead of creating a new thread.

```typescript
it("maps Telegram pairing to the existing primary thread", async () => {
  // Setup: primary thread exists for the client
  // Action: handleStartCommand with valid pairing token
  // Assert: no thread INSERT, mapping uses primary thread's thread_id
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — current code creates a new thread.

**Step 3: Update `handleStartCommand`**

In `app/api/webhook/telegram/route.ts`, replace lines 266-277 (thread creation) with a primary thread lookup:

```typescript
  // Look up the existing primary thread instead of creating a new one
  const { data: primaryThread, error: primaryError } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", pairingToken.client_id)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primaryThread) {
    await sendPlainTelegramMessage(bot, numericChatId, "Setup incomplete. Please try again.");
    return;
  }

  const threadId = primaryThread.thread_id;
```

Keep the rest of the function (mapping insert, token deletion, success message) unchanged.

**Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/webhook/telegram/ --reporter=verbose
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/api/webhook/telegram/route.ts
git commit -m "feat(primary-thread): Telegram pairing routes to primary thread"
```

---

### Task 7: Add `/main` Telegram command

**Files:**
- Modify: `app/api/webhook/telegram/route.ts`

**Context:** Users can create task threads via `/new` in Telegram. They need `/main` to switch back to the primary thread. This is the inverse of `/new` — instead of creating a thread, it looks up the primary thread and updates the mapping.

**Step 1: Write the failing test**

```typescript
it("switches Telegram mapping back to primary thread on /main", async () => {
  // Setup: mapping exists pointing to a task thread, primary thread exists
  // Action: handleMainCommand
  // Assert: mapping updated to primary thread's thread_id
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `handleMainCommand` doesn't exist yet.

**Step 3: Implement `handleMainCommand`**

Add to `app/api/webhook/telegram/route.ts`, after `handleNewCommand` (around line 344):

```typescript
async function handleMainCommand(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  message: Record<string, unknown>,
): Promise<void> {
  const chatId = String((message.chat as Record<string, unknown>).id);
  const numericChatId = Number(chatId);
  const mapping = await getTelegramMappingByChatId(supabase, chatId);

  if (!mapping) {
    await sendPlainTelegramMessage(
      bot,
      numericChatId,
      "This chat is not connected. Generate a new pairing link from Settings.",
    );
    return;
  }

  await clearPendingQuestionsForChat(supabase, chatId);

  const { data: primaryThread, error: primaryError } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", mapping.client_id)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primaryThread) {
    await sendPlainTelegramMessage(bot, numericChatId, "Primary thread not found.");
    return;
  }

  if (mapping.thread_id === primaryThread.thread_id) {
    await sendPlainTelegramMessage(bot, numericChatId, "Already in the main session.");
    return;
  }

  const { error: updateError } = await supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: primaryThread.thread_id })
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId);

  if (updateError) {
    throw updateError;
  }

  await sendPlainTelegramMessage(bot, numericChatId, "Switched back to main session.");
}
```

**Step 4: Wire the command into the message dispatcher**

Find where `/new` is dispatched in the webhook route (search for `handleNewCommand`). Add `/main` next to it:

```typescript
// Find the command dispatch block and add:
if (text === "/main") {
  await handleMainCommand(supabase, bot, message);
  return NextResponse.json({ ok: true });
}
```

**Step 5: Run tests**

```bash
npx vitest run app/api/webhook/telegram/ --reporter=verbose
```

Expected: ALL PASS

**Step 6: Commit**

```bash
git add app/api/webhook/telegram/route.ts
git commit -m "feat(primary-thread): add /main Telegram command to switch to primary thread"
```

---

### Task 8: Full integration verification

**Context:** Final pass. Verify everything works together: sidebar, Agent page, Telegram pairing, `/main` command, pulse delivery.

**Step 1: Run all tests**

```bash
npx vitest run --reporter=dot
```

Expected: ALL PASS (pre-existing failures in UI component tests are acceptable — check they're not new)

**Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Manual verification checklist**

```bash
npm run dev
```

- [ ] `/agent` shows primary thread chat immediately (no Telegram gate)
- [ ] When Telegram not connected: inline CTA banner visible above chat
- [ ] When Telegram connected: no banner, just chat
- [ ] Messages in primary thread visible on `/agent`
- [ ] Sidebar shows "Agent" first, then "New Task"
- [ ] SESSIONS list does NOT show the primary/Agent thread
- [ ] `/chat` still works as "New Task" (creates fresh threads)
- [ ] Telegram `/new` creates a task thread
- [ ] Telegram `/main` switches back to primary thread
- [ ] Pulse fires in primary thread (check via autopilot trigger)

**Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(primary-thread): integration fixes from manual verification"
```

---

## Design Doc Fix

After all tasks complete, update the design doc status:

In `roadmap docs/Sunder - Source of Truth/references/deepagents/04-primary-thread-unification-design-doc.md`, line 3:

```markdown
-- Change:
**Status:** Design doc (not yet implemented)
-- To:
**Status:** Implemented
```

```bash
git add "roadmap docs/Sunder - Source of Truth/references/deepagents/04-primary-thread-unification-design-doc.md"
git commit -m "docs: mark primary thread unification as implemented"
```
