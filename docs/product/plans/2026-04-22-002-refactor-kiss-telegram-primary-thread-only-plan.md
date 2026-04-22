---
title: "refactor: Simplify Telegram to primary-thread-only (KISS)"
type: refactor
status: active
date: 2026-04-22
origin: docs/product/ideations/2026-04-22-primary-thread-in-chats-list-requirements.md
---

# refactor: Simplify Telegram to primary-thread-only (KISS)

## Overview

Collapse Sunder's Telegram ↔ thread architecture to the simplest possible invariant: **every user has one primary thread; Telegram always writes to it; the primary thread is a pinned row in the Chats list, not a dedicated nav item.** Delete the `/agent` route, the `/new` and `/main` Telegram commands, and the `default_messaging_thread_id` user-profile override.

Net result: one less nav item, two fewer Telegram commands, one dropped DB column, one deleted page. Product behavior becomes *"Telegram = phone mirror of your main chat"*, no branching, no overrides.

## Problem Statement

The current architecture supports three overlapping entry points to "talk to the agent" (`/agent` for the primary thread, `/chat` for fresh threads, `Chats` list for history). On top of that, the Telegram webhook supports `/new` (branch to a fresh thread by swapping `conversation_channel_mappings.thread_id`) and `/main` (come back). After a `/new`, the `/agent` page silently stops reflecting where Telegram is writing — a real UX bug that masquerades as a feature.

The 2026-04-21 user-scoped pairing plan doubled down on flexibility by introducing `user_profiles.default_messaging_thread_id`, letting users override which thread Telegram routes to. In practice this compounds the confusion — now there are three possible answers to *"where is my Telegram convo?"* (primary thread, `default_messaging_thread_id` target, or whichever thread a `/new` last redirected to).

**We are consciously reversing that flexibility.** One thread per user, hardcoded, no override, no branching. The tradeoff — users can't scope a sub-task from Telegram alone — is worth it for the mental-model simplicity, and almost nobody uses `/new` today.

## Proposed Solution

Three small, independently mergeable PRs, each reversible on its own:

1. **PR A — Kill Telegram branching** (backend-only).
   Delete `/new` and `/main` command handlers from the webhook. Drop the `user_profiles.default_messaging_thread_id` column. Backfill any `conversation_channel_mappings.thread_id` currently pointing at a non-primary thread back to the client's primary thread.

2. **PR B — Rename primary thread title** (minor).
   Update the bootstrap function to create the primary thread with `title = 'Home'`. One-time migration to rename existing `"Agent"`-titled primary threads.

3. **PR C — Chats list surfaces primary; delete `/agent`** (UI).
   Update `listThreads()` to include the primary thread and sort it first. Add the home icon branch to the sidebar Chats list row. Delete `app/(dashboard)/agent/page.tsx`. Remove the `Agent` nav item. Redirect any `/agent` link to `/chat/<primary_thread_id>`. Relocate the Telegram CTA banner from the deleted `/agent` page to Settings → Messaging Channels.

Each PR ships a coherent product state: after PR A, `/agent` still works but no branching. After PR B, the title cosmetic change lands. After PR C, the `/agent` page is gone and the primary thread is discoverable via the Chats list.

## Technical Considerations

### Deploy-order safety
Within PR A, deploy the code change (commands removed) **before** running the backfill migration. If the order were reversed, a request between migration and code-deploy could still invoke `/new` and create drift. Sequence: migrate drop-column → deploy code → run backfill. The code-vs-data order matters because the backfill resets `conversation_channel_mappings.thread_id` to the primary — if `/new` runs after the backfill but before code deploy, we'd need a second backfill.

### `listThreads()` filter change
`src/lib/chat/threads.ts:44-58` currently has `.eq("is_primary", false)` — it actively hides the primary thread from the Chats list. This is the load-bearing change for PR C's R3/R4: remove that filter and add a sort clause that puts `is_primary = true` first, then `is_pinned`, then `updated_at`.

