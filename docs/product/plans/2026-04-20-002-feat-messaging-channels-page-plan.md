---
title: Messaging Channels page — Telegram connect with realtime flip, stubs for other channels
type: feat
status: active
date: 2026-04-20
---

# Messaging Channels page — Telegram connect with realtime flip, stubs for other channels

## Overview

Fill the `/settings/workspace/messaging-channels` page (stubbed in PR 1) with a Gooseworks-style row-per-channel layout:
- **Telegram (DM)** — real end-to-end connect/disconnect flow with auto-flip to "Connected" when the user completes pairing in the Telegram app.
- **Telegram Group, Slack, WhatsApp, iMessage** — visible rows with disabled "Connect" buttons and roadmap copy. No vendor integrations.

This PR is purely UI + one Realtime subscription addition. Zero new API routes, zero new DB migrations, zero new env vars. Backend for Telegram is already shipped and in production.

## Problem Statement / Motivation

PR 1 restructured `/settings` into a sub-paged surface and deleted the old flat Telegram card. PR 1's Messaging Channels page is a stub. To actually connect Telegram from the UI again, this PR rebuilds the pairing UX in its permanent home, with three improvements over the old card:

1. **Multi-channel awareness.** The old card was Telegram-only. The new page shows the full roadmap of channels (Slack, WhatsApp, iMessage, Telegram Group) as visible-but-disabled rows. Users see what's coming without the product making promises we can't keep.
2. **Auto-flip on pairing completion.** The old card required a manual page refresh to reflect a successful pairing. The new row subscribes to `conversation_channel_mappings` via Supabase Realtime and flips to "Connected" the instant the webhook writes the mapping row — no refresh, no polling.
3. **Explicit state machine.** The old card had three implicit states bolted together. The new `TelegramConnectRow` formalizes five: `idle → generating → link-ready → connected → error`. Each state has its own rendered UI so the user always knows where they are.

## Proposed Solution

### Page layout

```
Messaging Channels
Connect messaging channels so your agent can communicate across platforms.

┌─────────────────────────────────────────────────────────────────┐
│ [icon] Telegram            Connect your personal Telegram       │
│        (DM)                chat with the agent                  │
│                                                                 │
│        State-dependent content (see below)          [ Connect ]│
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ [icon] Telegram Group      Supergroup with Topics — one thread │
│                            per topic                 [ Coming  │
│                                                         soon ] │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ [icon] Slack               Message your agent from Slack       │
│                                                      [ Coming  │
│                                                         soon ] │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ [icon] WhatsApp            Chat via WhatsApp Business          │
│                                                      [ Coming  │
│                                                         soon ] │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ [icon] iMessage            Native iMessage relay               │
│                                                      [ Coming  │
│                                                         soon ] │
└─────────────────────────────────────────────────────────────────┘
```

All rows share a `ChannelRow` primitive (icon + title + description + right-slot). Telegram uses `TelegramConnectRow` (real); everything else uses `DisabledChannelRow` (stub).

### Telegram row — state machine

```
                   ┌──────────────────────────┐
                   │  INITIAL LOAD            │
                   │  server pre-fetches      │
                   │  chatId from mapping row │
                   └───────────┬──────────────┘
                               │
            chatId=null        │       chatId=non-null
               │               │               │
               ▼               │               ▼
         ┌──────────┐          │        ┌──────────────┐
         │   idle   │          │        │  connected   │
         │          │          │        │  chat:<id>   │
         │ [Connect]│          │        │[Disconnect]  │
         └────┬─────┘          │        └──────┬───────┘
              │                │               │
              │ click Connect  │               │ click Disconnect
              ▼                │               ▼
        ┌────────────┐         │         ┌──────────┐
        │ generating │─error──▶│◀────────│   idle   │
        │  spinner   │         │         └──────────┘
        └─────┬──────┘         │
              │ success        │
              ▼                │
       ┌────────────────┐      │
       │  link-ready    │      │
       │  countdown ⏳  │      │
       │  [Open TG]     │      │
       │  [Cancel]      │      │
       │  [Refresh]     │      │
       └────┬───────┬───┘      │
            │       │          │
            │       └─realtime─┤ (mapping row inserted)
            │  click Cancel    │
            ▼                  ▼
         idle              connected
```

### Realtime mechanism — chosen: `useRealtimeTable`

The repo already has a canonical Realtime pattern at `src/hooks/use-realtime.ts:43-83`, exercised live on the meetings page (`src/hooks/use-meetings.ts:82-96`). The pattern: a component mounts a subscription on a `postgres_changes` channel filtered by `client_id=eq.${clientId}`; on any event, it invalidates the supplied TanStack Query keys.

