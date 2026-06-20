# WhatsApp Integration Drift Analysis: Dorabot vs Sunder

> **Date:** 2026-03-20
> **Source:** `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/` (v0.2.65, latest)
> **Purpose:** Document dorabot's WhatsApp patterns, identify what Sunder reuses from Telegram (PRs 41-42), and define WhatsApp PRs (43-44).
> **Prerequisite:** PRs 41-42 (Telegram) must be built first. WhatsApp reuses the same channel infrastructure.

---

## 1. Dorabot WhatsApp Implementation

### 1.1 File Structure

```
dorabot-1/src/channels/whatsapp/
├── session.ts   (108 lines)  — Socket creation, auth state persistence, connection waiting
├── login.ts     (135 lines)  — QR code login, disconnect retry, stale auth cleanup
├── format.ts    (48 lines)   — Markdown → WhatsApp format (*bold*, _italic_, ~strike~)
├── send.ts      (131 lines)  — JID normalization, message sending, media dispatch, edit/delete
├── monitor.ts   (293 lines)  — Message listener, approvals (text-based), questions (numbered), reconnect
└── index.ts     (5 lines)    — Barrel exports
```

**Total WhatsApp code:** ~720 lines across 6 files.
**Dependency:** `@whiskeysockets/baileys` ^6.7.0 (unofficial WhatsApp Web API)

### 1.2 Feature Inventory

| # | Feature | File | Function |
|---|---------|------|----------|
| 1 | Socket creation + auth persistence | `session.ts` | `createWaSocket(opts)` — uses `useMultiFileAuthState()` |
| 2 | Connection waiting with timeout | `session.ts` | `waitForConnection(sock, timeoutMs)` — 180s default |
| 3 | Auth check (is linked?) | `session.ts` | `isAuthenticated(authDir)` — checks `creds.json` + `registered === true` |
| 4 | QR code login flow | `login.ts` | `loginWhatsApp(authDir?, onQr?)` — retry on 515, version fetch on 405 |
| 5 | Logout + session wipe | `login.ts` | `logoutWhatsApp(authDir?)` — `rmSync(dir, { recursive: true })` |
| 6 | Linked status check | `login.ts` | `isWhatsAppLinked(authDir?)` |
| 7 | Markdown → WhatsApp format | `format.ts` | `markdownToWhatsApp(text)` — `*bold*`, `_italic_`, `~strike~`, ```` `code` ```` |
| 8 | JID normalization | `send.ts` | `toWhatsAppJid(target)` — phone → `@s.whatsapp.net`, group → `@g.us` |
| 9 | Message chunking | `send.ts` | `splitWhatsAppMessage(text, limit)` — 60K limit, paragraph/line/sentence splits |
| 10 | Media dispatch | `send.ts` | `buildMediaContent(mediaPath, caption)` — image/video/audio/document, 64MB max |
| 11 | Send message | `send.ts` | `sendWhatsAppMessage(sock, target, text, opts)` — format + chunk + send |
| 12 | Edit message | `send.ts` | `editWhatsAppMessage(sock, msgId, text, chatId)` |
| 13 | Delete message | `send.ts` | `deleteWhatsAppMessage(sock, msgId, chatId)` |
| 14 | Monitor startup + reconnect | `monitor.ts` | `startWhatsAppMonitor(opts)` — auto-reconnect on disconnect (5s) |
| 15 | Inbound text messages | `monitor.ts` | `sock.ev.on('messages.upsert', ...)` — filter `type === 'notify'` |
| 16 | Access control (allowlist) | `monitor.ts` | Phone number allowlist + group policy |
| 17 | Mark as read | `monitor.ts` | `sock.readMessages([msg.key])` |
| 18 | Text-based approvals | `monitor.ts` | `sendApprovalRequest()` — "Reply *1* to Allow or *2* to Deny" |
| 19 | Numbered questions | `monitor.ts` | `sendQuestion()` — "Reply with a number" |
| 20 | Typing indicator | `monitor.ts` | `sock.sendPresenceUpdate('composing', jid)` |
| 21 | Channel handler registration | `monitor.ts` | `registerChannelHandler('whatsapp', { send, edit, delete, typing })` |

---

## 2. The Big Decision: Baileys vs Meta Cloud API

Dorabot uses `@whiskeysockets/baileys` — an unofficial reverse-engineered WhatsApp Web library. Sunder's architecture decisions say "v3: WhatsApp via Meta Cloud API." These are fundamentally different:

