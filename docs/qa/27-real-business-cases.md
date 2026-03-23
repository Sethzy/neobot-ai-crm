# QA Surface 27: Real Business Cases

> **PRs covered:** All (end-to-end integration across CRM, chat, memory, tools, connections, approvals)
> **Dogfoodable:** Partial (via chat UI)
> **Time estimate:** 45-60 min manual
> **Purpose:** Validate Sunder handles realistic advisory-sales workflows end-to-end, inspired by real competitor use cases (The Librarian, etc.)

---

## Prerequisites

- Logged in with a working chat, CRM seeded with some contacts/deals
- Memory system functional (SOUL.md, USER.md exist)
- Email connection configured (or mock approval flow)
- Supabase dashboard open for verification

---

## Why This Surface Exists

Unit-level QA (Surfaces 1-26) tests individual features in isolation. This surface tests whether Sunder can handle the kind of multi-step, multi-tool workflows that real advisory-sales practitioners actually need day-to-day. Each scenario simulates a realistic business moment — the kind of thing a real estate agent, insurance advisor, or financial planner would ask their AI assistant to do between client meetings.

---

## Manual QA Scenarios

### 27.1 The "just met someone" moment — contact + deal + notes in one shot

> **Persona:** Real estate agent leaving a property viewing

1. New thread. Type: **"I just met David Chen at a viewing for 22 Nassim Road. He's a buyer, budget $3.2M, wants 3-bed with a balcony. His number is 9182-7364 and email is david.chen@gmail.com. He's relocating from Hong Kong in April."**
2. **Expected tool calls:** `create_record` (contacts — David Chen, type: buyer, phone, email), `create_record` (deals — 22 Nassim Road, price ~3200000), `link_records` (contact ↔ deal)
3. **Expected:** Agent confirms all created in natural language, mentions the key details back
4. **Verify in Supabase:** Contact row has phone + email, deal row has address + price, junction row links them
5. **Follow-up:** "Also note that he prefers high floor and mentioned he has a dog — needs a pet-friendly building"
6. **Expected:** `update_record` on David Chen's contact with notes/preferences updated

**What this validates:** Multi-entity creation from unstructured input, relationship linking, preference capture

**Notes / failures:**

---

### 27.2 Client follow-up from drive time — draft + approval

> **Persona:** Agent between appointments, following up on a showing

1. Type: **"Draft an email to Sarah Lim thanking her for the viewing today at 88 Tanjong Pagar. Mention the 2BR unit she liked on the 12th floor and ask if she'd like to schedule a second viewing this week."**
2. **Expected:** Agent searches CRM for Sarah Lim (or uses context from existing data), drafts an email
3. **Expected:** If email connection is live → approval gate fires (external-facing action)
4. **Expected:** Draft is professional, references correct property details, includes a clear CTA
5. **Verify:** Approval appears in approvals panel (if approvals are enabled)

**What this validates:** CRM lookup → content generation → approval gating for external actions

**Notes / failures:**

---

### 27.3 Pipeline review — search + summary

> **Persona:** Agent doing an evening pipeline check

1. Type: **"Show me all my deals in negotiation stage. For each one, tell me the last interaction and how long it's been."**
2. **Expected tool calls:** `search_crm` (entity: deals, filters: {stage: "negotiation"})
3. **Expected:** For each deal, agent may call `search_crm` (entity: interactions) to find latest interaction
4. **Expected:** Agent presents a clean summary with deal name, contact, last interaction date, and days elapsed
5. **Follow-up:** "Which ones haven't had any activity in over 7 days?"
6. **Expected:** Agent filters the list and flags stale deals

**What this validates:** Multi-step CRM queries, temporal reasoning, proactive flagging

**Notes / failures:**

---

### 27.4 New listing prep — deal creation + task creation

> **Persona:** Agent just signed a new exclusive listing