### Migration dependency chain
- `20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql` added the column we're dropping.
- `20260421100003_backfill_telegram_connections_from_channel_mappings.sql` is downstream of that — verify it doesn't read `default_messaging_thread_id`; it reads `conversation_channel_mappings` so should be unaffected.
- `20260323100001_update_bootstrap_for_primary_thread.sql:61-62,70` contains both the creation code and an upsert with `title = 'Agent'` — PR B rewrites the creation default, and the migration renames existing rows.

### Contradiction with the 2026-04-21 pairing plan
The recently-shipped user-scoped pairing plan (`docs/product/plans/2026-04-21-002-feat-user-scoped-telegram-pairing-plan.md`) explicitly introduced `default_messaging_thread_id` as a feature. This plan reverses that decision on the grounds of mental-model simplicity. The pairing infrastructure (user-scoped `telegram_connections`, ownership guards) is kept — only the *thread override* is removed. Flag in the PR A commit message: *"reverses 2026-04-21-002 on per-user thread override; keeps user-scoped pairing infra."*

### Archive prevention
The Chats list archive action lives in `app-sidebar.tsx` (the `handleArchiveThread` in the menu). Today the menu is conditionally hidden via `thread.isPinned ? null : …`. The primary thread is already pinned at creation time, so the archive menu is already hidden for it. No new archive-prevention code needed for R3 — reuse `isPinned`.

### `/agent` route reference inventory
Grep hits beyond the sidebar nav item: `src/components/settings/settings-nav.tsx`, the Telegram pairing success path (`src/lib/channels/telegram/webhook.ts`), and webhook tests. PR C enumerates them all in a single grep pass and rewrites each to `/chat/<primary_thread_id>`. No email templates reference `/agent` per the grep (safe).

### Webhook fall-through after command removal
`parseCommand` in `src/lib/channels/telegram/webhook.ts:200-214` will still parse `/new` and `/main` as commands. After PR A, their dispatch branches are gone, so the `route.ts:599-617` logic falls through to `handleRegularMessage` — the agent receives `"/new"` or `"/main"` as a prompt. This is fine; the agent responds in natural language. No "command not found" reply needed. (Optional follow-up: emit a short *"that command's been removed — open Sunder on web and use New Task"* reply, but not required for KISS.)

## System-Wide Impact

**Interaction graph:**
- Telegram inbound → webhook → `conversation_channel_mappings` lookup → `runManagedAgent(threadId)` → agent response → `deliverToExternalChannels(threadId)` → lookup mappings by thread_id → send to Telegram. Unchanged.
- Web nav → `/agent` (gone) → Chats list → primary thread row → `/chat/<primary_thread_id>` → existing chat page. New routing, existing underlying code.

**Error propagation:**
- Backfill migration: if the `UPDATE conversation_channel_mappings` transaction fails, it rolls back; no partial state. Log count of rows updated for verification.
- `listThreads()` query change: if the sort clause is malformed, the Chats list renders in wrong order but doesn't crash — caught by existing sidebar tests.

**State lifecycle risks:**
- Users with `conversation_channel_mappings.thread_id != primary_thread_id` (post-`/new` drift) have orphaned branch threads. After the backfill, these branch threads remain as regular rows in `conversation_threads` — they appear in the Chats list like any other chat. No data loss.
- `user_profiles.default_messaging_thread_id` values are dropped with the column. If any user had deliberately set this to a non-primary thread, that preference is silently erased. Acceptable because (a) the UI for setting it was recent and lightly-used; (b) the setting no longer has any behavioral effect.

**API surface parity:**
- `PUT /api/settings/profile/default-messaging-thread` and its GET pair become dead endpoints. Delete them in PR A along with the form component. No other callers.

**Integration test scenarios:**
1. **Post-backfill Telegram message.** User had `/new`'d before migration → after backfill + code deploy, their next Telegram message routes to the primary thread, not the orphaned branch.
2. **Chats list ordering.** Primary thread always renders first, even when the user has many newer pinned threads.
3. **`/agent` redirect.** Any HTTP request to `/agent` returns a redirect to `/chat/<primary_thread_id>` with correct status code.
4. **Telegram CTA visibility.** User without Telegram paired sees the CTA in Settings → Messaging Channels; the old `/agent` banner no longer renders (route gone).
5. **`/new` typed post-removal.** Webhook receives `/new` as a regular message; agent responds; no thread swap occurs.

