# Unread dots on Chats sidebar — design

**Date:** 2026-04-22
**Status:** Approved, not yet implemented
**Supersedes discussion of:** full `/inbox` page (deferred until approval gate exists)

## Background

The Goose-style "Inbox" page was the starting concept — a dedicated landing surface with filter pills (Needs review / Unread / Automations), time-grouped thread list, and a composer at the bottom.

Three of those filters map poorly to Sunder today:

- **Needs review** depends on the external-action approval gate, which is not yet built.
- **Unread** requires new read-state schema (doesn't exist).
- **Automations** already works via `thread.sourceType === 'automation_run'`.

Without the approval gate, a full `/inbox` page would be ~60% redundant with the existing `/chat` page and sidebar Chats list. Deferring the page is the right call; the smaller win — knowing *something is waiting* in a thread — does not require a new surface.

This design adds unread-state tracking directly into the existing Chats sidebar section.

## Goal

Tell the user, at a glance, which chat threads have new activity since they last looked — without building a separate Inbox page.

## Non-goals

- Per-message read receipts.
- Notification counts outside the sidebar (no browser tab title badge, no favicon count).
- A separate Inbox/attention-queue page. Revisit once the approval gate exists.
- "Mark all read" affordance. Add only if clutter accumulates.

## Schema

One column, one migration:

```sql
ALTER TABLE public.conversation_threads
  ADD COLUMN last_read_at TIMESTAMPTZ;
```

- Nullable. `NULL` = never opened → treat as unread if the thread has any messages.
- No RLS change needed — `conversation_threads` is already client-scoped.
- No new index needed; unread is derived per-row from columns already covered by `idx_conversation_threads_client_id` and `idx_conversation_threads_updated_at_desc`.

## Unread definition

Derived client-side as a boolean on each thread:

```ts
const isUnread =
  thread.lastReadAt === null
    ? true
    : thread.updatedAt > thread.lastReadAt;
```

This is free because `conversation_threads.updated_at` already auto-bumps on every `conversation_messages` insert via the existing `bump_thread_updated_at_on_message_insert` trigger. We do not need any new triggers or event plumbing.

The currently-open thread never shows as unread in its own row (see "Read trigger" below).

## Read trigger

When the user navigates to `/chat/[threadId]`, fire-and-forget update:

```sql
UPDATE public.conversation_threads
SET last_read_at = now()
WHERE thread_id = $1;
```

- Runs on page mount.
- Re-runs whenever a new message arrives in the thread *while the user is viewing it*, so `last_read_at` stays pinned to "now" during an active viewing session.
- Optimistic local cache update in `ThreadContext` so the dot clears instantly without waiting for the server round-trip.
- No call on sidebar hover or on "All chats" popover open — only on actual navigation to the thread.

## UI

**Thread row in sidebar (`app-sidebar.tsx`):**
- When `isUnread`: title rendered with `font-semibold` and a small filled dot (`●`) inserted to the left of the thread icon.
- When read: current styling, no dot.

**Section header "Chats":**
- Right-aligned count badge in muted text when total unread > 0, e.g. `Chats  ·  3`.
- Count cap at `9+` to keep the label compact.
- Excludes archived threads.
- Hidden entirely when count is 0.

**All chats popover (`all-chats-popover.tsx`):**
- Same bold + dot treatment per row.

**Currently-open thread:**
- Never shows a dot, even before the server write returns.

## Files that change

| File | Change |
|---|---|
| `supabase/migrations/<date>_add_thread_last_read_at.sql` | new migration (the `ALTER TABLE` above) |
| `src/lib/threads/*` (types) | add `lastReadAt: string \| null` to thread type |
| `src/contexts/thread-context.tsx` | select `last_read_at`; expose `markRead(threadId)`; derive `unreadCount` |
| `app/(dashboard)/chat/[threadId]/page.tsx` | call `markRead()` on mount |
| `src/components/layout/app-sidebar.tsx` | dot + bold on unread rows; unread count on section header |
| `src/components/layout/all-chats-popover.tsx` | dot + bold on unread rows |
| `src/components/layout/app-sidebar.test.tsx` | add unread-state assertions |

## Testing

- Unit: `thread-context` derives `isUnread` correctly across the three states (null `lastReadAt`, stale `lastReadAt`, fresh `lastReadAt`).
- Unit: sidebar renders dot + bold when thread is unread; no dot when read; no dot on currently-viewed thread.
- Unit: section header shows unread count when > 0, hidden when 0, capped at `9+`.
- Integration: navigating to `/chat/[threadId]` clears the dot optimistically and persists on reload.

## YAGNI cuts (deliberately out of scope)

- Per-message read tracking.
- Read receipts or any event-driven plumbing.
- Mark-all-read button.
- Different unread treatment for primary "Main" thread vs regular threads.
- Browser notification / tab title badge.

## Unresolved questions

1. **Count badge visual** — muted dot-separator text (`Chats · 3`) vs a pill badge. Default to the dot-separator style for consistency with the rest of the sidebar; revisit if it reads weakly.
2. **Archived threads** — confirm the sidebar `useThreads()` query already filters out archived rows. If not, exclude them from the unread count explicitly.
3. **Telegram inbound** — when a Telegram message routes to the primary thread while the user is active on web, does the web message render trigger `markRead()` immediately, or should there be a small delay so the user has a chance to see the dot appear? Default to immediate mark-read if the thread view is focused; otherwise leave unread.
