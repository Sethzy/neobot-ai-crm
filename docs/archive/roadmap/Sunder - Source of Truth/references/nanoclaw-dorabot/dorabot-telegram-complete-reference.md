# Dorabot Telegram Implementation — Complete Reference

> **Date:** 2026-03-20
> **Source:** `/Users/sethlim/Documents/dorabot-1/src/channels/telegram/` (v0.2.65, latest)
> **Purpose:** Canonical reference for Sunder PRs 41-42. Documents every pattern, which files to copy, and where Sunder drifts.
> **Verified:** dorabot v0.2.14 → v0.2.65 — Telegram code is byte-for-byte identical across versions. Stable, production-settled.

---

## 1. File Structure

```
dorabot-1/src/channels/telegram/
├── bot.ts        (44 lines)   — Bot creation + token resolution
├── format.ts     (119 lines)  — Markdown → Telegram HTML + sanitization
├── send.ts       (241 lines)  — Send, edit, delete + smart chunking + media dispatch
├── media.ts      (45 lines)   — File download via Telegram File API
├── monitor.ts    (313 lines)  — Long polling, message handlers, approvals, questions, commands
└── index.ts      (6 lines)    — Barrel exports

Supporting files:
├── ../types.ts   (62 lines)   — InboundMessage, ChannelHandler, SendOptions, OutboundResult
└── ../../tools/messaging.ts   — Channel handler registry (registerChannelHandler, getChannelHandler)
```

**Total Telegram code:** ~830 lines across 6 files.

---

## 2. Feature Inventory

### 2.1 What Dorabot Implements

| # | Feature | File | Function | Lines |
|---|---------|------|----------|-------|
| 1 | Bot creation | `bot.ts` | `createTelegramBot(opts)` | 26-28 |
| 2 | Token resolution (file → env → error) | `bot.ts` | `resolveTelegramToken(tokenFile?)` | 9-24 |
| 3 | Token validation | `bot.ts` | `validateTelegramToken(token)` → `getMe()` | 36-40 |
| 4 | Markdown → HTML conversion | `format.ts` | `markdownToTelegramHtml(text)` | 4-76 |
| 5 | HTML sanitization | `format.ts` | `sanitizeTelegramHtml(html)` | 89-118 |
| 6 | Chat ID normalization | `send.ts` | `normalizeTelegramChatId(target)` | 9-16 |
| 7 | Smart message chunking | `send.ts` | `splitTelegramMessage(text, limit)` | 49-105 |
| 8 | Tag-aware split detection | `send.ts` | `isInsideTag()`, `getUnclosedTags()` | 18-45 |
| 9 | Send message (HTML + plain fallback) | `send.ts` | `sendTelegramMessage(api, target, text, opts)` | 141-195 |
| 10 | Edit message (with overflow chunks) | `send.ts` | `editTelegramMessage(api, chatId, msgId, text)` | 198-232 |
| 11 | Delete message | `send.ts` | `deleteTelegramMessage(api, chatId, msgId)` | 234-241 |
| 12 | Send media (photo/video/audio/doc) | `send.ts` | `sendMedia(api, chatId, path, caption, replyTo)` | 107-139 |
| 13 | Download Telegram file | `media.ts` | `downloadTelegramFile(api, fileId, ext, mime)` | 17-45 |
| 14 | Inbound text messages | `monitor.ts` | `bot.on('message:text', ...)` | 174-184 |
| 15 | Inbound media (7 types) | `monitor.ts` | `bot.on('message:photo\|video\|audio\|...')` | 187-250 |
| 16 | Access control | `monitor.ts` | `checkAccess(ctx)` — allowlist + group policy | 132-148 |
| 17 | Inbound message builder | `monitor.ts` | `buildInbound(msg, isGroup, body)` — extracts replyToId, replyToBody | 150-171 |
| 18 | Channel handler registration | `monitor.ts` | `registerChannelHandler('telegram', { send, edit, delete, typing })` | 46-67 |
| 19 | Typing indicator | `monitor.ts` | `bot.api.sendChatAction(chatId, 'typing')` | 62-65 |
| 20 | `/new` command | `monitor.ts` | `bot.command('new', ...)` → `onCommand('new', chatId)` | 72-78 |
| 21 | `/status` command | `monitor.ts` | `bot.command('status', ...)` → `onCommand('status', chatId)` | 79-85 |
| 22 | Approval InlineKeyboard | `monitor.ts` | `sendApprovalRequest(req)` — `approve:{id}` / `deny:{id}` buttons | 262-285 |
| 23 | Approval callback handler | `monitor.ts` | `bot.on('callback_query:data', ...)` — parse approve/deny | 118-130 |
| 24 | Question InlineKeyboard | `monitor.ts` | `sendQuestion(req)` — numbered options, 2 per row | 287-307 |
| 25 | Question callback handler | `monitor.ts` | Parse `q:{requestId}:{index}` callbacks | 96-107 |
| 26 | Long polling | `monitor.ts` | `run(bot)` via `@grammyjs/runner` | 252-260 |
| 27 | Monitor stop | `monitor.ts` | `runner.stop()` | 309-313 |

