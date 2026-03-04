# WhatsApp AI Sales Bot — Design

> **Status:** Planned
> **Date:** 2026-03-03
> **Blocker:** Meta Business Verification (3-5 business days)

## Overview

An AI-powered WhatsApp Business bot for Sunder's landing page that acts as a conversational product expert — answers questions about NeoBot/Sunder, qualifies inbound leads, and sends a Calendly link to book consultations.

### Goals

- 24/7 instant response to inbound leads from the `wa.me` link
- Knowledgeable about Sunder's product (from landing page copy + App Spec)
- Qualifies leads naturally through conversation (not a rigid form)
- Sends Calendly link when lead is ready to book
- Logs all conversations + extracted lead info to Supabase
- Architecture reusable for Phase 5 WhatsApp product channel

### Out of Scope (v1)

- Direct Google Calendar booking (Calendly link instead)
- Notifications (email/Slack)
- RAG / vector search over docs
- Voice messages / media handling
- Template messages for follow-ups
- Product feature for customers (Phase 5)

---

## Architecture

### Components

1. **Webhook route** — `app/api/whatsapp/webhook/route.ts`
   - GET handler for Meta's one-time webhook verification
   - POST handler for inbound messages — validates HMAC signature, deduplicates by Meta message ID, returns 200 immediately, processes in background via Next.js `after()`

2. **Message processor** — `src/lib/whatsapp/process-message.ts`
   - Loads conversation history from Supabase by phone number
   - Builds system prompt (product knowledge + qualification instructions)
   - Calls `generateText()` via Vercel AI SDK + AI Gateway
   - Sends reply via Meta Graph API
   - Saves message pair to Supabase
   - Periodically runs `generateObject()` to extract structured lead data (name, email, company, use case, qualification status)

3. **WhatsApp client** — `src/lib/whatsapp/client.ts`
   - Thin `fetch()` wrapper for Meta Graph API (send text, mark as read)
   - HMAC signature verification helper

4. **Supabase tables** — single migration
   - `whatsapp_conversations` — phone number (unique), lead fields, qualification status, message history (JSONB)
   - `whatsapp_message_log` — deduplication table keyed by Meta message ID

5. **System prompt** — `src/lib/whatsapp/system-prompt.ts`
   - Product knowledge baked in from landing page + App Spec
   - Qualification flow instructions
   - Calendly link injection when lead is ready

### Data Flow

```
Meta webhook POST → HMAC check → dedup check → return 200
  → after(): load conversation → generateText() → Graph API reply → save to Supabase
```

No queue table needed — `after()` handles background processing. If a message fails, it's logged but not retried (simple for v1).

### API Details

