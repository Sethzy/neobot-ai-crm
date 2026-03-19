# Telegram Integration Drift Analysis: NanoClaw vs Dorabot vs Sunder

> **Date:** 2026-03-16
> **Purpose:** Identify correct reference patterns for Sunder's Telegram integration (PRs 41-42). Default is zero drift from reference codebases. All justified drift is documented with reasons.
> **Decision:** Cut Vercel AI SDK Chat SDK adapter. Use raw Telegram Bot API (grammy) following nanoclaw + dorabot patterns.

---

## 1. Reference Codebases

| Repo | Description | Local Path |
|------|-------------|------------|
| **NanoClaw** | Personal AI assistant framework. Multi-channel (Telegram, WhatsApp, Discord, Slack). Self-hosted, single Node.js process, SQLite, Linux containers. | `/Users/sethlim/Documents/nanoclaw-1` |
| **Dorabot** | Self-learning AI agent framework. Multi-channel (Telegram, WhatsApp). Self-hosted, gateway WebSocket server, SQLite, Claude Agent SDK. | `/Users/sethlim/Documents/dorabot` |

Both are production-grade, open-source, and use the same fundamental patterns for Telegram integration.

---

## 2. Pattern Comparison: NanoClaw vs Dorabot

### 2.1 Channel Abstraction

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Interface** | `Channel` (name, connect, sendMessage, isConnected, ownsJid, disconnect, setTyping?, syncGroups?) | `ChannelHandler` (send, edit, delete, typing?) + `InboundMessage` type |
| **Registry** | `registerChannel(name, factory)` — factory returns `Channel \| null` | `registerChannelHandler(channel, handler)` — handler registered inside monitor |
| **Auto-enable** | Factory returns `null` if env vars missing | Monitor throws if token missing |
| **JID routing** | `ownsJid(jid)` — each channel claims JID patterns (e.g., `tg:123`) | Channel name is explicit in `InboundMessage.channel` field |
| **File** | `src/channels/registry.ts` | `src/tools/messaging.ts` (registry) + `src/channels/types.ts` (types) |

**Verdict:** Both use a channel registry + handler pattern. NanoClaw's is slightly more formal (factory pattern with auto-disable). Dorabot's is simpler (register handler directly). **Copy dorabot's approach** — it's closer to how Sunder works (explicit channel field, not JID-based routing).

### 2.2 Telegram Bot Setup

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Library** | grammy (implied from skill docs) | grammy ^1.21.0 |
| **Token storage** | `.env` file (`TELEGRAM_BOT_TOKEN`) | `~/.dorabot/telegram/token` file, fallback to env var |
| **Bot creation** | `new Bot(token)` | `createTelegramBot({ token })` → `new Bot(token)` |
| **Polling** | Long polling via grammy | Long polling via `@grammyjs/runner` (non-blocking) |
| **File** | `src/channels/telegram.ts` (merged via skill) | `src/channels/telegram/bot.ts` |

**Verdict:** Both use grammy. Dorabot has cleaner separation (bot.ts, format.ts, send.ts, media.ts, monitor.ts). **Copy dorabot's file structure.** Token from env var only (Sunder convention).

### 2.3 Inbound Message Handling

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Message format** | `NewMessage` (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) | `InboundMessage` (id, channel, accountId, chatId, chatType, senderId, senderName, body, timestamp, replyToId, replyToBody, mediaPath, mediaType, raw) |
| **Auth check** | Trigger pattern (`@Andy`) + sender allowlist | `allowFrom` list (user IDs) |
| **Group handling** | Groups registered in DB, trigger required for non-main groups | `groupPolicy` config (open/allowlist/disabled) |
| **Commands** | N/A (trigger-based) | `/new`, `/status` commands via `bot.command()` |
| **Media** | Not in Telegram impl (WhatsApp only) | Full media download (photos, video, audio, documents, voice) |

**Verdict:** Dorabot's `InboundMessage` is richer. **Copy dorabot's InboundMessage shape** but adapt field names to Sunder's existing message model.