`conversation_channel_mappings` has RLS policies keyed to `get_my_client_id()` (`supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql:67-81`), so a browser-side Realtime subscription will only ever see this client's rows. Safe.

**One-line infra change:** add `"conversation_channel_mappings"` to the `RealtimeTableName` whitelist at `src/hooks/use-realtime.ts:12-27`. No migration, no policy, no new hook.

**Why Realtime over polling:**
- The repo has **zero** `refetchInterval` usage today. Polling would be a new pattern.
- `useRealtimeTable` is already a one-liner `useEffect` call from any component.
- Realtime requires no new API route; polling would require `GET /api/telegram/status`.
- Latency: Realtime flips in <1s vs. up-to-3s for 3s polling.
- Resource cost: one long-lived WebSocket message vs. repeated HTTP+JWT every 3s.

### Server-side data loading

The Messaging Channels page is a Server Component. On mount it:
1. Calls `createClient()` (Supabase server helper).
2. `resolveClientId(supabase)` → `client_id`.
3. Selects `external_conversation_id` from `conversation_channel_mappings` where `client_id=? AND channel='telegram'`. Nullable.
4. Passes `initialChatId` and `clientId` to the `TelegramConnectRow` client component.

This mirrors the existing pattern at `app/(dashboard)/settings/page.tsx:61-76` (the old `loadTelegramChatId`). Lift that function into a helper if it's useful to reuse; otherwise inline in the new page.

### Client state (`TelegramConnectRow`)

- **Hooks:**
  - `useQuery({ queryKey: ['telegram', 'mapping', clientId], queryFn: fetch-mapping })` — the authoritative read of whether we're connected. Server-pre-hydrated from `initialChatId`.
  - `useRealtimeTable({ table: 'conversation_channel_mappings', filter: \`client_id=eq.${clientId}\`, queryKeys: [['telegram', 'mapping', clientId]] })` — flips `connected` when the webhook writes the mapping row.
  - Local `useState` for transient states: `pairingUrl`, `linkExpiresAt`, `errorText`, `isLoading`.
- **Derived state:** the five states (`idle`/`generating`/`link-ready`/`connected`/`error`) are computed, not stored. `connected` comes from the query cache; `link-ready` is `pairingUrl != null`; `generating`/`error` come from the mutation; `idle` is the fallback.
- **Cleanup:** if `pairingUrl` is set and `Date.now() >= linkExpiresAt`, auto-clear back to idle and show a notice "Link expired — generate a new one."
- **Countdown timer:** `setInterval(1000)` for rerender while `pairingUrl` is active; cleared on unmount or state transition away from `link-ready`. Use the existing `formatCountdown()` helper at `src/lib/triggers/cron-display.ts:25-42`.

### Disabled channel rows

`DisabledChannelRow` takes `{ icon, title, description, reason? }`. Renders the same `ChannelRow` primitive with a disabled Button labeled "Coming soon" (no click handler). No tooltip required — the description carries the one-line roadmap copy.

```
Telegram Group  — "Add @SunderBot as admin to a supergroup with Topics enabled."
Slack           — "Message your agent from any Slack workspace."
WhatsApp        — "Chat via WhatsApp Business Cloud API."
iMessage        — "Native iMessage via SendBlue/Loop relay."
```

### Icons

`appIcons` registry (`src/components/icons/app-icons.tsx:75-148`) already exposes generic icons. For this PR:
- Telegram DM → `send` (`SendIcon`)
- Telegram Group → `contacts` or `message` — pick the most group-evoking existing icon, don't add new ones unless necessary
- Slack → `chat` or `message`
- WhatsApp → `whatsapp` (already mapped to `MessageCircleIcon`)
- iMessage → `phone`

Do not add Slack or iMessage brand icons this PR — use generic lucide icons. Brand icons are YAGNI until the channels ship for real.

## Technical Considerations

### Architecture impacts

- **No new API routes.** Existing `POST /api/telegram/generate-pairing-link` and `DELETE /api/telegram/disconnect` cover everything.
- **One line of infra:** add `conversation_channel_mappings` to `RealtimeTableName` union at `src/hooks/use-realtime.ts:12-27`.
- **Server Component page** per CLAUDE.md convention. Only the Telegram row is a Client Component.
- **TanStack Query hydration:** page pre-fetches the mapping row server-side and passes `initialChatId` into the client row, so the UI renders instantly without a loading flicker. Matches the approach at `app/(dashboard)/meetings/page.tsx`.

