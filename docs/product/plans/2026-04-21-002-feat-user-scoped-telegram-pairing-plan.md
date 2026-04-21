---
title: "feat: User-scoped Telegram pairing and default messaging routing"
type: feat
status: active
date: 2026-04-21
---

# feat: User-Scoped Telegram Pairing and Default Messaging Routing

## Overview

Rework Telegram pairing from a workspace-scoped transport mapping into a personal account-linking flow:

- the authenticated user connects their own Telegram DM
- the connection lives under personal settings semantics
- the connection routes to that user's chosen default messaging thread
- the transport layer continues to use `conversation_channel_mappings`, but no longer acts as the source of truth for personal channel ownership

This plan deliberately uses the screenshot reference as the product benchmark and the existing Sunder Telegram code only as an implementation starting point.

## Problem Statement / Motivation

The current implementation is operationally close to "Telegram works," but product-wise it is still shaped like transport plumbing rather than personal account linking:

- The settings entrypoint is workspace-scoped: [app/settings/workspace/messaging-channels/page.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/app/settings/workspace/messaging-channels/page.tsx:17).
- Connect/disconnect resolve ownership via `client_id`, not `user_id`: [generate-pairing-link](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/telegram/generate-pairing-link/route.ts:35), [disconnect](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/telegram/disconnect/route.ts:18).
- The webhook binds a successful `/start` directly to the client's primary thread: [app/api/webhook/telegram/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/webhook/telegram/route.ts:92).
- Outbound delivery is keyed off `conversation_channel_mappings`, which is a thread-routing table, not a personal connection table: [src/lib/channels/deliver.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/channels/deliver.ts:167).
- The UI only supports a deep link and does not offer the reference-style "copy code" fallback: [src/components/settings/messaging-channels/telegram-connect-row.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/settings/messaging-channels/telegram-connect-row.tsx:190).

Today `clients.user_id` is still 1:1 in v1, so the client/user distinction is partially masked in practice: [supabase/migrations/20260301000000_create_clients_table.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260301000000_create_clients_table.sql:1). That does not change the product truth: Telegram DM ownership is personal, not workspace-level.

## Product Decision

### Canonical ownership model

Telegram DM connection is **per authenticated user**.

### Canonical routing model

The user's Telegram connection sends and receives on the user's **default messaging thread**.

### Implementation consequence

Sunder must separate:

- **personal channel ownership**
- **transport routing to a thread**

The current code collapses those into `conversation_channel_mappings`. This plan un-collapses them.

## Proposed Solution

### 1. Introduce a personal connection source of truth

Create a new table, `messaging_channel_connections`, to represent user-owned messaging connections.

Suggested shape:

```sql
create table public.messaging_channel_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(client_id) on delete cascade,
  channel text not null,
  external_conversation_id text not null,
  target_thread_id uuid not null references public.conversation_threads(thread_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel),
  unique (channel, external_conversation_id)
);
```

Semantics:

- one user can have at most one Telegram DM connection in v1
- one Telegram chat can belong to only one Sunder user globally
- the connection knows which thread currently receives Telegram messages

### 2. Evolve pairing tokens into actual pairing sessions

Replace the current token-only model with a user-scoped pairing session table. Recommended name: `telegram_pairing_sessions`.

Suggested shape:

```sql
create table public.telegram_pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(client_id) on delete cascade,
  target_thread_id uuid not null references public.conversation_threads(thread_id) on delete cascade,
  deep_link_token text not null unique,
  display_code text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
```

Why this change:

- the screenshot/reference flow needs a human-friendly code to copy
- the current token table cannot support both deep-link and manual entry cleanly
- pairing needs to bind to a user and chosen target thread, not just a client

### 3. Store the user's default messaging thread explicitly

Use `user_profiles` as the per-user settings store and add:

```sql
alter table public.user_profiles
  add column if not exists default_messaging_thread_id uuid references public.conversation_threads(thread_id) on delete set null;
```

Why `user_profiles`:

- it already exists as the natural per-user settings table in schema types: [src/types/database.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/types/database.ts:1820)
- the current `/settings/profile` page is a stub and is the correct home for this preference: [app/settings/profile/page.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/app/settings/profile/page.tsx:1)

V1 fallback:

- if `default_messaging_thread_id` is null, use the current primary thread
- the UI should encourage the user to set or confirm their default messaging thread

### 4. Keep `conversation_channel_mappings`, but demote it to routing state

Do **not** delete `conversation_channel_mappings`. It remains useful as the transport routing table:

- inbound message dedupe and routing already depend on it
- outbound delivery already reads it
- approvals and pending-question flows already key off chat/thread routing

But it stops being the authoritative answer to "is this user's Telegram connected?"

New rule:

- `messaging_channel_connections` is the personal source of truth
- `conversation_channel_mappings` is a derivative routing table that must stay in sync