### 2.2 Coverage in Sunder Tasklists

| # | Feature | Sunder Task | Status |
|---|---------|-------------|--------|
| 1 | Bot creation | PR41 Task 4 | ✅ Covered |
| 2 | Token resolution | PR41 Task 4 | ✅ Adapted (env only, no file fallback) |
| 3 | Token validation | PR41 Task 4 | ✅ Covered |
| 4 | Markdown → HTML | PR41 Task 2 | ✅ Copy exact |
| 5 | HTML sanitization | PR41 Task 2 | ✅ Copy exact |
| 6 | Chat ID normalization | PR41 Task 3 | ✅ Copy exact |
| 7 | Smart chunking | PR41 Task 3 | ✅ Copy exact |
| 8 | Tag-aware split | PR41 Task 3 | ✅ Copy exact |
| 9 | Send message | PR41 Task 3 | ✅ Copy exact (includes HTML fallback) |
| 10 | Edit message | — | ⚠️ **In send.ts but not called out — keep when copying** |
| 11 | Delete message | — | ⚠️ **In send.ts but not called out — keep when copying** |
| 12 | Send media (outbound) | PR41 Task 15 | ✅ Just added |
| 13 | Download file (inbound) | PR41 Task 14 | ✅ Just added (adapted for Supabase Storage) |
| 14 | Inbound text | PR41 Task 8 | ✅ Covered |
| 15 | Inbound media | PR41 Task 14 | ✅ Just added |
| 16 | Access control | PR41 Task 8 | ✅ Adapted (pairing-based, not allowlist) |
| 17 | Inbound message builder | PR41 Task 8 | ⚠️ **Partially — replyToId/replyToBody not extracted** |
| 18 | Channel handler registration | — | ❌ Not needed (Sunder uses direct function calls in webhook) |
| 19 | Typing indicator | PR41 Task 8 | ✅ In webhook route code |
| 20 | `/new` command | PR41 Task 13 | ✅ Just added |
| 21 | `/status` command | — | ❌ Skipped (Sunder has web dashboard) |
| 22 | Approval InlineKeyboard | PR42 Task 1 | ✅ Covered |
| 23 | Approval callback handler | PR42 Task 2 | ✅ Covered |
| 24 | Question InlineKeyboard | PR42 Task 6 | ✅ Just added |
| 25 | Question callback handler | PR42 Task 6 | ✅ Just added |
| 26 | Long polling | — | ❌ Replaced by webhook (justified drift) |
| 27 | Monitor stop | — | ❌ N/A for webhook |

---

## 3. Gaps to Address

### 3.1 Keep edit/delete when copying send.ts

PR41 Task 3 originally said "remove edit/delete" to keep scope small. **Don't strip them.** `editTelegramMessage()` and `deleteTelegramMessage()` are already in the file — removing them is extra work that loses functionality. The agent may want to correct a sent message or clean up an approval message after resolution.

**Action:** When copying send.ts in Task 3, copy the full file (send + edit + delete + media). Don't strip.

### 3.2 Extract reply context from inbound messages

Dorabot's `buildInbound()` extracts `replyToId` and `replyToBody` from Telegram's `reply_to_message` field. This is useful if a user replies to a specific bot message — the agent could see which message was being referenced.

**Action:** In the webhook route's message parsing, add:

```typescript
const replyToMessage = message.reply_to_message as Record<string, unknown> | undefined;
const replyToId = replyToMessage ? String(replyToMessage.message_id) : undefined;
const replyToBody = replyToMessage
  ? ((replyToMessage.text as string) ?? (replyToMessage.caption as string) ?? undefined)
  : undefined;
```

Low priority — doesn't block launch, but improves context quality for the agent.

---

## 4. Files to Copy

### Copy Exactly (zero drift)

| Dorabot Source | Sunder Target | Notes |
|---------------|---------------|-------|
| `src/channels/telegram/format.ts` | `src/lib/channels/telegram/format.ts` | Add file-level JSDoc. No code changes. |
| `src/channels/telegram/send.ts` | `src/lib/channels/telegram/send.ts` | Keep ALL functions (send + edit + delete + media). Remove `.js` from import. Add JSDoc. Adapt `sendMedia` to accept URLs (not just local paths). |

### Adapt (justified drift)