| Aspect | Baileys (Dorabot) | Meta Cloud API (Planned) |
|--------|-------------------|--------------------------|
| **Runtime** | Persistent WebSocket connection | Webhook (serverless) |
| **Auth** | QR code scan (like linking a phone) | Meta Business verification (3-5 days) |
| **ToS** | Violates WhatsApp ToS — number can be banned | Fully compliant |
| **Setup time** | 30 seconds (scan QR) | 3-5 business days (Meta approval) |
| **Cost** | Free (+ compute for long-running process) | Free tier, then per-message |
| **Message limits** | None | 24hr window for user-initiated, templates for business-initiated |
| **Templates** | Not needed | Required for outbound beyond 24hr window |
| **Reliability** | Breaks on WA protocol updates, needs version chasing | Production SLA from Meta |
| **Fits Vercel?** | No — needs always-on process (Fly.io / Railway / etc.) | Yes — webhook mode, same as Telegram |

### Decision: Fork whatsapp-mcp Go bridge as relay, migrate to Meta Cloud API later

**Why whatsapp-mcp Go bridge (not custom baileys relay):**
- [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) already has a working Go bridge with whatsmeow socket, QR auth, SQLite message storage, history sync, and REST API
- Only ~15 lines of Go needed (webhook forwarder on new message)
- whatsmeow is more stable than baileys (powers Mautrix bridge, thousands of users)
- History sync on first link — critical for PR 45 (inbox as data source)
- No need to build a relay from scratch

**Why not Meta Cloud API yet:**
- Requires Meta Business verification (3-5 days blocker)
- 24hr message window + template management complexity
- Can migrate later for production ToS compliance

**Architecture:**

```
┌────────────────────────────────────────┐
│  Fly Machine (~$2/mo, always-on)       │
│                                        │
│  whatsapp-mcp Go Bridge (forked)       │
│  ├── whatsmeow socket (persistent)     │
│  ├── QR auth + session persistence     │
│  ├── SQLite message store (all chats)  │
│  ├── History sync on first link        │
│  ├── REST API (/api/send, /api/download)│
│  └── NEW: webhook POST on new message  │
│         + /qr, /status, /disconnect    │
└────────────────────────────────────────┘
         ↕ HTTPS
┌────────────────────────────────────────┐
│  Sunder on Vercel (serverless)         │
│                                        │
│  /api/webhook/whatsapp                 │
│  ├── Same flow as Telegram webhook     │
│  ├── channel_mappings lookup           │
│  ├── delivery_receipts dedupe          │
│  ├── runAgent()                        │
│  └── Return response text to relay     │
└────────────────────────────────────────┘
```

The relay stores ALL messages in SQLite (whatsapp-mcp already does this). PR 45 adds agent tools that query the relay's existing data for "show me my WhatsApp conversations" features.

### Multi-tenant scaling

- **v1 (≤10 clients):** One Fly machine per client (Option B). ~$2/mo each. Zero code changes to the bridge.
- **v2 (10-100 clients):** Multi-account relay (Option A). Map of `clientId → whatsmeow session`. Scoped REST endpoints. One machine serves all clients.
- **v3 (production):** Migrate to Meta Cloud API. Webhook-native (no relay needed). Full ToS compliance.

---

## 3. What Sunder Reuses from Telegram (PRs 41-42)

The WhatsApp integration reuses most of the Telegram infrastructure. Here's what's shared vs what's new:

### Already Built (No Changes Needed)

| Component | Where | Reused For WhatsApp |
|-----------|-------|-------------------|
| `conversation_channel_mappings` | Migration 20260304213000 | CHECK constraint already includes `'whatsapp'` |
| `conversation_channel_delivery_receipts` | Migration 20260304213000 | Same dedup pattern |
| `runAgent()` | `src/lib/runner/run-agent.ts` | Same function, same interface |
| Thread queue | `thread_queue_records` + `drain_thread_queue` | Same concurrency model |
| `createAdminClient()` | `src/lib/supabase/server.ts` | Same service-role client for webhook |
| Settings page pattern | `app/(dashboard)/settings/` | Same card pattern as Telegram |
| Pairing token pattern | `telegram_pairing_tokens` table | Can reuse same pattern or adapt for QR |
| Approval delivery pattern | `src/lib/channels/telegram/deliver-approval.ts` | Same pattern, different channel |

### New (WhatsApp-Specific)