### 5. Adopt the screenshot-style pairing UX

The UI should match the reference behavior:

- `Connect Telegram` CTA
- bot username shown explicitly
- human-friendly code with copy button
- `Open in Telegram` deep link
- expiry countdown
- waiting state
- connected state
- disconnect state

The deep link remains the primary mobile-friendly path:

```text
https://t.me/<botUsername>?start=<deep_link_token>
```

The manual fallback path uses `display_code`:

- user can DM the bot with the code
- or send `/start <display_code>`

### 6. Add an explicit infrastructure-readiness state

Before the user clicks `Connect`, the page should know whether Telegram is actually configured.

Readiness for v1:

- `TELEGRAM_BOT_TOKEN` present
- `TELEGRAM_WEBHOOK_SECRET` present

Optional later enhancement:

- verify webhook registration health out-of-band in an ops screen or setup script

Product behavior:

- if Telegram is not configured, the page renders an unavailable state instead of a broken connect flow
- the user never sees a generic pairing failure for what is actually a system configuration problem

## Technical Strategy

### A. Schema changes

Apply via Supabase MCP migrations, not ad-hoc SQL.

1. Create `messaging_channel_connections`
2. Create `telegram_pairing_sessions`
3. Extend `user_profiles` with `default_messaging_thread_id`
4. Add RLS policies using `auth.uid()` for user-owned tables
5. Add Realtime publication for `messaging_channel_connections` if the settings page subscribes directly to it

Recommended policies:

- `select/update/delete` where `auth.uid() = user_id`
- `insert` with `auth.uid() = user_id`
- `with check` that `client_id` belongs to the caller's client row

This aligns with Supabase's standard per-user ownership pattern and Realtime RLS behavior.

### B. Server helpers

Add server helpers to centralize the new ownership model:

- `getTelegramConnectionForUser(userId)`
- `getDefaultMessagingThreadForUser(userId, clientId)`
- `ensureUserProfile(userId)`
- `getTelegramReadiness()`

These helpers should replace direct page-level reads from `conversation_channel_mappings`.

### C. Pairing API behavior

Revise `POST /api/telegram/generate-pairing-link` to:

1. authenticate the user
2. resolve `client_id`
3. resolve or initialize `user_profiles`
4. resolve target thread:
   - `user_profiles.default_messaging_thread_id`
   - else current client primary thread
5. verify Telegram readiness
6. delete stale unconsumed pairing sessions for that user/channel
7. create a new session with:
   - `deep_link_token`
   - `display_code`
   - `target_thread_id`
   - expiry
8. return:

```json
{
  "botUsername": "SunderBot",
  "openUrl": "https://t.me/SunderBot?start=...",
  "displayCode": "GW-22E14A",
  "expiresInSeconds": 600
}
```

### D. Webhook behavior

Revise the Telegram webhook pairing path to accept:

- `/start <deep_link_token>`
- `/start <display_code>`
- plain-text `display_code` from an unpaired chat

Pairing resolution flow:

1. extract chat id
2. if chat is already connected to another user, reject with a clear Telegram message
3. resolve matching unconsumed pairing session
4. verify not expired
5. upsert `messaging_channel_connections`
6. upsert `conversation_channel_mappings` for the same `chat_id -> target_thread_id`
7. mark pairing session consumed
8. reply `Connected`

Unpaired inbound behavior after this change:

- unknown chat + no valid code -> reply with "This chat is not connected. Generate a link from Settings."
- do not create an agent run

### E. Disconnect behavior

Revise `DELETE /api/telegram/disconnect` to:

1. authenticate the user
2. load that user's Telegram connection row
3. clear pending Telegram questions for that chat id
4. delete the user's `messaging_channel_connections` row
5. delete the matching `conversation_channel_mappings` row

Disconnect must only remove the current user's connection, not "the workspace's Telegram."

### F. Default messaging thread behavior

Build a real profile setting at `/settings/profile`:

- section title: `Default messaging agent`
- implementation model: `default_messaging_thread_id`
- choices: current user's active, non-archived threads
- default fallback: primary thread

Behavior:

- changing the default thread updates `user_profiles.default_messaging_thread_id`
- if a Telegram connection exists, update its `target_thread_id`
- also update `conversation_channel_mappings.thread_id` for that chat so outbound delivery continues to work without a broad runtime rewrite

### G. Settings IA

Move the actionable Telegram connection UX to personal settings semantics.

Recommended end state:

- `/settings/profile`
  - account info
  - default messaging agent
  - personal messaging channels section including Telegram

Keep `/settings/workspace/messaging-channels` only for genuinely workspace-level channels later, such as Telegram groups or shared inbox channels.

## System-Wide Impact

### Interaction graph

Happy path:

1. `/settings/profile` loads user profile + Telegram connection + readiness.
2. User clicks `Connect Telegram`.
3. API creates `telegram_pairing_sessions`.
4. UI shows code + deep link + countdown.
5. User opens Telegram or sends the code.
6. Webhook validates session and writes:
   - `messaging_channel_connections`
   - `conversation_channel_mappings`
7. Realtime invalidates the personal connection query.
8. UI flips to `Connected`.
9. Subsequent Telegram inbound/outbound traffic uses the mapped thread.

### Error propagation

- bot not configured -> disabled/unavailable UI state, plus `503` if API is still hit directly
- expired/invalid code -> Telegram-side failure message, UI remains waiting until expiry or refresh
- duplicate chat ownership -> Telegram-side rejection, no connection mutation
- default thread missing -> API falls back to primary thread; if no thread exists, fail explicitly

### State lifecycle risks

- stale routing row after thread change -> solved by updating both connection + mapping on preference change
- stale pairing session after cancel -> acceptable if TTL enforced; best effort delete on cancel is optional
- legacy mapping exists without personal connection row -> backfill migration + temporary fallback read path

### API surface parity

Surfaces affected:

- settings/profile
- settings/workspace/messaging-channels
- Telegram webhook
- disconnect endpoint
- generate pairing endpoint
- outbound delivery helper

### Integration test scenarios

Required cross-layer tests:

- API generates pairing session with both deep link and display code
- webhook accepts deep link token
- webhook accepts copied display code
- connection flips in realtime
- disconnect clears both personal connection and routing row
- default messaging thread change updates routing
- invalid/expired/consumed codes reject cleanly
- bot-not-configured state is visible before connect

## Implementation Phases

### Phase 1: Data model separation

Goal: personal ownership exists separately from transport routing.

Deliverables:

- migration for `messaging_channel_connections`
- migration for `telegram_pairing_sessions`
- migration to extend `user_profiles`
- backfill migration from current Telegram mappings to connection rows by joining `clients.user_id`

Backfill rule:

- if a client has one Telegram mapping today, create one `messaging_channel_connections` row for that client's current `user_id`
- set `target_thread_id = conversation_channel_mappings.thread_id`
- set `default_messaging_thread_id` to the same thread if null

### Phase 2: Profile settings and default messaging thread

Goal: make "default messaging agent" a real preference.

Deliverables:

- build `/settings/profile`
- add `Default messaging agent` section
- API route or server action for updating `default_messaging_thread_id`
- tests for fallback to primary thread and for thread-change propagation

### Phase 3: Pairing session API and UX rewrite

Goal: match the screenshot/reference flow.

Deliverables:

- update `POST /api/telegram/generate-pairing-link`
- `TelegramConnectRow` consumes:
  - `botUsername`
  - `displayCode`
  - `openUrl`
  - countdown
- copy-to-clipboard interaction
- realtime subscription targets `messaging_channel_connections`
- readiness state rendered before connect

### Phase 4: Webhook and routing cutover

Goal: bind Telegram chats to users and target threads correctly.

Deliverables:

- webhook accepts token and code-based pairing
- webhook reads/writes `messaging_channel_connections`
- webhook keeps `conversation_channel_mappings` synchronized
- disconnect endpoint becomes user-scoped
- outbound routing remains compatible

### Phase 5: Cleanup and cutover completion

Goal: remove old ownership assumptions from the UI and APIs.

Deliverables:

- settings/workspace page stops being the canonical Telegram DM surface
- direct reads of connection state from `conversation_channel_mappings` are removed from settings
- old client-scoped Telegram connection helpers are deleted or demoted to routing-only helpers

## User Scenario Coverage Matrix

| Scenario | Expected Behavior | Supported By Plan |
| --- | --- | --- |
| User opens settings for the first time | Sees Telegram connect CTA in a personal settings context | Yes |
| Telegram bot is not configured | Sees unavailable state instead of broken connect flow | Yes |
| User clicks Connect on mobile | Gets deep link, opens Telegram, taps Start, becomes connected | Yes |
| User clicks Connect on desktop | Gets deep link plus copyable code fallback | Yes |
| User copies code and sends it manually to the bot | Bot recognizes code and pairs the account | Yes |
| User already connected | UI shows connected state with chat id and disconnect action | Yes |
| User disconnects | Personal connection and routing row are removed | Yes |
| User reconnects the same Telegram account later | New pairing session succeeds after disconnect | Yes |
| User wants to switch to a different Telegram account | Disconnect first, then connect the new account | Yes |
| Pairing link/code expires | UI shows expired state; user generates a new one | Yes |
| User uses an invalid or consumed code | Telegram replies with explicit error; no connection created | Yes |
| User clicks the same link twice | First succeeds; second returns already-connected or expired | Yes |
| User has two tabs open | Realtime keeps connection state synchronized | Yes |
| User sends random text to the bot before pairing | Bot replies with "not connected" guidance | Yes |
| Telegram chat is already claimed by another Sunder user | Pairing is rejected and no ownership changes occur | Yes |
| User changes default messaging agent after pairing | Existing Telegram connection reroutes to the chosen thread | Yes |
| Existing legacy user already has Telegram connected | Backfill migration preserves their connection | Yes |
| Org/multi-member future state | Per-user connection model remains correct | Partially |