### Performance implications

- One additional WebSocket subscription per user viewing the Messaging Channels page. Cleanup on unmount. Negligible.
- Countdown re-renders once per second while a pairing link is active — 600 renders max, cheap.

### Security considerations

- RLS on `conversation_channel_mappings` already enforces `client_id = get_my_client_id()`. A malicious user cannot subscribe to another tenant's mappings even via Realtime.
- Pairing link URL (`t.me/<bot>?start=<token>`) is short-lived (10 min) and single-use (consumed by webhook on `/start`).
- Disconnect API uses `authenticateRequest()` — verified per-request.

## System-Wide Impact

### Interaction graph

Happy path:
1. Page loads (SSR) → `loadTelegramChatId()` → `conversation_channel_mappings` SELECT → render `TelegramConnectRow` with `initialChatId`.
2. User clicks **Connect** → `POST /api/telegram/generate-pairing-link` → UI shows `link-ready` with countdown.
3. User taps link → Telegram app → `/start <token>` → webhook (`/api/webhook/telegram`) → insert mapping row.
4. Supabase Realtime fires `INSERT` event on `conversation_channel_mappings` → `useRealtimeTable` invalidates query → query refetches → `initialChatId` now populated → row renders `connected`.
5. User clicks **Disconnect** → `DELETE /api/telegram/disconnect` → webhook path not involved → mapping row deleted → Realtime `DELETE` event → query invalidates → row renders `idle`.

Cancel path:
- User clicks **Cancel** during `link-ready` → clear `pairingUrl` state locally. The token row in `telegram_pairing_tokens` is not explicitly deleted (it will TTL-expire in ≤10 min and/or be overwritten on next "Generate"). Minor orphan risk noted in PR 1's analysis already; not addressed here (separate concern).

Expired path:
- `setInterval` ticks past `linkExpiresAt` → clear `pairingUrl`, set an "Link expired — generate a new one" inline notice, return to `idle`.

### Error propagation

- Network/5xx on `generate-pairing-link` → `setErrorText(body.error ?? "Failed to generate link.")`, stay in `idle` so user can retry.
- Network/5xx on `disconnect` → same pattern, stay in `connected`.
- Realtime subscription fails silently (no user-visible error by design in `use-realtime.ts`). Fallback: a manual refresh still works — `useQuery` refetches on window-focus by default.

### State lifecycle risks

- **Orphan pairing token** if user clicks Cancel before `/start` completes. Accepted: token TTLs in 10 min, and `generate-pairing-link:25-32` deletes prior tokens for the client before inserting a new one. No multi-token stacking possible.
- **Stale "connected" after server-side disconnect by another tab** → Realtime DELETE event propagates to all tabs, both flip simultaneously. Correct.
- **Stale "idle" after server-side connect by webhook** → Realtime INSERT event propagates. Correct.

### API surface parity

No other interface exposes Telegram connection management. Parity is trivial.

### Integration test scenarios

Manual E2E (no automation this PR):
1. Fresh user, never paired — verify row shows `idle`, Connect button.
2. Click Connect — verify `link-ready` state shows countdown and "Open Telegram" button.
3. In Telegram, tap Start on the deep link — verify page flips to `connected` **without manual refresh**. (Requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and a registered `setWebhook` pointing at a public URL — ngrok for local dev.)
4. Click Disconnect — verify row returns to `idle`.
5. Leave link active for 10 min without pairing — verify countdown reaches 0 and row returns to `idle` with "Link expired" notice.
6. Open a second tab while connected — verify Disconnect in tab A flips tab B within <2s.

## Acceptance Criteria

### Functional

- [ ] `/settings/workspace/messaging-channels` renders 5 rows: Telegram (DM), Telegram Group, Slack, WhatsApp, iMessage — in that order.
- [ ] Only the Telegram (DM) row has a functional Connect button; the other 4 are visibly disabled with "Coming soon".
- [ ] Clicking Connect generates a pairing link and renders `link-ready` state with: "Open Telegram" button, a countdown showing remaining time (updates every second), Cancel link, and Generate new link button.
- [ ] Pairing in Telegram causes the page to flip to `connected` state without manual refresh.
- [ ] Disconnect removes the mapping and returns the row to `idle`.
- [ ] `connected` state shows the external chat id.
- [ ] Link expiration (10 min) auto-returns the row to `idle` with an "expired" notice.
- [ ] Multiple tabs stay in sync: disconnecting in one flips the other within 2s.

