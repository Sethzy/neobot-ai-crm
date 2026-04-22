---
date: 2026-04-22
topic: primary-thread-in-chats-list
---

# KISS Telegram: One Thread, One Mirror

## Mental Model

> Every user has exactly one primary thread. Telegram always writes to it. That thread is pinned at the top of the `Chats` list with a home icon. To run a scoped task that doesn't ping the phone, use **New Task** on web.

Telegram is a mirror of the primary thread, not a second thread and not a swappable mapping. The web app is the only place threads can be branched or spawned.

## Problem Frame

Today the product has three overlapping entry points to "talk to the agent" — a dedicated `Agent` nav item pointing at `/agent` (the primary thread), a `New Task` item pointing at `/chat` (fresh disposable threads), and the `Chats` list (history of both). From the user's POV `Agent` and `New Task` look like the same thing, and the Telegram-mirror relationship is invisible.

On top of that, the Telegram webhook supports `/new` (branch to a fresh thread and redirect the chat mapping) and `/main` (come back). These commands let Telegram subvert the "Telegram = primary thread" invariant: after a `/new`, the `/agent` page no longer reflects what Telegram is actually writing to, and the Chats list ends up with an unnamed side thread that the user has to find by hand.

We are collapsing this: one thread per user for Telegram, no branching from Telegram, the primary thread lives in the `Chats` list with a home icon, and the `/agent` surface disappears.

## Requirements

**UI surface**
- **R1.** The `/agent` route is removed. No UI surface is dedicated solely to rendering the primary thread.
- **R2.** The `Agent` item is removed from the sidebar primary nav. The flat primary nav becomes: Search, New Task, Tasks, Automations, Skills, People, Companies, Deals, Meetings.
- **R3.** The primary thread appears in the `Chats` list alongside other threads, always sorted to the top, and cannot be archived.
- **R4.** The primary thread row in the `Chats` list uses a **home** icon (channel-agnostic). Other threads keep the existing chat icon; automation-run threads keep the existing zap icon.
- **R5.** On creation, the primary thread title is `"Home"` (changed from the current `"Agent"`).
- **R6.** Clicking the primary thread row opens it at `/chat/<primary_thread_id>` using the existing chat view. No special rendering — it is a regular thread.
- **R7.** Any internal link or redirect that currently points to `/agent` resolves to `/chat/<primary_thread_id>` instead. The Telegram CTA banner (currently shown on `/agent`) is relocated to Settings → Integrations.

**Telegram behavior**
- **R8.** The `/new` Telegram command is removed. `handleNewCommand` is deleted from the webhook. Users cannot branch to a fresh thread from Telegram.
- **R9.** The `/main` Telegram command is removed. `handleMainCommand` is deleted from the webhook. There is no branching, so there is nothing to switch back from.
- **R10.** The `user_profiles.default_messaging_thread_id` override is removed. The column is dropped (or left dormant — see Key Decisions). `getDefaultMessagingThreadForUser` resolves directly to the primary thread with no profile lookup.
- **R11.** Existing Telegram pairings continue delivering into the thread their `conversation_channel_mappings` row already points at. For users whose mapping was previously `/new`-redirected to a non-primary thread, a one-time backfill resets the mapping to `is_primary = true` so the invariant holds.

## Success Criteria

- A user who messages the agent via Telegram on mobile can open the web app, glance at the `Chats` list, and identify their Telegram-mirror thread without instruction — pinned at the top with the home icon.
- No reachable UI surface still references `/agent` after the change.
- `/new` and `/main` typed into a paired Telegram chat behave as regular messages (no special handling), or surface a short "not supported" reply — planning decides.
- Every paired Telegram chat's `conversation_channel_mappings.thread_id` equals that client's `is_primary = true` thread_id after the backfill.
- Existing sidebar and webhook tests pass after updates; new tests cover the removed commands and the chats-list ordering rule.

## Scope Boundaries

Explicitly **not** in this ideation (deferred to separate ideations if pursued):