### Multi-member note

The plan is intentionally correct for future multi-member ownership, but it does **not** by itself ship an organization-membership model. It avoids baking the wrong ownership abstraction into Telegram while staying compatible with today's 1:1 `clients.user_id` world.

## Non-Goals / Explicitly Deferred

- Telegram group/topic routing
- multi-bot support
- multiple Telegram DMs per user
- owner-approval pairing flows like OpenClaw's `dmPolicy="pairing"`
- replacing `conversation_channel_mappings` everywhere in one PR
- a generalized Slack/WhatsApp/iMessage implementation

## Acceptance Criteria

### Functional

- [ ] Telegram DM connection is presented as a personal setting, not a workspace connection
- [ ] A connected Telegram DM belongs to the authenticated user
- [ ] The user can pair via deep link or copied code
- [ ] The user can see bot readiness before clicking Connect
- [ ] The user can disconnect only their own Telegram connection
- [ ] The user can choose a default messaging thread from Profile settings
- [ ] Changing the default messaging thread updates Telegram routing
- [ ] Legacy connected users are preserved by migration/backfill

### Data and security

- [ ] Personal connection tables are protected by `auth.uid()` RLS
- [ ] A Telegram chat cannot be linked to multiple users
- [ ] Pairing sessions expire and cannot be reused after consumption
- [ ] All schema changes are applied via Supabase MCP migrations

### Quality gates

- [ ] Route tests cover pairing-session creation, disconnect, invalid/expired codes, and duplicate ownership rejection
- [ ] Webhook tests cover deep-link and copied-code paths
- [ ] UI tests cover unconfigured, idle, waiting, connected, expired, and error states
- [ ] Realtime tests or manual verification confirm multi-tab sync
- [ ] Manual end-to-end verification succeeds against a public webhook URL

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| We over-rotate to user scope while the app is still 1:1 user-client | Medium | Keep routing tables client-aware and backfill legacy data |
| Backfill creates incorrect thread defaults | Medium | Use current mapped thread first, primary thread only as fallback |
| Manual code path complicates webhook parsing | Low | Restrict plain-text pairing only to unpaired chats and match exact active codes |
| Readiness check gives false confidence if webhook is not registered | Medium | Limit v1 readiness to env presence and document webhook setup as ops prerequisite |
| Updating routing on thread-change causes stale pending question state | Low | Clear pending Telegram questions only on disconnect, not on thread preference changes |

## Recommendation

Ship this as a staged refactor, not a one-shot rewrite.

The minimal correct sequence is:

1. separate ownership from routing
2. add default messaging thread
3. rewrite pairing UX around code + deep link
4. cut webhook and disconnect over to the new model

That sequence supports every critical user scenario above without forcing a full messaging runtime rewrite.

## Sources & References

- Current Telegram settings page: [app/settings/workspace/messaging-channels/page.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/app/settings/workspace/messaging-channels/page.tsx:17)
- Current Telegram connect row: [src/components/settings/messaging-channels/telegram-connect-row.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/settings/messaging-channels/telegram-connect-row.tsx:53)
- Current pairing endpoint: [app/api/telegram/generate-pairing-link/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/telegram/generate-pairing-link/route.ts:28)
- Current disconnect endpoint: [app/api/telegram/disconnect/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/telegram/disconnect/route.ts:11)
- Current webhook pairing path: [app/api/webhook/telegram/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/webhook/telegram/route.ts:57)
- Current outbound routing helper: [src/lib/channels/deliver.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/channels/deliver.ts:167)
- Current channel-routing schema: [supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql:3)
- Current global uniqueness constraint: [supabase/migrations/20260320100001_add_global_channel_mapping_ownership.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260320100001_add_global_channel_mapping_ownership.sql:1)
- Telegram drift analysis: [roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md](/Users/sethlim/Documents/sunder-next-migration-20260225/roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md:1)
- Existing messaging-channels UI plan: [docs/product/plans/2026-04-20-002-feat-messaging-channels-page-plan.md](/Users/sethlim/Documents/sunder-next-migration-20260225/docs/product/plans/2026-04-20-002-feat-messaging-channels-page-plan.md:1)
- Supabase RLS `auth.uid()` guidance and Realtime/RLS behavior:
  - https://github.com/supabase/supabase/blob/master/apps/www/_blog/2025-08-17-the-vibe-coders-guide-to-supabase-environments.mdx
  - https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/realtime/authorization.mdx