### Non-functional

- [ ] No new API routes.
- [ ] No new DB migrations.
- [ ] No new env vars.
- [ ] No new npm dependencies.
- [ ] No raw Tailwind palette classes. Flexoki semantic tokens only (`border-border/70`, `bg-card`, `bg-success/5`, `text-success`, `text-muted-foreground`, etc.).
- [ ] Every new file has a file-level JSDoc `@module` header.
- [ ] File naming follows existing conventions (lowercase-with-dashes, `component.test.tsx` in `__tests__/`).

### Quality gates

- [ ] Vitest suites on: `channel-row.tsx`, `telegram-connect-row.tsx` (renders correctly in each of 5 states, click Connect fires correct fetch with correct body), `disabled-channel-row.tsx` (renders disabled button, no handler). Mock `fetch` via `vi.fn()`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Manual E2E checklist (above) executed on local dev against an ngrok-tunneled webhook.

## Success Metrics

- User can connect Telegram end-to-end in ≤30 seconds from landing on `/settings/workspace/messaging-channels` (excluding Telegram-side tap time).
- "Waiting for connection…" → "Connected" flip is visible in ≤2s after the Telegram `/start` tap.
- Zero manual page refreshes required after initial load.

## Dependencies & Risks

### Dependencies

- PR 1 (Settings IA revamp) must merge first — this PR replaces the stub at `/settings/workspace/messaging-channels` created there.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` must be set in the runtime env (dev + prod). Not this PR's job, but the page will render a 500 error toast on Connect until they are.
- A registered Telegram webhook (`setWebhook`). Also runtime config, not PR work.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Realtime subscription not delivering INSERT events because table isn't in whitelist | N/A (handled) | Add `conversation_channel_mappings` to `RealtimeTableName` union at `src/hooks/use-realtime.ts:12-27`. |
| Realtime silently fails (network, RLS misconfig) and user sees stale `link-ready` | Low | Fallback: `useQuery` refetches on window-focus by default. User switching tabs and back resyncs. Also: the 10-min countdown expires the link anyway. |
| User generates multiple pairing links in rapid succession and gets confused which is valid | Low | `generate-pairing-link:25-32` already deletes prior tokens before inserting new one. Only the latest link works. |
| Disconnect API fails mid-flight, UI shows `idle` but mapping still exists | Low | Query refetches on window-focus; Realtime DELETE event is canonical. Worst case user sees "connected" on refresh and retries disconnect. |
| Server-rendered `initialChatId` goes stale by the time client Realtime mounts (race) | Very low | Query is set with `initialData: initialChatId`. On mount, `useQuery` will refetch on any subscription event. Race window is ~100ms. |
| The `useRealtimeTable` whitelist edit breaks types elsewhere | Very low | It's a union type addition; purely additive. No callers break. |

### Out of scope (explicit)

- Telegram Group (Topics) support — schema change, webhook branching, different pairing flow. Separate PR.
- Slack / WhatsApp / iMessage real integrations — vendor decisions, OAuth, webhooks. Separate PRs.
- Code-paste pairing UX as alternative to deep link. Deep link works; YAGNI.
- Sidebar or settings-layout changes (PR 1 owns those).
- `.env.example` updates for `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET`. Infra config, not code.
- Error recovery / retry UI beyond the simple inline error text. If a retry is needed, user clicks Connect again.
- Telemetry on pairing success rate. Nice-to-have, not shipping with v1.

## Implementation Plan

### Files to create

| Path | Purpose |
|---|---|
| `src/components/settings/messaging-channels/channel-row.tsx` | Client component. Shared row primitive: `<ChannelRow icon, title, description, children>` where `children` is the right-slot (the action/status). Uses Flexoki tokens, `bg-card`, `border-border/70`, `rounded-xl`. |
| `src/components/settings/messaging-channels/telegram-connect-row.tsx` | Client component. Full Telegram state machine. Props: `{ clientId, initialChatId }`. Internally uses `useQuery` + `useRealtimeTable` + local state for pairing link. |
| `src/components/settings/messaging-channels/disabled-channel-row.tsx` | Client component (or server, but easier as client for consistency). Thin wrapper: renders `<ChannelRow>` with a disabled ShadCN `Button` in the right-slot. |
| `src/components/settings/messaging-channels/__tests__/channel-row.test.tsx` | Vitest + RTL. Renders icon, title, description, and slotted children. |
| `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx` | Vitest + RTL. Renders each of 5 states; mocks `fetch` and verifies POST/DELETE calls; mocks `useRealtimeTable` (no-op) and simulates query-cache update to verify connected-state render. |
| `src/components/settings/messaging-channels/__tests__/disabled-channel-row.test.tsx` | Vitest + RTL. Renders the disabled button with "Coming soon" label, verifies it has no click handler / is disabled. |

### Files to edit

| Path | Change |
|---|---|
| `app/(dashboard)/settings/workspace/messaging-channels/page.tsx` | Replace PR 1's stub with the real Server Component: pre-fetches `initialChatId` via `loadTelegramChatId`, renders title + description + the 5 rows, passes props into `TelegramConnectRow`. Use `createClient()` from `@/lib/supabase/server`. |
| `src/hooks/use-realtime.ts` | Add `"conversation_channel_mappings"` to the `RealtimeTableName` union (line ~12-27). One-line additive edit. |

### Files to delete

None. PR 1 already cleaned up `telegram-connect-card.tsx`.

### Order of work (safe-commit atomic steps)

1. Edit `src/hooks/use-realtime.ts` to whitelist `conversation_channel_mappings`. Verify typecheck passes.
2. Create `channel-row.tsx` + test. Verify renders.
3. Create `disabled-channel-row.tsx` + test. Verify renders.
4. Create `telegram-connect-row.tsx` (skeleton: idle + connected states only first). Verify renders when passed `initialChatId = null` and `initialChatId = "12345"`.
5. Wire `generate-pairing-link` mutation → `link-ready` state with Open Telegram button and Cancel. Verify fetch mock.
6. Add countdown timer (`setInterval` + `formatCountdown`). Verify ticks.
7. Add `useRealtimeTable` subscription. Manual smoke test: insert a mapping row via SQL editor and verify the UI flips.
8. Wire `disconnect` mutation. Verify fetch mock.
9. Replace the page stub at `settings/workspace/messaging-channels/page.tsx` with the real Server Component + 5 rows.
10. Run `pnpm lint`, `pnpm typecheck`, Vitest. All green.
11. Manual E2E walkthrough per the checklist above. Requires env vars + ngrok.
12. Commit: `feat(pr??): messaging channels — Telegram connect + stubs with realtime flip`.

## Sources & References

### Internal references

- Settings IA revamp plan (PR 1): `docs/product/plans/2026-04-20-001-feat-settings-ia-revamp-plan.md`
- Telegram pairing API: `app/api/telegram/generate-pairing-link/route.ts:14-55`
- Telegram disconnect API: `app/api/telegram/disconnect/route.ts:9-42`
- Old Telegram card (being replaced): `app/(dashboard)/settings/telegram-connect-card.tsx:23-131`
- Realtime hook: `src/hooks/use-realtime.ts:12-27` (whitelist), `:43-83` (implementation)
- Realtime usage example — meetings: `src/hooks/use-meetings.ts:82-96`
- Server-side Telegram chat-id load: `app/(dashboard)/settings/page.tsx:61-76`
- Mapping RLS policies: `supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql:67-81`
- Channel constant: `src/lib/channels/telegram/webhook.ts:43` (`TELEGRAM_CHANNEL = "telegram"`)
- Auth helper: `src/lib/api/route-helpers.ts:14-36`
- Countdown utility: `src/lib/triggers/cron-display.ts:25-42`
- Icon registry: `src/components/icons/app-icons.tsx:75-148`
- Row visual reference (Automations): `src/components/automations/automations-list.tsx:116-161`
- Row visual reference (Meetings): `src/components/meetings/meeting-row.tsx:35-55`
- Test pattern: `src/components/automations/__tests__/automations-list.test.tsx:1-95`

### Conventions (CLAUDE.md)

- `CLAUDE.md:90` — lowercase-with-dashes directory naming.
- `CLAUDE.md:96` — commit convention `feat(pr##): …`.
- `CLAUDE.md:105-106` — TanStack Query for data fetching; Zod for data exchange.
- `CLAUDE.md:109` — prefer Server Components.
- `CLAUDE.md:123` — Flexoki semantic tokens only.
- `CLAUDE.md:128` — JSDoc module headers.

### Related work

- Telegram integration backend: shipped in PR 41 / PR 42 (see `docs/product/tasks/2026-03-20-pr41-telegram-bot-setup-tasklist.md` and `-pr42-telegram-approvals-tasklist.md`).
- PR 3+ (deferred): Telegram Group with Topics, Slack, WhatsApp, iMessage.