| Component | Source | Notes |
|-----------|--------|-------|
| Message formatting (`markdownToWhatsApp`) | Dorabot `format.ts` | Different from Telegram — `*bold*`, `_italic_`, `~strike~` |
| JID normalization (`toWhatsAppJid`) | Dorabot `send.ts` | Phone number → `@s.whatsapp.net` |
| Message chunking (60K limit) | Dorabot `send.ts` | Higher limit than Telegram (60K vs 4K) |
| Text-based approvals | Dorabot `monitor.ts` | "Reply 1 to Allow, 2 to Deny" (no inline buttons on WA) |
| Numbered questions | Dorabot `monitor.ts` | "Reply with a number" |
| Fly relay service | New | Thin baileys forwarder (not in dorabot) |
| Webhook route | New | `app/api/webhook/whatsapp/route.ts` |
| Media content builder | Dorabot `send.ts` | `buildMediaContent()` — image/video/audio/doc with MIME detection |

---

## 4. Files to Copy from Dorabot

### Copy Exactly (zero drift)

| Dorabot Source | Sunder Target | Notes |
|---------------|---------------|-------|
| `src/channels/whatsapp/format.ts` | `src/lib/channels/whatsapp/format.ts` | `markdownToWhatsApp()` — 48 lines, simple. Add JSDoc. |
| `src/channels/whatsapp/send.ts` | `src/lib/channels/whatsapp/send.ts` | `toWhatsAppJid()`, `splitWhatsAppMessage()`, `buildMediaContent()`, `sendWhatsAppMessage()`, `editWhatsAppMessage()`, `deleteWhatsAppMessage()`. Keep all. |

### Adapt (Justified Drift)

| Dorabot Source | Sunder Target | Changes |
|---------------|---------------|---------|
| `src/channels/whatsapp/session.ts` | Fly relay service | Socket creation moves to relay. Sunder's webhook never touches baileys directly. |
| `src/channels/whatsapp/login.ts` | Fly relay service + Settings UI | QR login exposed via relay API. Settings page shows QR code or link status. |
| `src/channels/whatsapp/monitor.ts` | `app/api/webhook/whatsapp/route.ts` + Fly relay | Monitor logic split: relay handles socket events, Sunder webhook handles routing + agent. Approval/question text-based patterns extracted to `src/lib/channels/whatsapp/approvals.ts` + `questions.ts`. |

### Don't Copy (Replaced by Sunder Infrastructure)

| Dorabot Pattern | Sunder Replacement |
|----------------|-------------------|
| Auth state in `~/.dorabot/whatsapp/auth/` | Auth state on Fly machine volume |
| `allowFrom` config array | `conversation_channel_mappings` (pairing-based, not config-based) |
| `groupPolicy` config | Not needed (DM only for v1) |
| Channel handler registry | Direct function calls in webhook |
| `pendingApprovals` / `pendingQuestions` Maps | DB-backed state (approval_events table + webhook callback parsing) |

---

## 5. Justified Drift from Dorabot

### 5.1 DRIFT: Baileys on Fly Relay, Not In-Process

| Dorabot | Sunder |
|---------|--------|
| Baileys socket runs in the same Node.js process as the agent | Baileys runs on a separate Fly machine; Sunder's webhook is serverless on Vercel |

**Why:** Vercel Functions are stateless and short-lived. A baileys WebSocket connection must persist. The relay pattern separates concerns: Fly handles the socket, Sunder handles the brains.

### 5.2 DRIFT: Webhook Pairing, Not QR-in-Terminal

| Dorabot | Sunder |
|---------|--------|
| QR code displayed in terminal via `qrcode-terminal` | QR code displayed in Settings web page, fetched from relay API |

**Why:** Sunder users don't have a terminal. The relay service exposes a `/qr` endpoint that returns the current QR code image. The Settings page polls it until the connection is established.

### 5.3 DRIFT: Approval State in DB, Not In-Memory Map

| Dorabot | Sunder |
|---------|--------|
| `pendingApprovals.set(jid, { requestId })` — in-memory Map | Approval events stored in `approval_events` table, resolved via `resolveApprovalEvent()` |

**Why:** Sunder's webhook is stateless — no in-memory state persists between invocations. The approval_events table (from PRs 33-34) already handles this. The relay forwards inbound approval responses ("1"/"2") to the webhook, which looks up the pending approval in the DB.

### 5.4 DRIFT: No Group Support in v1

| Dorabot | Sunder |
|---------|--------|
| Full group support (`groupPolicy`, `allowFrom` per group, `@g.us` JID handling) | DM only |