## Acceptance Criteria

### PR A — Kill Telegram branching

- [ ] `handleNewCommand` and `handleMainCommand` deleted from `app/api/webhook/telegram/route.ts` (lines 145–187 and 193–242).
- [ ] Dispatcher branches for `/new` and `/main` removed from `processUpdate` (lines 606–614).
- [ ] Tests at `app/api/webhook/telegram/__tests__/route.test.ts:787, 839, 989, 1041` deleted.
- [ ] New test: `/new` or `/main` from paired Telegram falls through to `handleRegularMessage` without mutating the mapping.
- [ ] Migration drops `user_profiles.default_messaging_thread_id` column and its FK constraint.
- [ ] Migration backfills `conversation_channel_mappings.thread_id` for Telegram rows pointing at non-primary threads, resetting them to the client's `is_primary = true` thread.
- [ ] `src/lib/settings/profile/messaging-preferences.ts` `getDefaultMessagingThreadForUser` simplified to return the primary thread directly (no profile lookup). `saveDefaultMessagingThreadForUser` and `listAvailableMessagingThreads` deleted.
- [ ] `app/api/settings/profile/default-messaging-thread/route.ts` + its test deleted.
- [ ] `src/components/settings/profile/default-messaging-agent-form.tsx` + its test deleted. Removed from `app/settings/profile/page.tsx`.
- [ ] Existing webhook tests pass unchanged (pairing, inbound, outbound delivery).

### PR B — Rename primary thread title

- [ ] Migration `ensure_autopilot_for_client()` function updated: primary thread created with `title = 'Home'` (was `'Agent'`).
- [ ] One-time migration: `UPDATE conversation_threads SET title = 'Home' WHERE is_primary = true AND title = 'Agent'`.
- [ ] Any hardcoded `"Agent"` title references in tests updated.

### PR C — Chats list surfaces primary; delete /agent

- [ ] `src/lib/chat/threads.ts` `listThreads()`: remove `.eq("is_primary", false)` filter; add sort `is_primary DESC, is_pinned DESC, updated_at DESC`.
- [ ] `src/components/layout/app-sidebar.tsx`: primary thread row renders with home icon (existing icon branch pattern extended). Automation runs keep zap icon. Regular threads keep chat icon.
- [ ] `app/(dashboard)/agent/page.tsx` deleted.
- [ ] `Agent` removed from `primaryNavItems` in `app-sidebar.tsx`.
- [ ] All `/agent` hrefs/redirects rewritten to `/chat/<primary_thread_id>` (settings-nav, Telegram pairing success path, any tests).
- [ ] `TelegramCtaBanner` component moved/imported into `app/settings/workspace/messaging-channels/page.tsx`. Renders only when the current user has not paired Telegram.
- [ ] Sidebar tests updated: new test "primary thread appears first in Chats list with home icon".
- [ ] Redirect behavior verified: hitting `/agent` in a browser lands on `/chat/<primary_thread_id>`.

### Cross-cutting

- [ ] Vitest suite green (`npm test`).
- [ ] Manual smoke: pair Telegram, send a message, verify it lands in the Home thread visible in Chats list. Send a web New Task message, verify it does not ping Telegram.
- [ ] No reachable UI surface references `/agent` after PR C (grep in CI-style check).

## Success Metrics