- **Meta WhatsApp Cloud API** (direct, no BSP) — zero markup, full control
- **Cost:** $0 for replies within 24h of customer-initiated message
- **Model:** Gemini Flash (Tier 1 via AI Gateway) — fast, cheap, good for conversational sales
- **Libraries:** Raw `fetch()` for Graph API (Meta's official Node SDK is archived)

---

## Bot Personality & System Prompt

**Identity:** "Neo" — consistent with the landing page CTA ("Chat with Neo"). Friendly, professional, concise.

**System prompt structure:**

1. **Role** — You are Neo, Sunder's AI assistant on WhatsApp. You help real estate agents in Singapore understand how NeoBot can automate their daily workflows.
2. **Product knowledge** — Baked-in summary: CRM, follow-ups, briefings, inbound handling, draft comms, pricing tiers, differentiators (compounding memory, <10 min setup, approval-gated external actions).
3. **Conversation guidelines:**
   - Keep messages short (under 300 chars — WhatsApp isn't email)
   - Be conversational, not robotic. Mirror the lead's tone.
   - Answer product questions first, don't rush to qualify
   - Naturally weave in qualifying questions (what they do, team size, pain points)
   - When lead is interested and qualified, offer Calendly link
   - If not a real estate agent in SG, be polite but honest about product focus
4. **Calendly injection** — "Here's my calendar — pick a time that works: {CALENDLY_URL}"
5. **Guardrails:**
   - Never make up pricing or features not in the knowledge base
   - Never promise timelines for features in development
   - If asked something unknown, say so and offer to have Seth follow up

---

## Supabase Schema

No RLS needed — internal sales tables, not multi-tenant product tables. Service-role access only.

### `whatsapp_conversations`

| Column                | Type         | Notes                                |
|-----------------------|--------------|--------------------------------------|
| `id`                  | uuid (PK)    | `gen_random_uuid()`                  |
| `phone_number`        | text (unique) | E.164 without `+`, e.g. `6591234567` |
| `lead_name`           | text          | nullable                             |
| `lead_email`          | text          | nullable                             |
| `lead_company`        | text          | nullable                             |
| `lead_use_case`       | text          | nullable                             |
| `qualification_status`| text          | `new` → `qualifying` → `qualified` / `unqualified` / `booked` |
| `messages`            | jsonb         | `[{ role, content, timestamp }]`     |
| `message_count`       | integer       | default `0`                          |
| `created_at`          | timestamptz   |                                      |
| `updated_at`          | timestamptz   |                                      |

### `whatsapp_message_log`

| Column            | Type         | Notes                                    |
|-------------------|--------------|------------------------------------------|
| `id`              | uuid (PK)    | `gen_random_uuid()`                      |
| `meta_message_id` | text (unique) | Meta's message ID, used for dedup        |
| `conversation_id` | uuid (FK)    | → `whatsapp_conversations.id`            |
| `direction`       | text          | `inbound` or `outbound`                  |
| `content`         | text          |                                          |
| `message_type`    | text          | `text`, `image`, etc.                    |
| `created_at`      | timestamptz   |                                          |

### Phase 5 Relationship

Product WhatsApp tables will be separate (per-client, with RLS). These sales tables stay as-is or get archived. No coupling.

---

## File Structure

### New Files

```
app/api/whatsapp/webhook/route.ts              — GET (verify) + POST (receive)
src/lib/whatsapp/client.ts                     — Graph API send + HMAC verify
src/lib/whatsapp/process-message.ts            — Load history → LLM → reply → save
src/lib/whatsapp/system-prompt.ts              — Product knowledge + qualification logic
src/lib/whatsapp/types.ts                      — Meta webhook payload types
supabase/migrations/YYYYMMDD_whatsapp_sales_bot.sql  — Two tables
```

### Env Vars

```
WHATSAPP_VERIFY_TOKEN        — Custom string you choose
WHATSAPP_APP_SECRET          — Meta App Secret (for HMAC)
WHATSAPP_ACCESS_TOKEN        — System User permanent token
WHATSAPP_PHONE_NUMBER_ID     — Your WA Business phone number ID
CALENDLY_URL                 — Your booking link
```

---

## Implementation Order

1. **Meta account setup** (manual) — create app, register number, submit business verification — **blocker, 3-5 business days**
2. Supabase migration — create the two tables
3. `src/lib/whatsapp/types.ts` — Meta webhook payload types
4. `src/lib/whatsapp/client.ts` — HMAC verify + send message helper
5. `src/lib/whatsapp/system-prompt.ts` — product knowledge prompt
6. `src/lib/whatsapp/process-message.ts` — core pipeline
7. `app/api/whatsapp/webhook/route.ts` — webhook handler
8. Register webhook URL in Meta console + test with Meta's test number
9. Go live — update landing page `wa.me` link to new number

---

## Unresolved Questions

- **Phone number:** Need a new SG number not already registered on WhatsApp. Which number to use?
- **Calendly URL:** Which Calendly/Cal.com link to embed?
- **Landing page update:** Update existing `wa.me/6597990493` link to new number, or keep both?
- **Conversation limits:** Should the bot cap conversation length (e.g., after 20 messages, suggest booking or emailing)?
- **Follow-up templates:** For leads who don't book, do we want to send a follow-up template message after 24h? (Costs $0.01-0.07/msg, needs Meta template approval)
- **Upgrade to direct calendar booking:** When to revisit replacing Calendly with Google Calendar API integration?