- `Inbox` homepage surface (approvals, due follow-ups, briefing card).
- Renaming `Tasks` → `Follow-ups`.
- Demoting `Skills` to Settings or footer.
- "Open in browser" deep-link from Telegram outbound messages.
- Multi-user fan-out bug (two users in same client paired → replies hit both). Document as a known limitation; fix in a later pass.
- Per-channel rollup views (dedicated "Telegram" or "Slack" surfaces).
- Any new messaging-channel support beyond what exists today.

## Key Decisions

- **Telegram is hardcoded to the primary thread.** No branching, no overrides. Simplest possible mental model.
- **`/new` and `/main` are deleted, not hidden.** Leaving dead command handlers in the webhook invites regressions and misleads anyone reading the code.
- **Primary icon is a home icon (channel-agnostic).** Future-proofs for Slack/WhatsApp/iMessage without a rename. Telegram-ness is signaled by the Settings banner, not by the thread icon.
- **Primary thread lives in the `Chats` list, not as a dedicated nav item.** Matches Goose's pattern; reduces redundant entry points.
- **`default_messaging_thread_id` column policy: drop it.** Keeping a dormant column is a future footgun — the next person to touch this code will ask why it exists. Migration drops the column.
- **One tradeoff we accept:** users cannot scope a sub-task from Telegram alone. If they need a fresh context from their phone, they open the web and use `New Task`. Almost nobody uses `/new` today, so the simplification is worth the loss.

## Dependencies / Assumptions

- Every active user already has a row in `conversation_threads` with `is_primary = true` (backfilled at bootstrap). If somehow missing, the user sees no pinned row — acceptable, since the nav item is also gone.
- The `Chats` sidebar already supports per-thread icons (automation-run branch). Extending to the home icon follows the existing pattern.
- Existing `is_pinned` field and sort behavior are re-usable for pinning the primary thread to the top. Planning to verify archive prevention still holds when the home icon replaces the generic one.
- The multi-user fan-out bug (two users on the same client paired to the same primary thread) remains unfixed and is explicitly out of scope. Document as a known limitation.

## Ship Order (guidance for planning)

Three small PRs, mergeable independently, each reversible:

1. **PR 1 — Kill Telegram branching.** Remove `/new` and `/main` from the webhook. Backfill any `conversation_channel_mappings.thread_id` that's currently pointing at a non-primary thread back to the primary thread. Drop `user_profiles.default_messaging_thread_id`. Backend only; no UI change.
2. **PR 2 — Rename primary thread title.** Change creation code from `"Agent"` to `"Home"`. One-time migration to rename existing `"Agent"`-titled primary threads.
3. **PR 3 — Chats list surfaces primary, `/agent` dies.** Sort primary to top, home icon, delete `/agent` route, remove `Agent` nav item, add redirects, relocate Telegram CTA banner to Settings.

## Outstanding Questions

### Resolve Before Planning

*(none)*

### Deferred to Planning

- [Affects R8/R9][User decision] When a user types `/new` or `/main` on Telegram after the command is removed, should the bot reply with a short explanation ("branching moved to the web — open Sunder and use New Task") or stay silent and treat it as a regular message? Small UX choice; planning picks one.
- [Affects R7][Technical] Where exactly does the Telegram CTA banner (currently on `/agent`) render in Settings → Integrations? Inventory current banner usages and propose a concrete placement.
- [Affects R3][Technical] Does the primary thread need explicit archive prevention, or does `is_pinned = true` already block the archive action? Planning to verify against current archive code in `app-sidebar.tsx` and thread context.
- [Affects R7][Needs research] Identify all internal links and redirects currently pointing to `/agent` (welcome flow, Telegram pairing success message, onboarding steps, email templates). Grep and enumerate before deletion.
- [Affects R10][Technical] Drop the `default_messaging_thread_id` column via migration. Verify no other code reads it after the pairing path is updated.
- [Affects R11][Technical] Write the one-time backfill: `UPDATE conversation_channel_mappings SET thread_id = (SELECT thread_id FROM conversation_threads WHERE client_id = <mapping.client_id> AND is_primary = true) WHERE thread_id != <that>`. Scope to Telegram channel only.

## Next Steps

→ `/plan` for structured implementation planning