- **User comprehension:** a user receiving a Telegram reply from the agent, who then opens web for the first time, can locate their Telegram conversation in the Chats list within 5 seconds (the pinned Home row is obvious).
- **Code simplicity:** net lines removed > net lines added across the three PRs. Telegram command handler count drops from 3 to 1 (`/start` only).
- **Zero user-facing regressions:** existing Telegram pairings work unchanged after deploy + backfill; no support tickets about lost conversation access.

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Deploy-order inversion: running backfill before code-deploy allows `/new` to re-drift a mapping before commands are removed. | Medium | Sequence enforced in PR A description: code-deploy first, then backfill. |
| Users who had deliberately set `default_messaging_thread_id` to a non-primary thread lose that preference silently. | Low | The setting was recent (2026-04-21), lightly used. Accept silent erasure; mention in release notes. |
| Branch threads orphaned by past `/new` usage remain as regular chats in the Chats list. Users may be confused to see "random" old threads. | Low | Acceptable; these are real conversations with history. Users can archive them manually. |
| Multi-user fan-out bug (two users on same client paired → replies hit both Telegrams) remains unfixed. | Medium | Out of scope for this plan per ideation. Document as known limitation; open a follow-up issue. |
| `/agent` route references missed in grep → dead redirects after deletion. | Low | PR C includes a grep + enumerate step before deletion. Add a CI grep check if we want belt-and-braces. |
| Contradicts the 2026-04-21 pairing plan which introduced `default_messaging_thread_id` as a feature. | Low | Explicit: this is a conscious reversal on the grounds of mental-model simplicity. Flagged in PR A commit message. The user-scoped pairing *infrastructure* is preserved; only the thread-override feature is removed. |

## Sources & References

- **Origin document:** [docs/product/ideations/2026-04-22-primary-thread-in-chats-list-requirements.md](../ideations/2026-04-22-primary-thread-in-chats-list-requirements.md) — Key decisions carried forward: Telegram hardcoded to primary thread (no branching, no overrides); primary thread lives in Chats list with home icon; `/agent` route and nav item deleted; three-PR ship order; `default_messaging_thread_id` column dropped.
- Prior design context: `docs/product/tasks/2026-03-23-primary-thread-unification-tasklist.md` — introduced `is_primary` to unify three thread concepts. We keep `is_primary`; we remove only the branching surface on top.
- Contradicted plan: `docs/product/plans/2026-04-21-002-feat-user-scoped-telegram-pairing-plan.md` — introduced `default_messaging_thread_id`. This plan reverses that single decision; keeps the user-scoped pairing infrastructure.
- Architectural reference: `roadmap docs/Sunder - Source of Truth/references/deepagents/04-primary-thread-unification-design-doc.md` — rationale for the primary-thread concept.
- Comparable implementation: Goose (pinned primary thread in Chats list) and OpenClaw (`dmScope=main` collapses DMs into agent main session) — both treat Telegram as a mirror surface, not a separate thread space.

### Key file:line anchors

**PR A (backend + schema)**
- `app/api/webhook/telegram/route.ts:145-187` — `handleNewCommand` (delete)
- `app/api/webhook/telegram/route.ts:193-242` — `handleMainCommand` (delete)
- `app/api/webhook/telegram/route.ts:606-614` — dispatcher branches (delete)
- `app/api/webhook/telegram/__tests__/route.test.ts:787,839,989,1041` — tests for `/new`, `/main` (delete)
- `src/lib/settings/profile/messaging-preferences.ts:57-72,99-117` — simplify / delete functions
- `app/api/settings/profile/default-messaging-thread/route.ts` — delete route
- `src/components/settings/profile/default-messaging-agent-form.tsx` — delete component
- `app/settings/profile/page.tsx:103-106` — remove form mount
- `supabase/migrations/20260421100002_...` — add follow-up migration dropping `default_messaging_thread_id` + backfilling Telegram mappings

**PR B (title rename)**
- `supabase/migrations/20260323100001_update_bootstrap_for_primary_thread.sql:49-72` — `ensure_autopilot_for_client()` — add follow-up migration with new title and backfill

**PR C (UI + route delete)**
- `src/lib/chat/threads.ts:44-58` — remove `is_primary = false` filter, add sort
- `src/components/layout/app-sidebar.tsx:51` — delete `Agent` nav item
- `src/components/layout/app-sidebar.tsx:201-205` — extend icon branch for primary thread (home icon)
- `app/(dashboard)/agent/page.tsx` — delete entire file
- `app/settings/workspace/messaging-channels/page.tsx` — relocate `TelegramCtaBanner`
- `src/components/agent/telegram-cta-banner.tsx` — likely re-homed under `src/components/settings/`
