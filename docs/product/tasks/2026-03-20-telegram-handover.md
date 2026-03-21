# Telegram Integration — Handover Brief

## What to Build

Sunder needs Telegram as a second channel (after web chat) so real estate agents can message their AI agent from their phone. Two PRs:

- **PR 41** (15 tasks): Bot setup, deep link pairing, webhook, message formatting, media, `/new` command, Settings UI
- **PR 42** (7 tasks): Approval InlineKeyboards, question UI, disconnect/unpairing

## Reference Repo

**Dorabot** (`/Users/sethlim/Documents/dorabot-1/src/channels/telegram/`) is the canonical reference. Copy code from it with minimal adaptation. The Telegram code is stable — identical across v0.2.14 → v0.2.65.

Files to read before starting:

| File | What It Is | Copy Strategy |
|------|-----------|---------------|
| `dorabot-1/src/channels/telegram/format.ts` | Markdown → Telegram HTML + sanitizer | **Copy exactly.** Zero changes except JSDoc + remove `.js` imports. |
| `dorabot-1/src/channels/telegram/send.ts` | Send, edit, delete, media dispatch, smart chunking | **Copy exactly.** Keep ALL functions (send + edit + delete + media). |
| `dorabot-1/src/channels/telegram/bot.ts` | Bot factory + token resolution | **Adapt.** Env-var-only token (no file fallback). Add `validateTelegramToken()`. |
| `dorabot-1/src/channels/telegram/media.ts` | Telegram File API download | **Adapt.** Replace local filesystem save with Supabase Storage upload. |
| `dorabot-1/src/channels/telegram/monitor.ts` | Polling loop, commands, approvals, questions | **Decompose into webhook route.** Extract approval/question callback patterns. Replace polling with Vercel webhook. |
| `dorabot-1/src/channels/types.ts` | `InboundMessage`, `ChannelHandler`, `SendOptions` | **Reference only.** Sunder uses its own message model. |

## Key Architectural Differences from Dorabot

Dorabot is self-hosted single-user. Sunder is multi-tenant SaaS on Vercel. Five justified drifts:

1. **Webhook, not polling** — Vercel is serverless. No long-running process. grammy's `webhookCallback` replaces `@grammyjs/runner`.
2. **Deep link pairing, not allowlist** — Multi-tenant needs `t.me/SunderBot?start=<token>` flow to map Telegram users to Sunder clients. Telegram's official recommendation.
3. **Supabase Postgres, not SQLite** — Existing `conversation_channel_mappings` + `delivery_receipts` tables handle channel routing and dedup.
4. **Existing `runAgent()`, not container spawn** — Same function the web chat uses. No new agent code.
5. **Supabase Storage, not local filesystem** — Media uploads go to per-client storage paths.

## Read These Documents (In Order)

1. **Drift analysis** — `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md`
   Every drift justified with reasons. Zero-drift patterns listed. File plan with diagrams.

2. **Dorabot complete reference** — `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/dorabot-telegram-complete-reference.md`
   Function-by-function inventory. What to copy, what to adapt, what to skip.

3. **Claude Code channel reference** — `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/claude-code-telegram-channel-reference.md`
   How Anthropic's own Telegram plugin works. Different architecture (MCP channel bridge), but useful security pattern (gate on sender ID, prompt injection note).

4. **PR 41 tasklist** — `docs/product/tasks/2026-03-20-pr41-telegram-bot-setup-tasklist.md`
   15 tasks, TDD, exact code, exact file paths.

5. **PR 42 tasklist** — `docs/product/tasks/2026-03-20-pr42-telegram-approvals-tasklist.md`
   7 tasks covering approvals, questions, disconnect.

6. **v2 plan** — `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
   Phase 5 section. PR 41 has 8 tracked subtasks, PR 42 has 4. Both marked `in_progress`.

## Message Flow (Steady State)

```
User sends "check my deals" in Telegram
  → Telegram POSTs to /api/webhook/telegram
  → Verify X-Telegram-Bot-Api-Secret-Token header
  → Lookup channel_mappings (chat_id → client_id + thread_id)
  → Dedupe via delivery_receipts (update_id)
  → bot.api.sendChatAction(chatId, 'typing')
  → runAgent({ clientId, threadId, input })
  → sendTelegramMessage(bot.api, chatId, response)
    → markdownToTelegramHtml → sanitize → chunk at 4000 chars → send
  → User sees formatted response in Telegram
```

## Pairing Flow (First Time)

```
Settings UI → POST /api/telegram/generate-pairing-link
  → generates base64url token (≤64 chars, 10min TTL)
  → stores in telegram_pairing_tokens table
  → returns t.me/SunderBot?start=<token>
User taps link → Telegram → /start <token>
  → Webhook validates token, creates thread + channel_mapping, consumes token
  → Bot replies "Connected!"
```

## Dependencies

```
grammy: ^1.21.0    (same version as dorabot)
```

That's it. No `@grammyjs/runner` (webhook mode). No `@grammyjs/transformer-throttler` (not used in dorabot either).

## Existing Infrastructure (Don't Rebuild)

| Already Built | Where |
|--------------|-------|
| `conversation_channel_mappings` table | Migration `20260304213000` — maps `(client_id, 'telegram', chat_id) → thread_id` |
| `conversation_channel_delivery_receipts` table | Migration `20260304213000` — dedup on `(client_id, 'telegram', update_id)` |
| Channel CHECK constraint (`web`, `telegram`, `whatsapp`) | Migration `20260304220000` |
| `runAgent()` | `src/lib/runner/run-agent.ts` — same function for web + Telegram |
| `thread_queue_records` + `drain_thread_queue` | Handles concurrent messages to same thread |
| `createAdminClient()` | `src/lib/supabase/server.ts` — service-role client for webhook context (no auth cookies) |
| `authenticateRequest()` | `src/lib/api/route-helpers.ts` — for the authenticated pairing link API |
| `resolveClientId()` | `src/lib/chat/client-id.ts` — maps auth user → client_id |
| Approval events system | `src/lib/approvals/queries.ts` — `createApprovalEvent()`, `resolveApprovalEvent()` |
| Settings page | `app/(dashboard)/settings/page.tsx` — add Telegram card here |

## Review Checklist

When reviewing the implementation against dorabot:

- [ ] `format.ts` — diff against dorabot's. Should be near-identical (only JSDoc + import path changes).
- [ ] `send.ts` — diff against dorabot's. All functions present (send, edit, delete, media, chunking). HTML fallback logic intact.
- [ ] Webhook route — handles `/start <token>`, `/new`, regular messages, `callback_query` (approvals + questions). Returns 200 fast (Telegram expects <500ms).
- [ ] Pairing — token is base64url ≤64 chars, 10min TTL, single-use, consumed after mapping creation.
- [ ] Media inbound — downloads via Telegram File API, uploads to Supabase Storage under `{clientId}/telegram/`.
- [ ] Approvals — InlineKeyboard with `approve:{id}` / `deny:{id}`. Callback resolves via `resolveApprovalEvent()`. Message edited to show result.
- [ ] Questions — InlineKeyboard with `q:{requestId}:{index}`. 2 buttons per row. Message edited on selection.
- [ ] Reply context — `replyToId` and `replyToBody` extracted from `message.reply_to_message`.
- [ ] Error handling — HTML parse failures fall back to plain text. Media download failures fall back to caption-only. Callback edit failures are silent.