### 2.4 Message Formatting & Sending

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Format** | XML for agent prompt (not relevant to Telegram send) | Markdown → Telegram HTML conversion |
| **HTML conversion** | N/A | `markdownToTelegramHtml()` — handles bold, italic, code, links, headings, blockquotes |
| **Sanitization** | N/A | `sanitizeTelegramHtml()` — strips unsupported tags, closes unclosed tags |
| **Chunking** | N/A (simple sendMessage) | `splitTelegramMessage()` — 4000 char limit, respects HTML tag boundaries |
| **Fallback** | N/A | If HTML parse fails, retry as plain text |
| **File** | `src/channels/telegram.ts` (sendMessage method) | `src/channels/telegram/format.ts` + `src/channels/telegram/send.ts` |

**Verdict:** Dorabot has the complete message formatting pipeline. **Copy dorabot's format.ts and send.ts exactly.** This is the hardest part to get right (HTML tag boundaries, chunking, fallback).

### 2.5 Approvals

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Telegram** | N/A (not implemented) | `InlineKeyboard` with `approve:{requestId}` / `deny:{requestId}` callback data |
| **WhatsApp** | N/A | Text-based ("Reply 1 to Allow, 2 to Deny") with pending state tracking |
| **Handler** | N/A | `bot.on('callback_query:data')` parses callback, calls `onApprovalResponse` |
| **File** | N/A | `src/channels/telegram/monitor.ts` (lines ~80-130) |

**Verdict:** Only dorabot has Telegram approval implementation. **Copy dorabot's InlineKeyboard approval pattern exactly.** This overrides the v2 plan's "skip inline keyboards" note — inline keyboards are the correct pattern for Telegram approvals.

### 2.6 Concurrency & Queuing

| Aspect | NanoClaw | Dorabot |
|--------|----------|---------|
| **Queue** | `GroupQueue` — in-memory, max concurrent containers, per-group serialization | Session-based — one active run per session key |
| **Message piping** | File-based IPC — pipe messages to running container | WebSocket gateway — queue messages for active sessions |
| **Cursor** | `lastAgentTimestamp` per group, rolled back on error | Session message list, SDK session resume |

**Verdict:** Sunder already has `thread_queue_records` + `drain_thread_queue` RPC. **No new queue code needed.** Sunder's existing pattern is correct.

---

## 3. Correct Pattern for Sunder (What to Copy)

### 3.1 From Dorabot (Primary Reference)

| File to Copy | Dorabot Source | Sunder Target | Notes |
|-------------|---------------|---------------|-------|
| Channel types | `src/channels/types.ts` | `src/lib/channels/types.ts` | Adapt `InboundMessage` to Sunder's message model. Keep `ChannelHandler` interface (send, edit, delete, typing). |
| Channel registry | `src/tools/messaging.ts` (registry functions) | `src/lib/channels/registry.ts` | `registerChannelHandler()`, `getChannelHandler()`. Minimal. |
| Telegram bot setup | `src/channels/telegram/bot.ts` | `src/lib/channels/telegram/bot.ts` | `createTelegramBot()`, token from `TELEGRAM_BOT_TOKEN` env var only. |
| Telegram formatting | `src/channels/telegram/format.ts` | `src/lib/channels/telegram/format.ts` | **Copy exactly.** `markdownToTelegramHtml()`, `sanitizeTelegramHtml()`. Battle-tested. |
| Telegram sending | `src/channels/telegram/send.ts` | `src/lib/channels/telegram/send.ts` | **Copy exactly.** `sendTelegramMessage()`, `splitTelegramMessage()`, `normalizeTelegramChatId()`. Chunking logic is tricky. |
| Telegram monitor | `src/channels/telegram/monitor.ts` | `src/lib/channels/telegram/monitor.ts` | Adapt heavily. Replace gateway callbacks with Sunder's `runAgent()` + `channel_mappings` + `delivery_receipts`. Keep: access control, command handling, approval InlineKeyboard, media handling structure. |
| Telegram media | `src/channels/telegram/media.ts` | `src/lib/channels/telegram/media.ts` | Copy `downloadTelegramFile()`. Adapt storage to Supabase Storage instead of local filesystem. |
| Config types | `src/config.ts` (TelegramChannelConfig) | `src/lib/channels/telegram/config.ts` | Subset: `enabled`, `botToken`, `allowFrom`. No `groupPolicy` (Sunder is single-user per client). |