**Why:** Sunder is 1:1 (one agent per client). Group chats add complexity (who's the client? which messages trigger the agent?) with no clear product value for solo real estate agents.

### 5.5 NO DRIFT: Message Formatting

`markdownToWhatsApp()` is copied exactly. WhatsApp's formatting is different from Telegram (`*bold*` instead of `<b>bold</b>`), and dorabot handles the conversion correctly.

### 5.6 NO DRIFT: Text-Based Approvals

WhatsApp has no inline keyboards. Dorabot's text-based pattern ("Reply *1* to Allow or *2* to Deny") is the correct approach. Copy exactly.

### 5.7 NO DRIFT: JID Normalization

`toWhatsAppJid()` handles all the messy phone number formats (with/without +, with/without @s.whatsapp.net, group JIDs). Copy exactly.

---

## 6. Proposed PR Structure

### PR 43: WhatsApp Integration — Relay + Webhook + Pairing

**Goal:** User can pair their WhatsApp and chat with the Sunder agent.

**Tasks:**
1. WhatsApp formatting module — `markdownToWhatsApp()` (copy from dorabot `format.ts`)
2. WhatsApp sending module — `toWhatsAppJid()`, `splitWhatsAppMessage()`, `sendWhatsAppMessage()`, `buildMediaContent()`, edit, delete (copy from dorabot `send.ts`)
3. Fly relay service — thin Node.js/Bun process: baileys socket, webhook forwarder, `/qr` endpoint, `/status` endpoint
4. Webhook route (`POST /api/webhook/whatsapp`) — verify relay secret, extract phone/text, lookup channel_mappings, dedupe, runAgent(), return response
5. Pairing flow — Settings UI shows QR code from relay `/qr` endpoint. User scans with WhatsApp. Relay confirms connection → creates channel_mapping via Sunder API.
6. Settings UI — "Connect WhatsApp" card with QR code display, connection status, disconnect button
7. Environment config — `WHATSAPP_RELAY_URL`, `WHATSAPP_RELAY_SECRET`, relay env vars (`WHATSAPP_WEBHOOK_URL`, `WHATSAPP_WEBHOOK_SECRET`)

**Test Criteria:**
- Scan QR code from Settings, WhatsApp connects
- Send message to WhatsApp, get agent response
- Second message reuses same thread
- Send /new, next message goes to fresh thread

### PR 44: WhatsApp Integration — Approvals + Features

**Goal:** Approvals work via WhatsApp text responses. Questions use numbered options.

**Tasks:**
1. WhatsApp approvals module — `sendWhatsAppApprovalRequest()` (text-based: "Reply 1 to Allow, 2 to Deny"). Copy dorabot `monitor.ts` pattern.
2. Approval response parsing in webhook — detect "1"/"allow"/"yes" → approve, "2"/"deny"/"no" → deny. Resolve via `resolveApprovalEvent()`.
3. WhatsApp questions module — `sendWhatsAppQuestion()` (numbered options: "Reply with a number"). Copy dorabot pattern.
4. Question response parsing — detect numeric reply, match to option.
5. Disconnect — remove channel_mapping, notify relay to disconnect.

**Test Criteria:**
- Approval-gated action sends text prompt to WhatsApp, reply "1" resolves correctly
- Question sends numbered options, reply with number selects correctly
- Disconnect from Settings, bot no longer responds

---

## 7. Fly Relay Service Architecture

The relay is a standalone service, NOT part of the Sunder Next.js app. It runs on Fly.io (or Railway/Render) as a persistent process.

```
fly-whatsapp-relay/
├── index.ts          — Entry point: start baileys + HTTP server
├── socket.ts         — Baileys socket creation + auth state management
├── webhook.ts        — Forward inbound messages to Sunder, receive responses
├── qr.ts             — Serve QR code image for Settings UI
├── package.json      — baileys, express/hono
├── Dockerfile        — For Fly deployment
└── fly.toml          — Fly config (1 machine, 256MB, persistent volume for auth state)
```

**Endpoints exposed by relay:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check (is baileys connected?) |
| `/qr` | GET | Returns current QR code as PNG (for Settings UI to display) |
| `/status` | GET | Returns `{ connected: boolean, phone: string \| null }` |
| `/send` | POST | Send message: `{ to, text, media? }` — called by Sunder webhook route |
| `/disconnect` | POST | Disconnect + wipe auth state |

**Inbound flow:**
1. User sends WhatsApp message
2. Baileys `messages.upsert` event fires on relay
3. Relay POSTs to `{SUNDER_WEBHOOK_URL}/api/webhook/whatsapp` with: `{ phone, text, messageId, timestamp }`
4. Sunder webhook processes (lookup client, dedupe, runAgent, collect response)
5. Sunder returns `{ text: "agent response", media?: { url, mimeType } }`
6. Relay sends response back via `sock.sendMessage(jid, { text })`

**Auth persistence:** Baileys auth state stored on a Fly persistent volume (`/data/whatsapp-auth/`). Survives machine restarts.

---

## 8. Comparison: WhatsApp vs Telegram in Sunder

| Aspect | Telegram (PRs 41-42) | WhatsApp (PRs 43-44) |
|--------|---------------------|---------------------|
| **Bot library** | grammy (webhook) | baileys (via Fly relay) |
| **Delivery** | Telegram webhook → Vercel | Relay webhook → Vercel |
| **Pairing** | Deep link `/start` token | QR code scan in Settings |
| **Formatting** | Markdown → HTML (`<b>`, `<i>`, `<code>`) | Markdown → WhatsApp (`*bold*`, `_italic_`, `` `code` ``) |
| **Chunk limit** | 4,000 chars | 60,000 chars |
| **Approvals** | InlineKeyboard buttons | Text-based ("Reply 1 or 2") |
| **Questions** | InlineKeyboard buttons | Text-based ("Reply with a number") |
| **Media outbound** | grammy `sendPhoto`/`sendDocument` | baileys `sock.sendMessage(jid, { image/video/audio/document })` |
| **Typing** | `sendChatAction('typing')` | `sendPresenceUpdate('composing')` |
| **Edit/Delete** | grammy `editMessageText`/`deleteMessage` | baileys `sendMessage(jid, { edit/delete })` |
| **Extra infra** | None | Fly machine ($3/mo) |

---

## 9. What Sunder Already Has for WhatsApp

| Component | Status |
|-----------|--------|
| `conversation_channel_mappings` with `'whatsapp'` CHECK | ✅ Ready |
| `conversation_channel_delivery_receipts` | ✅ Ready |
| `runAgent()` | ✅ Ready |
| Thread queue | ✅ Ready |
| `createAdminClient()` | ✅ Ready |
| Settings page pattern (from Telegram card) | ✅ Ready (after PR 41) |
| Approval events system | ✅ Ready |
| HMAC verification utilities | ✅ `src/lib/whatsapp/hmac.ts` (from OpenClaw integration) |
| WhatsApp design spike | ✅ `docs/product/plans/2026-03-03-whatsapp-sales-bot-design.md` (reference only) |

---

## 10. Decision Summary

| Decision | Choice | Reason |
|----------|--------|--------|
| WhatsApp library | **baileys** (via Fly relay) | Instant setup, dorabot code directly copyable, validates feature before Meta approval |
| Relay architecture | **Fly machine + persistent volume** | Cheapest always-on compute ($3/mo), baileys auth state persists |
| Formatting | **Copy exact** from dorabot | `markdownToWhatsApp()` is correct and simple |
| JID normalization | **Copy exact** from dorabot | `toWhatsAppJid()` handles all formats |
| Chunking | **Copy exact** from dorabot | `splitWhatsAppMessage()` — same smart boundary logic as Telegram |
| Approvals | **Text-based** from dorabot | WhatsApp has no inline keyboards. "Reply 1 or 2" is the correct pattern. |
| Questions | **Numbered options** from dorabot | "Reply with a number" — same as dorabot |
| Pairing | **QR code in Settings** (drift from dorabot) | Dorabot shows QR in terminal. Sunder shows in web UI. |
| Groups | **Skip** (drift from dorabot) | DM only. No product value for solo agents. |
| Future migration | **Meta Cloud API** when ready | For production ToS compliance. Baileys is the fast-start path. |

---

## 11. Reference File Index

### Dorabot (Primary Reference — Copy From)

| Purpose | File Path |
|---------|-----------|
| WhatsApp session | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/session.ts` |
| WhatsApp login | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/login.ts` |
| WhatsApp format | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/format.ts` |
| WhatsApp send | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/send.ts` |
| WhatsApp monitor | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/monitor.ts` |
| WhatsApp index | `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/index.ts` |
| Channel types | `/Users/sethlim/Documents/dorabot-1/src/channels/types.ts` |
| Channel manager | `/Users/sethlim/Documents/dorabot-1/src/gateway/channel-manager.ts` |

### Sunder (Existing Infrastructure)

| Purpose | File Path |
|---------|-----------|
| Channel mappings migration | `supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql` |
| Channel CHECK constraint | `supabase/migrations/20260304220000_add_channel_check_constraint.sql` |
| HMAC verification | `src/lib/whatsapp/hmac.ts` |
| WhatsApp design spike | `docs/product/plans/2026-03-03-whatsapp-sales-bot-design.md` |
| Telegram webhook (pattern to mirror) | `app/api/webhook/telegram/route.ts` (after PR 41) |
| Telegram Settings card (pattern to mirror) | `app/(dashboard)/settings/telegram-connect-card.tsx` (after PR 41) |