1. Type: **"I just signed an exclusive for 15 Amber Road, a 4-bed penthouse, asking $4.8M. The seller is Michael Tan — he's already in my CRM. Create the deal, link it to Michael, and create tasks for: 1) arrange professional photography by Friday, 2) draft listing description, 3) schedule open house for next Saturday."**
2. **Expected tool calls:** `search_crm` (find Michael Tan), `create_record` (deal), `link_records` (contact ↔ deal), `create_task` ×3
3. **Expected:** All three tasks created with reasonable due dates
4. **Verify in Supabase:** Deal row, junction row, 3 task rows with due dates

**What this validates:** Multi-entity orchestration, existing contact lookup + linking, bulk task creation

**Notes / failures:**

---

### 27.5 Client matching — search + outreach draft

> **Persona:** Agent with a new listing wants to match it to buyers

1. Ensure at least 2-3 buyer contacts exist with noted preferences (budget, bedrooms, area)
2. Type: **"I have a new 3-bed unit at 22 Nassim Road for $3.2M with a balcony and city view. Which of my buyer contacts might be interested? Check their budgets and preferences."**
3. **Expected:** `search_crm` (entity: contacts, filters: {type: "buyer"}) — agent reviews preferences
4. **Expected:** Agent returns a shortlist of matching buyers with reasoning (budget fits, area match, etc.)
5. **Follow-up:** "Draft a message to David Chen about this property — mention the balcony since he asked for one"
6. **Expected:** Personalized draft referencing David's specific stated preferences

**What this validates:** CRM search with preference matching, personalized content generation, memory recall

**Notes / failures:**

---

### 27.6 Paperwork kickoff — multi-step coordination

> **Persona:** Agent closing a deal, needs to coordinate

1. Type: **"The deal at 88 Tanjong Pagar is closing. Move it to 'closed won' stage. Create tasks for: 1) send congratulations email to Sarah Lim, 2) collect signed documents by end of week, 3) schedule handover for April 1st. Also update the deal price to $1.75M — she negotiated down."**
2. **Expected tool calls:** `search_crm` (find deal), `update_record` (stage → closed_won, price → 1750000), `create_task` ×3
3. **Expected:** Agent handles all operations, confirms each
4. **Verify in Supabase:** Deal stage updated, price updated, 3 tasks created

**What this validates:** Deal lifecycle management, multi-update + multi-create in one exchange

**Notes / failures:**

---

### 27.7 Morning briefing — "what's on my plate today?"

> **Persona:** Agent starting their day