### 3.2 From NanoClaw (Supporting Reference)

| Pattern | NanoClaw Source | Use in Sunder | Notes |
|---------|----------------|---------------|-------|
| Factory auto-disable | `src/channels/registry.ts` | Channel factory returns `null` if `TELEGRAM_BOT_TOKEN` missing | Good defensive pattern. |
| Message XML format | `src/router.ts` (`formatMessages()`) | Reference only | Sunder uses AI SDK message format, not XML. |
| Typing indicator | `Channel.setTyping()` | `channel.typing(chatId)` | Both repos implement this. Copy from dorabot. |
| Error rollback | `processGroupMessages()` cursor rollback | Reference only | Sunder's queue already handles this. |

---

## 4. Justified Drift from Reference Codebases

### 4.1 DRIFT: Serverless Webhook vs Long Polling

| Reference Pattern | NanoClaw: SQLite polling loop (2s interval). Dorabot: grammy long polling (`@grammyjs/runner`). |
|---|---|
| **Sunder Pattern** | Vercel Functions webhook endpoint (`/api/webhook/telegram`). |
| **Why Drift** | Sunder runs on Vercel (serverless). No long-running process to poll. Telegram's `setWebhook` API pushes updates to our URL. This is the standard serverless pattern and is explicitly recommended by Telegram for production bots. |
| **Impact** | Replace dorabot's `run(bot)` polling with `bot.api.setWebhook(url)` + webhook handler route. The rest of the pipeline (message parsing, formatting, sending) stays identical. |

### 4.2 DRIFT: Database (Supabase Postgres vs SQLite)

| Reference Pattern | Both repos: SQLite (`better-sqlite3`). Messages stored locally. |
|---|---|
| **Sunder Pattern** | Supabase Postgres. Existing tables: `messages`, `threads`, `conversation_channel_mappings`, `conversation_channel_delivery_receipts`. |
| **Why Drift** | Sunder is multi-tenant SaaS with RLS. SQLite is single-user. No new tables needed — Sunder's existing thread/message model + channel mapping tables already cover the use case. |
| **Impact** | Replace SQLite reads/writes with Supabase client calls. Message storage uses existing `messages` table. Channel mapping uses existing `conversation_channel_mappings`. Idempotency uses existing `conversation_channel_delivery_receipts`. |

### 4.3 DRIFT: Agent Invocation (runAgent vs Container)

| Reference Pattern | NanoClaw: `runContainerAgent()` spawns Linux container. Dorabot: Claude Agent SDK `query()` with session resume. |
|---|---|
| **Sunder Pattern** | Existing `runAgent()` in `src/lib/runner/run-agent.ts`. Vercel AI SDK `streamText()` with `maxSteps`. |
| **Why Drift** | Sunder's runner is already built and working. It handles context assembly, tool execution, memory, and persistence. The Telegram integration just needs to call the same function the web chat uses. |
| **Impact** | Webhook route calls `runAgent()` directly. No new agent code. Response text is sent back via grammy `sendMessage`. |

### 4.4 DRIFT: No JID-Based Routing

| Reference Pattern | NanoClaw: JID patterns (`tg:123`, `123@s.whatsapp.net`). `ownsJid()` on each channel. |
|---|---|
| **Sunder Pattern** | `conversation_channel_mappings.channel` column (`'web'`, `'telegram'`, `'whatsapp'`). Explicit channel field. |
| **Why Drift** | JID routing is for multi-channel processes running in one loop. Sunder's channels are separate webhook endpoints — each endpoint already knows its channel. Dorabot also uses explicit `channel` field in `InboundMessage`. |
| **Impact** | No `ownsJid()` needed. Channel is determined by which webhook endpoint received the request. |

### 4.5 DRIFT: Approval Pattern (InlineKeyboard, Not Text)

| Reference Pattern | Dorabot Telegram: `InlineKeyboard` with callback data. Dorabot WhatsApp: text-based ("Reply 1 or 2"). NanoClaw: no approval implementation. |
|---|---|
| **Sunder Pattern** | Copy dorabot's Telegram `InlineKeyboard` pattern exactly. |
| **Why Drift** | The v2 plan previously said "skip inline keyboards" — this is overridden. Inline keyboards are the correct UX for Telegram approvals. Text-based approval is the WhatsApp fallback (no inline keyboards available). |
| **Impact** | `sendApprovalRequest()` sends `InlineKeyboard` with `approve:{requestId}` / `deny:{requestId}`. `bot.on('callback_query:data')` handles response. Requires connecting to Sunder's existing `approval_events` table. |