| Dorabot Source | Sunder Target | Changes |
|---------------|---------------|---------|
| `src/channels/telegram/bot.ts` | `src/lib/channels/telegram/bot.ts` | Remove file-based token resolution. Env var only. |
| `src/channels/telegram/media.ts` | `src/lib/channels/telegram/media.ts` | Replace local filesystem save with Supabase Storage upload. |
| `src/channels/telegram/monitor.ts` | `app/api/webhook/telegram/route.ts` | Decompose into webhook handlers. Replace polling with webhook. Replace allowlist with pairing. Keep: command handling, callback parsing, typing indicator. |

### Don't Copy (Sunder has equivalent)

| Dorabot Source | Why Skip |
|---------------|----------|
| `src/channels/types.ts` | Sunder uses its own message model + existing tables |
| `src/tools/messaging.ts` (registry) | Sunder calls functions directly in webhook route |
| `src/gateway/channel-manager.ts` | Sunder uses decoupled webhook endpoints |
| `src/config.ts` (TelegramChannelConfig) | Sunder uses env vars, not config files |

---

## 5. Dependencies

```json
{
  "grammy": "^1.21.0"
}
```

`@grammyjs/runner` (^2.0.3) is NOT needed — Sunder uses webhook mode. Only install if local dev polling is desired.

`@grammyjs/transformer-throttler` (^1.2.1) is listed in dorabot's package.json but **not used** in the Telegram code. Dorabot has no rate limiting implementation. Skip.

`mime-types` (^3.0.2) is used in `send.ts` for `sendMedia()` and in `media.ts` for `downloadTelegramFile()`. **Install this** if keeping media support.

---

## 6. Key Patterns to Preserve

### 6.1 HTML Parse Fallback (send.ts lines 158-176)

```typescript
try {
  result = await api.sendMessage(chatId, chunks[0], { parse_mode: 'HTML', ... });
} catch (err: any) {
  if (err?.description?.includes("can't parse")) {
    // Fallback to plain text
    result = await api.sendMessage(chatId, plainChunks[0], { ... });
  }
  throw err;
}
```

This catches Telegram's HTML parse errors (malformed LLM output) and retries as plain text. Critical for production reliability.

### 6.2 Null-Byte Token Protection (format.ts lines 8-39)

```typescript
// Protect existing HTML, code blocks, inline code, links
// using \x00HT0\x00, \x00CB0\x00, \x00IC0\x00, \x00LK0\x00 sentinels
```

Prevents double-processing of already-formatted content. The sentinel approach is battle-tested across dorabot, openclaw, and similar projects.

### 6.3 Tag-Aware Chunking (send.ts lines 18-105)

The chunking logic checks for unclosed `<pre>`, `<code>`, `<blockquote>` tags at every potential split point. If tags are unclosed, it closes them at the split and reopens in the next chunk. This prevents broken HTML in multi-message responses.

### 6.4 Approval Callback Data Format

```
approve:{requestId}    — user tapped Allow
deny:{requestId}       — user tapped Deny
q:{requestId}:{index}  — user selected question option
```

Three callback formats, all parsed from the same `callback_query:data` handler. The prefix determines the type.

---

## 7. Error Handling Patterns

| Scenario | Dorabot Pattern | Copy? |
|----------|----------------|-------|
| HTML parse fail on send | Catch → retry plain text | ✅ Yes (in send.ts) |
| HTML parse fail on edit | Catch → plain text truncation | ✅ Yes (in send.ts) |
| HTML parse fail on chunk N | Catch → strip tags, send plain | ✅ Yes (in send.ts) |
| Media download fail | Catch → send caption only | ✅ Yes (in monitor.ts) |
| Approval message edit fail | Catch → silent (message may be deleted) | ✅ Yes (in monitor.ts) |
| Typing indicator fail | Catch → silent (non-critical) | ✅ Yes |
| Approval send fail | Catch → log error | ✅ Yes |
| Question send fail | Catch → log error | ✅ Yes |

All error handlers follow the same pattern: catch, log, gracefully degrade. Never let a Telegram API error crash the request.

---

## 8. What Dorabot Does NOT Have

| Missing Feature | Relevant to Sunder? |
|----------------|---------------------|
| Webhook mode | Yes — Sunder adds this |
| Multi-tenant auth | Yes — Sunder adds deep link pairing |
| DB-backed state | Yes — Sunder uses Supabase |
| Delivery idempotency | Yes — Sunder has delivery_receipts |
| Thread management | Yes — Sunder has conversation_threads |
| Rate limiting | No — Telegram API handles it |
| Streaming preview | No — not needed for v1 |
| Forum topic support | No — DM only |
| Reaction support | No — not needed |