1. Type: **"Good morning. What tasks do I have due today? Any deals that need attention?"**
2. **Expected tool calls:** `search_crm` (entity: tasks, filters for today's date or overdue), `search_crm` (entity: deals — recent activity or stale)
3. **Expected:** Agent provides a structured briefing — tasks due, overdue items, deals needing follow-up
4. **Expected:** If nothing is due, agent says so clearly rather than making things up

**What this validates:** Proactive information retrieval, date-aware filtering, honest "nothing to report" handling

**Notes / failures:**

---

### 27.8 Interaction logging — capture meeting notes post-hoc

> **Persona:** Agent just finished a client meeting

1. Type: **"I just had a 45-minute meeting with Michael Tan about 15 Amber Road. Key points: he wants to lower the asking price to $4.5M, he's flexible on the timeline but wants it sold by June, and he asked about staging options. Log this."**
2. **Expected tool calls:** `search_crm` (find Michael Tan + deal), `create_interaction` (type: meeting, notes with all key points, linked to contact + deal)
3. **Expected:** Agent confirms logged, may proactively suggest follow-up actions
4. **Verify in Supabase:** Interaction row with correct type, notes, and linkages

**What this validates:** Interaction capture from unstructured narrative, entity resolution, proactive suggestions

**Notes / failures:**

---

### 27.9 Quick lookup mid-call — "pull up the details"

> **Persona:** Agent on a phone call, needs info fast

1. Type: **"Quick — what's the asking price and stage for the Nassim Road deal? And when was my last interaction with David Chen?"**
2. **Expected:** Fast CRM lookups, concise response — no fluff
3. **Expected:** Agent provides exact data points requested, nothing more
4. **Response time matters:** This should feel snappy — agent shouldn't over-explain

**What this validates:** Speed of retrieval, concise response formatting, real-time usefulness

**Notes / failures:**

---

### 27.10 Bulk update — end-of-day cleanup

> **Persona:** Agent wrapping up the day

1. Type: **"End of day updates: Move the Robertson Walk deal to 'viewing scheduled', update David Chen's budget to $3.5M (he got approved for more), and mark the photography task for Amber Road as done."**
2. **Expected tool calls:** Multiple `search_crm` + `update_record` + `update_task` calls
3. **Expected:** Agent handles all three updates, confirms each one
4. **Verify in Supabase:** All three updates reflected correctly

**What this validates:** Batch updates across different entity types in one conversation turn

**Notes / failures:**

### 27.11 The full pipeline — voice memo → match → WhatsApp draft

> **Persona:** Agent just left a meeting, recording a voice memo in the car
> **This is the demo scenario** — the 3-step pitch: capture → match → outreach in one thread

1. New thread. Type (simulating a transcribed voice memo): **"Just met Amanda Wong, she's a buyer relocating from Shanghai. Budget around $2M to $2.5M, looking for a 3-bed condo in the Orchard or River Valley area. Needs to be near an international school. She has two kids, ages 8 and 12. Wants to move in by August. Her WhatsApp is +65 8234-5678."**
2. **Expected tool calls:** `create_record` (contacts — Amanda Wong, type: buyer, phone, notes with all preferences: budget, bedrooms, area, school proximity, kids, timeline)
3. **Expected:** Agent confirms profile created with all details captured — nothing lost from the memo
4. **Verify in Supabase:** Contact row has all preference details stored

5. **Step 2 — Match:** Type: **"What properties do I have that could work for her?"**
6. **Expected:** `search_crm` (entity: deals, broad search) — agent filters by Amanda's criteria (budget $2-2.5M, 3-bed, Orchard/River Valley area)
7. **Expected:** Agent returns matching deals with reasoning (price fits, location match, bedroom count). If no matches, agent says so honestly and may suggest broadening criteria.

8. **Step 3 — Outreach:** Type: **"Draft a WhatsApp message to Amanda with the top matches. Keep it warm and personal — mention her kids and the school proximity."**
9. **Expected:** Agent drafts a conversational WhatsApp-style message (not a formal email), references her specific needs (kids, international school), lists matched properties with key details
10. **Expected:** Approval gate fires (external-facing message)
11. **Expected:** Message tone is warm, not robotic — reads like a real agent texting a client

**What this validates:** The complete capture → match → outreach pipeline in a single thread. This is the "under 3 minutes" demo moment. Tests unstructured input parsing, CRM search + filtering, personalized message drafting, and approval gating — all chained together.

**Notes / failures:**

---

## Failure Patterns to Watch For

| Pattern | What to look for |
|---------|-----------------|
| **Entity confusion** | Agent creates a new contact instead of finding existing one |
| **Lost context** | Agent forgets details mentioned earlier in the same thread |
| **Over-tooling** | Agent makes 10 tool calls when 3 would do |
| **Under-tooling** | Agent describes what it "would" do instead of actually doing it |
| **Hallucinated data** | Agent invents CRM records that don't exist |
| **Approval bypass** | External-facing actions (email sends) skip the approval gate |
| **Date confusion** | Agent gets relative dates wrong (e.g., "this Friday" → wrong date) |
| **Robotic responses** | Agent sounds like a form submission confirmation instead of a helpful assistant |

---

## Inspiration Source

These scenarios are inspired by [The Librarian](https://thelibrarian.com) — a voice-first AI assistant for real estate agents. Their documented use cases (listing creation, showing scheduling, client capture, paperwork kickoff, pipeline matching) represent the exact workflows Sunder should handle for advisory-sales practitioners.