### 4.6 DRIFT: No Media Support in v1

| Reference Pattern | Dorabot: full media download (photos, video, audio, documents, voice notes). |
|---|---|
| **Sunder Pattern** | Text-only in v1. Media support deferred. |
| **Why Drift** | Sunder's agent doesn't generate media (images, audio). Inbound media from users is not useful for a CRM agent in v1. Adding media download + Supabase Storage upload is scope creep. |
| **Impact** | Skip `media.ts`. Inbound messages with media but no text are ignored. Messages with media + caption use caption as text body. |

### 4.7 DRIFT: No Session Key / Session Resume

| Reference Pattern | Dorabot: session key format `"telegram:dm:{chatId}"`. SDK session resume via `sdkSessionId`. |
|---|---|
| **Sunder Pattern** | Thread-based. Each Telegram chat maps to a thread via `conversation_channel_mappings`. Thread ID is the session key. |
| **Why Drift** | Sunder already has thread-based conversation management. Adding a separate session key system would be redundant. The `channel_mappings` table handles the `external_conversation_id → thread_id` mapping. |
| **Impact** | On first message from a Telegram chat, create a new thread + mapping. Subsequent messages look up existing mapping. |

---

## 5. Zero-Drift Patterns (Copy Exactly)

These patterns should be copied with **no modifications** from dorabot:

| Pattern | Source File | What to Copy |
|---------|------------|-------------|
| Markdown → Telegram HTML | `dorabot/src/channels/telegram/format.ts` | `markdownToTelegramHtml()`, `sanitizeTelegramHtml()`, `SUPPORTED_TAGS` |
| Message chunking | `dorabot/src/channels/telegram/send.ts` | `splitTelegramMessage()`, `MSG_LIMIT = 4000` |
| Chat ID normalization | `dorabot/src/channels/telegram/send.ts` | `normalizeTelegramChatId()` |
| HTML parse fallback | `dorabot/src/channels/telegram/send.ts` | Try `parse_mode: 'HTML'`, catch, fallback to plain text |
| InlineKeyboard approval | `dorabot/src/channels/telegram/monitor.ts` | `InlineKeyboard().text('Allow', 'approve:{id}').text('Deny', 'deny:{id}')` |
| Callback query handler | `dorabot/src/channels/telegram/monitor.ts` | `bot.on('callback_query:data', ...)` parsing |
| Typing indicator | `dorabot/src/channels/telegram/monitor.ts` | `bot.api.sendChatAction(chatId, 'typing')` |
| Bot token validation | `dorabot/src/channels/telegram/bot.ts` | `bot.api.getMe()` to verify token on startup |
| Channel handler interface | `dorabot/src/channels/types.ts` | `ChannelHandler` (send, edit, delete, typing) |

---

## 6. File Plan for Sunder PRs 41-42

### PR 41: Telegram Integration — Bot Setup

```
src/lib/channels/
├── types.ts                      # InboundMessage, ChannelHandler, SendOptions (from dorabot)
├── registry.ts                   # registerChannelHandler(), getChannelHandler() (from dorabot)
└── telegram/
    ├── bot.ts                    # createTelegramBot(), token resolution (from dorabot)
    ├── format.ts                 # markdownToTelegramHtml(), sanitizeTelegramHtml() (COPY EXACT from dorabot)
    ├── send.ts                   # sendTelegramMessage(), splitTelegramMessage() (COPY EXACT from dorabot)
    ├── monitor.ts                # startTelegramMonitor() — adapted for Sunder webhook model
    └── index.ts                  # barrel exports

app/api/webhook/telegram/
└── route.ts                      # POST handler: verify → dedupe → map → runAgent → reply

Environment:
  TELEGRAM_BOT_TOKEN=...          # From BotFather
  TELEGRAM_WEBHOOK_SECRET=...     # For webhook verification
```

### PR 42: Telegram Approvals + Identity

```
src/lib/channels/telegram/
├── approvals.ts                  # sendApprovalRequest() — InlineKeyboard (from dorabot)
└── monitor.ts                    # Add callback_query handler for approvals (from dorabot)

Existing files to modify:
  src/lib/runner/tools/           # approval_events integration with Telegram delivery
  src/lib/approvals/              # Wire Telegram as a delivery channel for approval requests
```

### Existing Sunder Files (No Changes Needed)

| File | Why |
|------|-----|
| `conversation_channel_mappings` table | Already exists with `telegram` channel support |
| `conversation_channel_delivery_receipts` table | Already exists for idempotency |
| `src/lib/runner/run-agent.ts` | Same runAgent() for all channels |
| `thread_queue_records` + `drain_thread_queue` | Same queue for all channels |

---

## 7. Dependencies to Add

```json
{
  "grammy": "^1.21.0",
  "@grammyjs/runner": "^2.0.3"
}
```

Both are used by dorabot. `@grammyjs/runner` may not be needed if using webhook mode (serverless), but useful for local dev polling mode.

---

## 8. Reference File Index

### Dorabot (Primary Reference — Copy From)

| Purpose | File Path |
|---------|-----------|
| Channel types | `/Users/sethlim/Documents/dorabot/src/channels/types.ts` |
| Channel registry | `/Users/sethlim/Documents/dorabot/src/tools/messaging.ts` |
| Telegram bot | `/Users/sethlim/Documents/dorabot/src/channels/telegram/bot.ts` |
| Telegram format | `/Users/sethlim/Documents/dorabot/src/channels/telegram/format.ts` |
| Telegram send | `/Users/sethlim/Documents/dorabot/src/channels/telegram/send.ts` |
| Telegram media | `/Users/sethlim/Documents/dorabot/src/channels/telegram/media.ts` |
| Telegram monitor | `/Users/sethlim/Documents/dorabot/src/channels/telegram/monitor.ts` |
| Config schema | `/Users/sethlim/Documents/dorabot/src/config.ts` |
| Gateway channel mgr | `/Users/sethlim/Documents/dorabot/src/gateway/channel-manager.ts` |
| Session manager | `/Users/sethlim/Documents/dorabot/src/session/manager.ts` |

### NanoClaw (Supporting Reference)

| Purpose | File Path |
|---------|-----------|
| Channel interface | `/Users/sethlim/Documents/nanoclaw-1/src/types.ts` (lines 82-108) |
| Channel registry | `/Users/sethlim/Documents/nanoclaw-1/src/channels/registry.ts` |
| Orchestration loop | `/Users/sethlim/Documents/nanoclaw-1/src/index.ts` |
| Message routing | `/Users/sethlim/Documents/nanoclaw-1/src/router.ts` |
| Group queue | `/Users/sethlim/Documents/nanoclaw-1/src/group-queue.ts` |
| Database layer | `/Users/sethlim/Documents/nanoclaw-1/src/db.ts` |
| IPC system | `/Users/sethlim/Documents/nanoclaw-1/src/ipc.ts` |

---

## 9. Decision Summary

| Decision | Choice | Reason |
|----------|--------|--------|
| Primary reference | **Dorabot** | Cleaner file structure, richer message types, complete format/send/approval pipeline |
| Bot library | **grammy** | Both repos use it. Industry standard for Telegram bots in TypeScript |
| Message delivery | **Webhook** (drift from both) | Sunder is serverless on Vercel. Polling requires long-running process |
| Formatting | **Copy exact** from dorabot | `markdownToTelegramHtml()` + `sanitizeTelegramHtml()` + `splitTelegramMessage()` |
| Approvals | **InlineKeyboard** from dorabot | Correct Telegram UX. Overrides v2 plan "skip inline keyboards" |
| Channel mapping | **Sunder's existing tables** | `conversation_channel_mappings` + `delivery_receipts` already built |
| Agent invocation | **Sunder's existing `runAgent()`** | Same function for web + Telegram. No new agent code |
| Media | **Deferred** (drift from dorabot) | Not useful for CRM agent in v1 |
| Queue | **Sunder's existing queue** | `thread_queue_records` + `drain_thread_queue` already handles concurrency |
