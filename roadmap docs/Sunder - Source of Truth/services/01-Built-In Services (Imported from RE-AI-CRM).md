# Built-In Services Layer

**Status:** Living document
**Date:** February 19, 2026
**Parent:** References `product-dev/01-App Spec.md` (product spec), `architecture/architecture-decisions-checklist.json` (technical decisions)

---

> **How to use this document in this folder**
> 1. Treat this file as the detailed service catalog.
> 2. Treat `../product-dev/01-App Spec.md` as the product source of truth for v1 scope and decisions.
> 3. If there is any conflict, the app spec wins.
> 4. Treat this file as an imported reference unless explicitly updated in this folder.

---

## The One-Liner

The agent comes batteries-included. One signup, one QR scan, everything works. No accounts to create, no tools to configure, no integrations to manage.

---

## Design Philosophy

### Three Patterns for Built-In Services

| Pattern | When | Examples |
|---------|------|---------|
| **User-authed via Composio** | User already has the tool (or it's free to create) | Cal.com, Tally.so, Short.io, Google Calendar, Gmail |
| **Sunder-owned central account** | Platform-level tool, user never touches it | Resend |
| **Custom-built on Supabase + filesystem** | Core product differentiator, needs full control | CRM, Knowledge Base |

### Principles

1. **Users should not need to create accounts in normal setup.** The agent handles auth flows or Sunder holds the account. Exception: approved user-managed tools in v1 (for example, Granola MCP) require one-time user setup.
2. **Agent is the interface.** User talks to AI via web chat (v1), Telegram (v2), or WhatsApp (v3). AI calls APIs. User never opens Cal.com, Tally, or Resend dashboards.
3. **Composio for user-owned tools.** Handles OAuth, token refresh, 141+ pre-built actions per integration. Agent calls Composio actions, not raw APIs.
4. **Cloud APIs for simplicity.** Self-hosting is cheaper but KISS wins. Only self-host when forced (privacy, cost, ToS).
5. **UI is read-only reporting.** Mission Control dashboard shows data but the agent does the work.

---

## Service Map

### What We Need (mapped to Product Vision features)

| Capability | Service | Pattern | Product Features Powered | Phase |
|------------|---------|---------|-------------------------|-------|
| **CRM** | Custom (Supabase) | Custom-built | Contacts, deals, pipeline, tasks, relationship memory | MVP |
| **Knowledge Base** | Custom (filesystem + Supabase) | Custom-built | Document Vault (#21), Product Knowledge RAG (#5) | MVP |
| **Web Search + Enrichment** | Brave Search API (LLM Context) **or** Parallel Search API + Exa `/contents` | Sunder central account(s) | Just-In-Time Enrichment (#2), Market Analyst (#25), Neighborhood Expert (#27), Listing Stalker (#15) | MVP |
| **Scheduling** | Cal.com | User-authed (Composio) | Viewing scheduling, vendor booking, calendar sync | MVP |
| **Forms** | Tally.so | User-authed (Composio) | Open House Manager (#22), feedback, lead capture | MVP |
| **Voice Input** | OpenAI Whisper + Granola MCP | Sunder central (Whisper) / User-installed (Granola) | Voice → text, meeting transcripts | Phase 5 |
| **Voice Output** | Inworld AI | Sunder central account | User → client voice notes (cloned voice), Neo → user voice replies | MVP |
| **Social Media** | Postiz | TBD (another dev researching) | Social Butler (#10), Content Factory (#8) | Phase 2 |
| **Email** | Resend | Sunder central account | After-Sale Concierge (#36), nudge delivery, notifications | Phase 3 |
| **Link Attribution** | Short.io | User-authed (Composio) | Campaign tracking, referral links, content distribution | Phase 3 |
| **Document Signing** | DocuSeal | Sunder central account | Contract signing, transaction documents | Phase 3 |
| **Document Extraction** | Gemini 2.5 Flash + ExtendAI | Sunder central account | Document Vault processing (#21), auto-CRM linking, custom schemas | MVP |
| **Document Generation** | Custom MCP (ported from Sunder) | Custom-built | Excel reports, AI analysis, reconciliation checks | MVP |
| **Artifact Publishing (Mini Lovable)** | Custom (frontend-design skill + browser sandbox) + here.now (free hosting) | Custom-built | Personalized pitch webpages, property showcases, interactive deliverables | MVP |
| **Diagramming (Excalidraw MCP)** | Excalidraw MCP (`mcp.excalidraw.com`) | Sunder central account | Visual diagrams, property comparisons, transaction timelines, process flows | MVP |

### What We DON'T Need

| Tool | Why Not |
|------|---------|
| Listmonk | Users don't send newsletters. They send WhatsApp messages. |
| Shlink | Short.io (user-authed via Composio) covers link shortening when needed |
| Gotenberg | PDF generation is nice but not a product feature |
| Outline (hosted) | Building our own Knowledge Base UI on filesystem instead |
| Twenty (hosted) | Building our own CRM UI on Supabase instead |

### Search Provider Decision (Feb 19, 2026)

- **Search (default):** Brave Search API using **LLM Context**.
- **Search alternative:** Parallel Search API (same headline unit price as Brave search, use only if quality/latency wins in our tests).
- **Known-URL extraction (default):** Exa `/contents`, `text` mode only.
- **Not used in MVP:** Exa semantic fallback.
- **Not used by default:** Firecrawl; only enable for domain-specific hard failures (JS/auth/anti-bot edge cases).
- **Not default for Sunder:** Parallel Task API (variable-cost deep research endpoint; use only for explicit async research workflows).
- **This decision supersedes prior search-stack notes in this doc.**

### Browser Automation / RPA Provider Decision (Feb 19, 2026)

**This section supersedes prior Browserbase vs Tinyfish exploration notes.**

- **Default for stateful authenticated automation:** Browserbase
  - Rationale: documented persistent browser contexts (`persist: true`) for cookie/session reuse across runs.
- **Default for disposable browser automation + unified web stack:** Firecrawl Browser Sandbox
  - Rationale: strong `agent-browser` UX, no local browser setup, and low cost for short stateless jobs.
- **Not default (use selectively):** Tinyfish
  - Rationale: high-abstraction goal-based automation is fast to build, but step-based runtime cost is materially higher for repetitive RPA volume.

#### Cost Snapshot (Operational Comparison)

Assumptions:
- 30 connection actions/day
- 30-day month (900 actions/month)
- Browserbase + Firecrawl: 1.2 browser minutes/action
- Tinyfish: 12 steps/action

| Provider | Monthly Total | Daily Avg | Cost per Action | Notes |
|---------|---------------|-----------|-----------------|-------|
| **Browserbase** | **$20.00/mo** | **$0.67/day** | **$0.022** | Fits inside Developer included browser hours |
| **Firecrawl Browser** | **$16.00/mo** | **$0.53/day** | **$0.0178** | Fits inside Hobby credits at 2 credits/min |
| **Tinyfish** | **$143.10/mo** | **$4.77/day** | **$0.159** | Standard + overage at 10,800 steps/month |

#### Adoption Rule

1. **Use Browserbase** when auth/session persistence is required across days/runs.
2. **Use Firecrawl** for stateless browsing, extraction-heavy pipelines, and agent-browser command workflows.
3. **Use Tinyfish only** where orchestration simplicity is worth premium runtime cost.

#### Compliance Note

For social platform workflows (e.g., LinkedIn), implementation must follow platform policy and account safety constraints regardless of provider choice.

#### Note: Apify as Agent Skill

Apify offers a pre-built agent skill for scraping: https://skills.sh/apify/agent-skills/apify-ultimate-scraper — evaluate as a potential alternative or complement to Browserbase/Firecrawl for extraction-heavy workflows.

#### Note: Browserbase Claude Code Skills

Browserbase offers a Claude Code plugin for AI-driven browser automation via Stagehand:

- **Skill page:** https://skills.sh/browserbase/skills/browser — install with `npx skills add https://github.com/browserbase/skills --skill browser`. Provides `browse open/snapshot/screenshot/click/type/fill` commands. Local mode (no credentials) for dev; remote mode (with `BROWSERBASE_API_KEY`) for anti-bot stealth, CAPTCHA solving, residential proxies, and session persistence.
- **Source repo:** https://github.com/browserbase/skills (TypeScript, 448 stars) — includes a `browser` skill and a `functions` skill for deploying serverless browser automation to Browserbase cloud via the `bb` CLI.

**Evaluate for:** Claude Code-native browser automation in development workflows (QA testing localhost, scraping, form-filling). Complements the Stagehand + Browserbase runtime stack already chosen for Lane 3 interactive browser automation (`SERVICE-12`).

#### Note: Open-Source Mission Control Dashboards (Browserbase Competitors / Complements)

Two open-source "mission control" projects worth tracking as potential alternatives or complements to Browserbase for agent orchestration and monitoring:

1. **crshdn/mission-control** — https://github.com/crshdn/mission-control
   - AI agent orchestration dashboard with 7-column Kanban, interactive AI planning Q&A before task dispatch, and agent management with soul/user/agents markdown files.
   - Stack: Next.js 14, Zustand, SQLite, SSE + WebSocket to OpenClaw Gateway.
   - Relevant patterns: the pre-dispatch clarification Q&A flow maps to our safety-approval model; the soul/user markdown memory system mirrors our `SOUL.md`/`USER.md`/`MEMORY.md` architecture.

2. **builderz-labs/mission-control** — https://github.com/builderz-labs/mission-control
   - Full ops-grade dashboard (26 panels) for managing agent fleets at scale: task boards with quality-review gates, per-model token/cost tracking, cron scheduling, webhook management, agent network visualization (React Flow), RBAC, and audit trails.
   - Stack: Next.js 16, React 19, Zustand, SQLite WAL, Recharts, Playwright E2E tests.
   - Relevant patterns: quality-review gates map to our external-action approval tier; per-model cost tracking is directly useful for our 4-tier model routing (Background/Flash/Pro/Sonnet); smart polling that pauses on WebSocket connect or tab-inactive is applicable to our Supabase Realtime setup.

**Evaluate for:** dashboard UX inspiration, cost-tracking UI patterns, and approval-gate workflows. Neither replaces Browserbase for browser automation — they sit at the orchestration/monitoring layer above it.

---

## 1. Scheduling — Cal.com via Composio

### Architecture

```
User signs up for Sunder
    → Onboarding: "Connect your calendar"
    → Composio OAuth flow → user connects their own Cal.com free account
    → Agent now has full scheduling control via 141 Composio actions
```

### Why This Works

- **Cal.com Free tier** gives each user: 1 user, unlimited event types, unlimited bookings, API access, Cal Atoms embeds, workflows, Stripe payments
- **Cost to Sunder: $0** — each user owns their own account
- **Composio handles**: OAuth token storage, refresh, action execution
- **No per-seat pricing nightmare** — the $37/user/mo Org plan is completely avoided

### Key Composio Actions the Agent Uses

| Action | Use Case |
|--------|----------|
| `CAL_LIST_EVENT_TYPES` | Check what viewing types exist |
| `CAL_CREATE_TEAM_EVENT_TYPE` | Create "Property Viewing - 30min", "Open House - 2hr" |
| `CAL_GET_AVAILABLE_SLOTS_INFO` | Check agent's availability for a viewing |
| `CAL_POST_NEW_BOOKING_REQUEST` | Book a viewing for a client |
| `CAL_RESCHEDULE_BOOKING_BY_UID` | Reschedule when client asks |
| `CAL_CANCEL_BOOKING_VIA_UID` | Cancel a viewing |
| `CAL_FETCH_ALL_BOOKINGS` | "What's on my schedule today?" |
| `CAL_CREATE_USER_AVAILABILITY_SCHEDULE` | Set agent's working hours |
| `CAL_CREATE_WEBHOOK_FOR_EVENT_TYPE` | Get notified when someone books |
| `CAL_RETRIEVE_CALENDAR_BUSY_TIMES` | Avoid double-booking |

### User Experience

```
Agent (WhatsApp, morning briefing):
  "You have 3 viewings today:
   10am — Sarah Lee, 42 Noriega St (3BR condo)
   2pm — James Tan, 88 Orchard Rd (penthouse)
   4pm — Open House at 15 Newton Rd"

Client (WhatsApp):
  "Can I see the Noriega place this Saturday at 2pm?"

Agent → checks CAL_GET_AVAILABLE_SLOTS_INFO
Agent → CAL_POST_NEW_BOOKING_REQUEST
Agent (WhatsApp to user):
  "Sarah wants to view 42 Noriega this Saturday 2pm. You're free. Confirm?"
User: "Yes"
Agent → confirms booking, sends calendar invite to Sarah
```

### Onboarding Flow

1. User scans WhatsApp QR (connects to Sunder)
2. Agent sends: "Let's set up your calendar. Tap this link to connect Cal.com"
3. Composio OAuth redirect → user logs into Cal.com (or creates free account)
4. Token stored in Composio → agent has full access
5. Agent creates default event types:
   - "Property Viewing" (30 min)
   - "Open House" (2 hr)
   - "Client Meeting" (1 hr)
   - "Phone Consultation" (15 min)
6. Done. Calendar is live.

### API Verification: Full E2E Support Confirmed

**Verified Feb 16, 2026.** Cal.com API v2 supports complete programmatic setup — the agent can build the entire scheduling system without the user touching the Cal.com dashboard.

**What the agent can do via API (no UI required):**

| Capability | API Endpoint | Verified |
|-----------|-------------|----------|
| Create event types with custom fields | `POST /v2/event-types` | Yes — 19+ booking field types (name, email, phone, text, textarea, checkbox, radio, etc.) |
| Create availability schedules | `POST /v2/schedules` | Yes — per-day time ranges, timezone, date overrides |
| Set buffer times, booking windows, min notice | Event type params | Yes — `beforeEventBuffer`, `afterEventBuffer`, `minimumBookingNotice` |
| Set confirmation policy | `confirmationPolicy` | Yes — auto-confirm or manual |
| Create bookings on client's behalf | `POST /v2/bookings` | Yes — attendee name/email/phone, custom field responses |
| Set up webhooks | `POST /v2/event-types/{id}/webhooks` | Yes — 12+ triggers (BOOKING_CREATED, CANCELLED, RESCHEDULED, etc.) |
| Reschedule/cancel bookings | `PATCH/DELETE /v2/bookings/{uid}` | Yes |
| Check availability | `GET /v2/slots/available` | Yes |
| Redirect after booking | `successRedirectUrl` | Yes |
| In-person location | `locations[].type: "address"` | Yes |

**Concrete setup sequence (3 API calls = full scheduling system):**

```
1. POST /v2/schedules
   → Create "Mon-Sat 9am-7pm" availability
   → Returns scheduleId

2. POST /v2/event-types
   → Create "Property Viewing - 30min"
   → Custom fields: name, phone, property address, notes
   → Location: in-person, buffer: 30min after
   → Link to scheduleId from step 1

3. POST /v2/event-types/{id}/webhooks
   → Subscribe to BOOKING_CREATED, CANCELLED, RESCHEDULED
   → Point to Sunder webhook endpoint
```

**One minor gap:** Conferencing app connections (Zoom, Google Meet) require UI setup. Irrelevant for RE viewings — location is always "in-person address."

### Limitations & Mitigations

| Limitation | Mitigation |
|-----------|------------|
| Free tier shows Cal.com branding on booking pages | Clients book via agent (WhatsApp), rarely see booking page directly |
| No team scheduling on free tier | Each agent is solo — team features not needed |
| User must create Cal.com account | Part of onboarding. Agent walks them through it. 2 minutes. |
| If Cal.com changes free tier | Composio abstraction means we can swap to any scheduling API |
| Conferencing apps need UI setup | Not needed — RE viewings are in-person |

**Pivot Option:** If Cal.com proves unreliable or changes their free tier terms, **Calendly** is the immediate fallback. Calendly has Composio support (75+ actions), generous free tier (unlimited event types, API access), and similar feature set. The agent code would remain nearly identical — just swap `CAL_*` actions for `CALENDLY_*` actions. Migration time: ~1 day.

---

## 2. Email — Resend (Sunder Central Account)

### Architecture

```
Sunder owns one Resend account (Pro or Scale plan)
    → Agent sends emails via Resend API
    → Each client's domain added programmatically (when needed)
    → Domain-scoped API keys for isolation
```

### Pricing Decision

| Scale | Plan | Cost | Why |
|-------|------|------|-----|
| **MVP (0-10 clients)** | Pro | $20/mo | 50K emails/mo, 10 domains |
| **Growth (10-100 clients)** | Scale | $90/mo | 100K emails/mo, 1,000 domains |
| **100+ clients** | Scale + overage | $90/mo + $0.90/1K | Still cheap |

### What the Agent Does with Email

| Use Case | Product Feature | How |
|----------|----------------|-----|
| Follow-up sequences | After-Sale Concierge (#36) | Agent schedules email series: day 1, 7, 30, 90, 365 post-completion |
| Nudge delivery | Nudge Engine (#3) | When WhatsApp isn't appropriate, send email nudge |
| Client notifications | Transaction Coordinator (#17) | "Your Option-to-Purchase expires in 3 days" |
| Market updates | Market Analyst (#25) | Weekly digest email |
| Morning briefing (email copy) | Core feature | Backup delivery channel if WhatsApp offline |

### Email Identity

Two modes:
1. **Platform domain** (default): `updates@sunder.ai` — generic, works immediately
2. **Client domain** (when they want branding): `agent@sarahlee-realty.com` — requires DNS verification, agent walks user through it

### Technical Details

- **Batch API**: Send up to 100 personalized emails per API call
- **Webhooks**: Track delivered/opened/clicked/bounced per email
- **Audiences + Segments**: Per-client contact lists for marketing emails
- **Domain-scoped API keys**: Isolate sending per client domain
- **Rate limit**: 2 req/sec (batch compensates — 100 emails per request)

---

## 3. CRM — Custom (Supabase + Twenty-Inspired UI)

### Architecture

Already decided in ARCHITECTURE-v2-addendum-openclaw-gaps.md. Summary:

```
Centralized Supabase
    → RLS per client (client_id = current_setting('app.client_id'))
    → JSONB custom fields (contact_fields, deal_fields, deal_stages)
    → crm_config table per client (customizable schema)
    → Agent reads/writes via Supabase client
    → Mission Control UI: 5 screens, read-mostly
```

### UI — Inspired by Twenty

**What to steal from Twenty's codebase:**
- Pipeline kanban drag-and-drop (deal stages)
- Contacts table with inline editing
- Activity timeline component (interaction history)
- Search/filter bar patterns
- Detail view layout (sidebar + main content)

**What NOT to take:**
- Twenty's GraphQL layer (overkill, we use Supabase directly)
- Twenty's workspace/multi-tenant system (we have RLS)
- Twenty's self-contained backend (we ARE the backend)

### 5 Screens

1. **Pipeline** — Kanban board, deals by stage, drag to move
2. **Contacts** — Table view, search, filter by tags/stage/last-contact
3. **Detail** — Contact or deal deep-dive, interaction history, tasks, AI summary
4. **Activity Feed** — Recent interactions across all contacts, filterable
5. **Chat** — WhatsApp conversation view (read-only mirror)

### Tech Stack

- **Frontend**: React 19 + Vite 7 + Tailwind 4 + shadcn/ui + TanStack Router + TanStack Query (+ Table/Form as needed)
- **Data**: Supabase Realtime for live updates
- **Auth**: Supabase Auth (user logs into Mission Control)
- **Hosting**: Vercel (static) or Supabase Storage signed URLs

---

## 4. Knowledge Base / Document Vault — Custom (Filesystem + Supabase)

### Architecture

```
Supabase Storage (per client)
    → /{clientId}/vault/
        ├── properties/          # Listing brochures, floor plans
        ├── contracts/           # OTP, S&P, tenancy agreements
        ├── guides/              # Market reports, area briefs
        ├── training/            # CPD materials
        └── clients/             # Per-client document folders
    → Supabase metadata index (search, tags, timestamps)
    → Custom UI inspired by Outline
```

### Why Filesystem + Metadata Index (Not a Database)

1. **Supabase Storage gives durable storage** — files persist by default, no container dependency
2. **Agent can read/write files via Storage SDK** — standard API, no container filesystem dependency
3. **PDF/DOCX support** — agent reads documents directly for RAG
4. **No external service dependency** — zero cost, zero ToS risk
5. **Supabase index** — stores file path, title, tags, client_id, created_at for fast search

### Supabase Metadata Table

```sql
CREATE TABLE vault_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  file_path TEXT NOT NULL,          -- /home/agent/vault/properties/42-noriega.pdf
  title TEXT NOT NULL,
  file_type TEXT,                    -- pdf, docx, md, jpg
  tags TEXT[] DEFAULT '{}',          -- ['listing', 'district-10', 'condo']
  summary TEXT,                      -- AI-generated summary
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: each client sees only their files
ALTER TABLE vault_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON vault_files
  USING (client_id = current_setting('app.client_id'));

-- Full-text search on title + summary
CREATE INDEX vault_files_search ON vault_files
  USING gin(to_tsvector('english', title || ' ' || COALESCE(summary, '')));
```

### What the Agent Does

| Action | Example |
|--------|---------|
| **Store** | User forwards PDF in WhatsApp → agent saves to vault, generates summary, indexes |
| **Retrieve** | "Find me the floor plan for 42 Noriega" → agent searches index, returns file |
| **Answer** | "What's the lease term on the Newton Rd tenancy?" → agent reads PDF, answers (RAG) |
| **Organize** | Auto-tags documents by content (listing, contract, guide, etc.) |
| **Brief** | Viewing Prep Pack (#34) — pulls property docs 30min before viewing |

### UI — Inspired by Outline

**What to steal from Outline's design:**
- Tree/folder sidebar navigation
- Markdown rendering with embedded images
- Search bar with instant results
- Document detail view with metadata sidebar
- Clean, minimal, fast

**What we don't need:**
- Collaborative editing (agent writes, user reads)
- Version history (filesystem has git if needed)
- Team permissions (single user per container)

---

## 5. Forms — Tally.so via Composio

### Architecture

```
User signs up for Sunder
    → Onboarding: "Let's set up your forms"
    → Composio auth flow → user connects their own Tally free account
    → Agent now has full form management via 16 Composio actions
    → Webhooks per form → push submissions to Supabase
    → User never opens Tally dashboard
```

### Why This Works

- **Tally Free tier** gives each user: unlimited forms, unlimited submissions, API access (public beta, free), webhooks (free), conditional logic, calculations, signatures, file uploads
- **Cost to Sunder: $0** — each user owns their own account
- **No ToS risk** — each user has their own account, fair use policy doesn't apply
- **Composio handles**: API key storage, token management, action execution

### Key Composio Actions the Agent Uses (16 tools)

| Action | Use Case |
|--------|----------|
| `Create Form` | Generate open house sign-in, feedback survey, lead capture form |
| `Update Form` | Modify form fields, settings, logic |
| `Delete Form` | Clean up old forms |
| `Get Form Details` | Check form configuration |
| `Get Form Fields` | Understand form structure for data mapping |
| `Get Form Responses` | Pull submission data into CRM |
| `List Submissions` | Get all responses for a form |
| `Create Webhook` | Set up real-time notification on new submission |
| `List Webhooks` | Check existing webhook configurations |
| `Get Webhook Events` | Debug webhook delivery issues |
| `List Forms` | See all user's forms |
| `List Workspaces` | Check workspace organization |

### API Verification: Full E2E Support Confirmed

**Verified Feb 16, 2026.** Tally API supports complete programmatic form creation — the agent can build and publish forms with webhooks without the user touching the Tally dashboard.

**What the agent can do via API (no UI required):**

| Capability | API Endpoint | Verified |
|-----------|-------------|----------|
| Create forms with 30+ field types | `POST /forms` | Yes — INPUT_TEXT, INPUT_EMAIL, INPUT_PHONE_NUMBER, INPUT_NUMBER, INPUT_DATE, INPUT_TIME, TEXTAREA, DROPDOWN, CHECKBOXES, MULTIPLE_CHOICE, LINEAR_SCALE, MATRIX, FILE_UPLOAD, SIGNATURE, HIDDEN_FIELDS, CALCULATED_FIELDS, etc. |
| Conditional logic | Form blocks config | Yes — show/hide fields based on previous answers |
| Multi-page forms | Form blocks with page breaks | Yes — `PAGE_BREAK` block type |
| Publish in single API call | `status: "PUBLISHED"` | Yes — form is live immediately on creation |
| Webhooks for submissions | `POST /webhooks` | Yes — `FORM_RESPONSE` event type, signing secret for verification |
| File uploads & signatures | Block types | Yes — `FILE_UPLOAD` (10MB free tier), `SIGNATURE` |
| Hidden & calculated fields | Block types | Yes — pass metadata, auto-calculate values |
| Custom thank-you page | Form settings | Yes — redirect URL after submission |

**Concrete setup sequence (2 API calls = published form with webhook):**

```
1. POST /forms
   → blocks: [
       { type: "INPUT_TEXT", label: "Full Name" },
       { type: "INPUT_PHONE_NUMBER", label: "Phone" },
       { type: "INPUT_EMAIL", label: "Email" },
       { type: "DROPDOWN", label: "How did you hear about us?",
         options: ["PropertyGuru", "Friend", "Social Media", "Walk-in"] },
       { type: "MULTIPLE_CHOICE", label: "Budget Range",
         options: ["Under $1M", "$1M-$2M", "$2M-$5M", "$5M+"] }
     ]
   → status: "PUBLISHED"
   → settings: { redirectUrl: "https://sunder.ai/thanks" }
   → Returns formId + public URL (tally.so/r/xxxxx)

2. POST /webhooks
   → formId, url: "https://api.sunder.ai/webhooks/tally"
   → eventTypes: ["FORM_RESPONSE"]
   → signingSecret: "whsec_..." (for payload verification)
```

**No documented UI-only features.** Everything an RE agent needs — form creation, field configuration, publishing, and webhook setup — is fully API-accessible.

### Free Tier Limitations & Mitigations

| Limitation | Mitigation |
|-----------|------------|
| Tally branding on forms | Fine for MVP. User can upgrade to Pro ($24/mo) themselves if they want branding removed. |
| No custom domains | Forms hosted at tally.so/r/xxxx — fine for sign-in forms and surveys |
| No custom CSS | Default Tally styling is clean enough for RE use cases |
| 10MB file upload limit | Sufficient for open house sign-ins and feedback |

### Use Cases

| Form Type | Product Feature | When Created |
|-----------|----------------|--------------|
| **Open House Sign-In** | Open House Manager (#22) | Agent generates QR → attendee fills form → auto-create lead |
| **Feedback Survey** | After-viewing follow-up | Agent sends link after viewing → responses update CRM |
| **Lead Capture** | Social Butler (#10) | Embedded in content/landing pages |
| **Client Intake** | Onboarding | New client → agent sends intake form → pre-populate CRM |
| **Property Preferences** | Client Matchmaker (#29) | Structured preference capture for matching |

### Flow: Open House Sign-In

```
Agent creates form via Composio:
  → Create Form: { blocks: [name, phone, email, "How did you hear about this?"] }

Agent creates webhook via Composio:
  → Create Webhook: { formId, url: "https://api.sunder.ai/webhooks/tally",
                       eventTypes: ["FORM_RESPONSE"] }

Agent generates QR code for form URL → sends to user via WhatsApp

At open house:
  Attendee scans QR → fills form → Tally webhook fires
  → Sunder API receives submission
  → Creates contact in Supabase CRM
  → Agent sends WhatsApp to user: "New lead: Sarah Lee, interested in 3BR,
     heard about you from PropertyGuru"
  → Agent queues follow-up for next day
```

---

## 6. Link Attribution — Short.io via Composio

### Architecture

```
User signs up for Sunder
    → Onboarding (Phase 2): "Let's set up link tracking"
    → Composio auth flow → user connects their own Short.io free account
    → Agent now has full link management via 18 Composio actions
```

### Why This Works

- **Short.io Free tier** gives each user: 1,000 branded links (lifetime), 50K tracked clicks/mo, 5 custom domains, API access (free), webhooks, QR codes, bulk operations, click analytics
- **Cost to Sunder: $0** — each user owns their own account
- **Composio handles**: API key storage, token management, 18 pre-built actions
- **Best-in-class free tier**: Far more generous than alternatives (TinyURL = 30 links/mo, Cutt.ly = 30 links/mo, Bitly = 5 links/mo)

### Key Composio Actions the Agent Uses (18 tools)

| Action Category | Use Cases |
|----------------|-----------|
| **Link Creation** | Shorten property links, campaign URLs, referral links |
| **Link Management** | Update destinations, archive old links, set expiration dates |
| **Analytics** | Track clicks, devices, locations, referrers per link |
| **Domains** | Add custom domains (e.g., go.sarahlee-realty.com) |
| **Bulk Operations** | Create/update many links at once for campaigns |
| **QR Codes** | Generate QR codes for open house posters, flyers |
| **Tags & Folders** | Organize links by campaign, property, client type |
| **UTM Parameters** | Auto-append tracking params for attribution |

### When to Add (Not MVP)

Short.io becomes valuable in Phase 2 when these features ship:

| Feature | Why Short.io Matters |
|---------|---------------------|
| **Social Butler (#10)** | Track which social posts drive clicks |
| **Content Factory (#8)** | Attribute content engagement to specific campaigns |
| **Referral Network Manager (#32)** | Unique referral links per referral partner |
| **Open House invites** | Track RSVPs and engagement via QR codes |
| **Email campaigns** | Click tracking in Resend emails |

### Why NOT MVP

At MVP, the agent sends property links in 1-on-1 WhatsApp conversations. The agent already knows who they sent it to. Link tracking adds intelligence only when:
- Broadcasting to many people (marketing)
- Tracking across channels (email + social + WhatsApp)
- Measuring referral attribution
- A/B testing different content approaches

### When Ready: Implementation

```typescript
// Agent creates tracked property link via Composio
const { shortLink } = await composio.executeAction({
  action: "SHORTIO_CREATE_LINK",
  params: {
    originalURL: "https://propertyguru.com.sg/listing/42-noriega",
    domain: "go.sarahlee-realty.com",  // or default Short.io domain
    path: "42noriega",
    title: "42 Noriega St - 3BR Condo",
    tags: ["property-viewing", "district-10", "deal_12345"],
  }
});

// Agent sends via WhatsApp
// "Here's the listing for 42 Noriega: https://go.sarahlee-realty.com/42noriega"

// Later: agent checks engagement via Composio
const analytics = await composio.executeAction({
  action: "SHORTIO_GET_LINK_STATS",
  params: { linkId: shortLink.id }
});
// → { clicks: 12, uniqueClicks: 5, devices: {...}, locations: {...} }

// Agent insight:
// "Sarah clicked the Noriega listing 5 times this week" → buying signal
```

### Free Tier Limitations & Mitigations

| Limitation | Mitigation |
|-----------|------------|
| 1,000 links total (lifetime) | Sufficient for most agents. At 10 properties/month = 8+ years of links. Archive old links to free up quota. |
| Short.io branding on default domain | Use custom domain (go.sarahlee-realty.com) — free on any tier, just requires DNS setup |
| 50K clicks/month | Far more than needed. An agent with 100 active deals x 50 clicks each = 5K/mo. |
| 5 custom domains | More than enough. Most agents use 1-2 domains max. |

### User Experience

```
Phase 2 onboarding:
  Agent: "Let's set up link tracking for your campaigns"
  → Composio auth flow → user creates Short.io free account (2 min)
  → Token stored in Composio

Agent auto-shortens links when broadcasting:
  → WhatsApp blast to 50 open house leads
  → Each link is unique: https://go.agent.com/newton-oh-001, newton-oh-002, etc.
  → Click tracking per recipient

Daily briefing:
  "Your Newton Rd open house link: 23 clicks, 8 unique visitors.
   Top 3 most engaged: Sarah (5 clicks), James (3 clicks), Maria (2 clicks).
   Consider prioritizing Sarah for follow-up."
```

---

## 7. Document Signing — DocuSeal (Future, v2)

### Architecture

```
Sunder owns one DocuSeal Cloud Pro account ($20/mo + $0.20/doc)
    → Agent creates templates + sends signing requests via API
    → Signed PDFs stored in client's vault (filesystem)
    → Webhooks notify on completion
```

### Use Cases

| Document | Product Feature |
|----------|----------------|
| Option to Purchase (OTP) | Transaction Coordinator (#17) |
| Sale & Purchase Agreement | Transaction Coordinator (#17) |
| Tenancy Agreement | Contract management |
| Commission Agreement | Commission Tracker (#18) |
| Client Authorization | Compliance Cop (#23) |

### Cost Projection

At 50 clients x 5 docs/month = 250 docs/month:
- Pro seat: $20/mo
- API documents: 250 x $0.20 = $50/mo
- **Total: $70/month**

### Not MVP

Document signing is Phase 4 (Transaction & Operations). The agent can send PDFs via WhatsApp for manual signing in the meantime. DocuSeal adds automated workflows when volume justifies it.

---

## 8. Voice Input & Transcription

There are two distinct sources of voice input Neo needs to handle. They use different services and have different setup requirements.

### The Four Voice Use Cases (Overview)

| # | Who sends | To whom | What happens | Section |
|---|-----------|---------|--------------|---------|
| 1 | User types text | Client (3rd party) | Neo generates voice note in user's cloned voice → client receives it on WhatsApp | §9 |
| 2 | Neo replies | User | Neo sends audio reply so user doesn't have to read text | §9 |
| 3 | User sends voice | Neo | Neo transcribes and understands — responds as normal | §8.1 |
| 4 | User has a meeting | Neo | Granola captures the transcript, Neo reads it via MCP | §8.2 |

---

### 8.1 WhatsApp Voice → Neo (Whisper Transcription)

**Use case 3:** User sends Neo a voice message instead of typing. Neo transcribes it and responds.

This is the most frequent input pattern. In many markets, people send voice notes by default rather than typing. Neo must handle these seamlessly.

#### Flow

```
User records voice note in WhatsApp → sends to Neo's number
    → WhatsApp Business Platform webhook receives media metadata
    → Agent calls Whisper API: POST /v1/audio/transcriptions
        { file: audio.ogg, model: "whisper-1" }
    → Transcription returned as text in ~1–2s
    → Agent processes as if user typed the message
    → Neo replies (text or voice, depending on user preference)
```

**No extra friction for the user.** They just send a voice note like they always do. Neo transcribes silently and responds.

#### Why Whisper

| Factor | Whisper | Runner-up (Deepgram) |
|--------|---------|----------------------|
| Accuracy | Best-in-class, multilingual | Very good |
| Languages | 99+ (English, Mandarin, Malay covered) | 36+ |
| Cost | $0.006/min | $0.0043/min |
| API simplicity | Single endpoint, file upload | Streaming adds complexity |
| Ecosystem fit | Same vendor as GPT-4o | Separate account |

Deepgram is slightly cheaper but streaming adds unnecessary complexity for async WhatsApp. Batch mode is fine.

#### Cost at Scale

| Scale | Voice notes/day | Avg duration | Monthly cost |
|-------|----------------|--------------|-------------|
| MVP (10 clients) | 20 total | 30s | ~$0.18/mo |
| Phase 3 (100 clients) | 200 total | 30s | ~$1.80/mo |
| 1,000 clients | 2,000 total | 30s | ~$18/mo |

Negligible at every scale. No optimization needed.

#### Escape Hatch

Deepgram Nova-3 is a drop-in swap — same batch pattern, marginally cheaper. Migration is 1 hour if Whisper degrades on Singlish/Mandarin mix.

---

### 8.2 Meeting Transcripts → Neo (Granola MCP)

**Use case 4:** User has an in-person or video meeting with a client. They want Neo to know what was discussed — to update the CRM, suggest next steps, draft follow-ups.

We do not build this. We guide the user to connect Granola, which handles everything.

#### What Granola Is

Granola is a Mac app that automatically transcribes meetings — Zoom, Google Meet, Teams, in-person (via mic). It's free. It has an official MCP server that exposes transcripts to any MCP-compatible agent.

Reference: https://www.granola.ai/blog/granola-mcp

#### Setup Flow (Guided Onboarding — One Time)

```
Agent (WhatsApp): "To let me read your meeting notes, download Granola (free Mac app).
                   It'll automatically capture your calls and I'll be able to access them.
                   Here's how to connect it: [link to setup guide]"

User:
  1. Downloads Granola at granola.ai (free)
  2. Opens Granola → Settings → MCP → copies the connection config
  3. Adds MCP config to their agent setup (we provide a one-page guide)
  4. Done — Granola runs in background, captures meetings automatically

Neo can now call:
  → granola_get_recent_meetings()       — list last N meetings
  → granola_get_meeting_transcript(id)  — full transcript
  → granola_search_meetings(query)      — "what did Sarah say about budget?"
```

**No mobile app. No recording infrastructure. No storage. No transcription cost.** Granola handles all of it.

#### What Neo Does With Meeting Transcripts

| Trigger | Neo Action |
|---------|-----------|
| User: "Update CRM from my call with James" | Neo pulls latest Granola transcript → extracts deal stage, budget, objections → writes to Supabase |
| User: "Draft a follow-up for my 3pm meeting" | Neo reads transcript → writes personalized follow-up → sends as draft |
| Morning briefing | Neo checks yesterday's meetings → includes a 2-line summary per meeting |
| User: "What did Sarah say about the timeline?" | Neo searches Granola transcripts for Sarah + timeline → answers |

#### Why Not Build This

- Building a meeting recorder requires: background audio entitlements (Apple requires justification, takes weeks), App Store review (months), a mobile app (6+ months dev time), your own transcription pipeline.
- Granola already solved all of this. It's free. It has an MCP server. We just connect to it.
- If a user is on Windows or doesn't want Granola: they use WhatsApp voice notes to Neo for field notes instead (use case 3). Voice-memo-to-self is the fallback — no app needed.

#### Limitations

| Limitation | Mitigation |
|-----------|------------|
| Mac-only | Windows support is on Granola's roadmap. Windows users use voice-memo-to-self via WhatsApp. |
| In-person meetings require mic | Granola handles this automatically if laptop is open nearby |
| User must remember to have Granola open | Granola runs on startup by default |
| Transcript accuracy on Singlish | Granola uses Whisper under the hood — same limitations, same acceptable quality |

---

## 9. Voice Output — Cloning & TTS (Inworld AI)

Two output scenarios. Both use the same Inworld AI service and the same delivery pipeline. The difference is whose voice and who receives it.

### The Two Output Scenarios

| Scenario | Sender voice | Recipient | When |
|----------|-------------|-----------|------|
| **User → Client** | User's cloned voice | Client (3rd party) | Agent drafts a follow-up, user approves, it goes out sounding like the user |
| **Neo → User** | Neo's fixed platform voice | User (the agent) | User asks Neo something and prefers to listen rather than read |

---

### 9.1 User Types → Client Receives Voice Note (Use Case 1)

The agent types a message (or Neo drafts one) and it gets sent to a client as a voice note — in the agent's own cloned voice. The client hears their agent, not a robot.

```
User types to Neo: "Send Sarah a voice note — tell her the Noriega offer
                    was accepted and we need to sign by Friday."
    → Neo composes the message text
    → POST Inworld /v1/tts/{user_voice_id}
        { text: "Hi Sarah! Great news — the offer on...", model: "tts-1.5-max" }
    → Returns Opus audio stream
    → FFmpeg converts to WhatsApp-native OGG:
        ffmpeg -i input -c:a libopus -b:a 16k -ar 16000 -ac 1 output.ogg
    → Uploaded to Supabase Storage (temp URL, 1hr expiry)
    → WhatsApp Cloud API sends to Sarah's number as audio message
    → Sarah receives a native WhatsApp voice note (mic icon + inline player)
    → Sounds like the agent. Sarah has no idea it was AI-generated.
```

#### Voice Cloning Onboarding

Happens once, during initial setup:

```
Agent (WhatsApp): "Send me a 15-second voice note — introduce yourself,
                   say anything. I'll use it to clone your voice."
User records in WhatsApp → sends to Neo
    → WhatsApp records natively in OGG/Opus (no conversion needed for ingestion)
    → POST Inworld /v1/voices/add { audio: sample.ogg }
    → Returns voice_id
    → Stored in Supabase: clients.voice_id, clients.voice_cloned_at
    → Done.
```

---

### 9.2 Neo → User Replies as Voice (Use Case 2)

Neo has three modes for when to reply as audio. Borrowed from OpenClaw's `auto` pattern.

| Mode | When Neo sends audio | Set by |
|------|---------------------|--------|
| `off` | Never (text only) | Default |
| `inbound` | Only when user's message was a voice note | **Recommended default** |
| `always` | Every reply is audio | User preference |

**`inbound` is the right default.** If the user sent a voice note, they're clearly not in a position to type — they're driving, on site, hands busy. Reply in kind. If they typed, reply as text. No friction, no setting required.

#### Flow

```
WhatsApp Cloud API webhook receives message
    → Is it audio? YES
        → Whisper transcribes (§8.1) → Neo processes as text
        → Neo composes response
        → tts_mode = check Supabase clients.tts_mode
            "inbound" → send as voice (this message was inbound audio)
            "always"  → send as voice
            "off"     → send as text
        → POST Inworld /v1/tts/{neo_voice_id}
            { text: "Got it. Viewing is confirmed for...", model: "tts-1.5-mini" }
        → FFmpeg → OGG → WhatsApp Cloud API → user receives voice reply
    → Is it audio? NO (text message)
        → Neo processes and responds
        → tts_mode = check clients.tts_mode
            "always"  → send as voice
            "inbound" → send as text (inbound was text)
            "off"     → send as text
```

#### Changing Mode

User just tells Neo:
```
"Reply to me with voice notes from now on"  → sets tts_mode = "always"
"Stop sending me voice notes"               → sets tts_mode = "off"
"Only send voice when I send voice"         → sets tts_mode = "inbound"
```

Neo updates `clients.tts_mode` in Supabase. No settings UI needed.

**Neo's voice** is a fixed, platform-level voice selected once by Sunder. One `neo_voice_id` in env config. Not per-user — Neo always sounds like Neo.

---

### 9.3 Shared Pipeline

Both scenarios use the same pipeline after TTS generation.

#### WhatsApp Format Requirements

WhatsApp renders audio as a native voice note (mic icon, inline player) only with exact format:

| Requirement | Spec | How Met |
|------------|------|---------|
| Container | OGG | FFmpeg output |
| Codec | Opus | `-c:a libopus` |
| Channels | Mono | `-ac 1` |
| Sample Rate | 16kHz | `-ar 16000` |
| Bitrate | 12–24kbps | `-b:a 16k` |
| File size | <512KB | ~3KB/s at 16kbps → ~3min max |

FFmpeg runs in Vercel Sandbox (from pre-built snapshot). Spun up on-demand when audio processing is needed. One command, no persistent service, no idle cost.

#### Why Inworld AI

| Factor | Inworld Max | ElevenLabs |
|--------|-------------|------------|
| Quality (ELO rank) | **#1 / 1160** | #3 / 1108 |
| Cost @ 150M chars/mo | **~$1,500** | ~$15,000–$30,900 |
| Min cloning audio | **5–15s** | varies |
| Zero Data Retention | **Yes** | No |
| SOC 2 Type II | **Yes** | No |
| IP ownership of outputs | **Customer** | Platform |

#### Model Routing

| Scenario | Model | Cost/1M chars | Why |
|---------|-------|--------------|-----|
| User → Client (relationship messages) | TTS-1.5 Max | $10 | #1 quality — the client hears this |
| Neo → User (briefings, replies) | TTS-1.5 Mini | $5 | Quality sufficient, 2x cheaper |

#### Supabase Schema

```sql
-- Add to clients table
ALTER TABLE clients ADD COLUMN voice_id TEXT;             -- Inworld voice_id for this user
ALTER TABLE clients ADD COLUMN voice_cloned_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN voice_consent BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN voice_sample_path TEXT;    -- in vault, for portability

-- Cache generated audio (avoid re-generating identical messages)
CREATE TABLE voice_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  text_hash TEXT NOT NULL,            -- SHA256 of (voice_id + text + model)
  audio_path TEXT NOT NULL,           -- Supabase Storage path
  duration_seconds FLOAT,
  characters INTEGER,
  model TEXT,
  scenario TEXT,                      -- 'user_to_client' | 'neo_to_user'
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(client_id, text_hash)
);
```

#### Cost at Scale

| Scale | Voice notes/mo | Model mix | Monthly cost |
|-------|---------------|-----------|-------------|
| MVP (10 clients) | 1,000 total | Max | **~$2/mo** |
| Phase 3 (100 clients) | 10,000 total | Max | **~$20/mo** |
| 1,000 clients (heavy) | 150M chars | Mix | **~$750–1,500/mo** |

#### Consent and IP

- `voice_consent = true` stored before any clone attempt
- Original sample saved to `/vault/clients/{id}/voice-sample.ogg`
- User can delete at any time → DELETE Inworld `/v1/voices/{voice_id}` + purge sample
- Re-cloning on a new provider takes minutes — original sample is portable

#### Singapore Pronunciation

Test during Sprint 2 — send a voice note with typical SG place names (Buona Vista, Ang Mo Kio, Toa Payoh, Novena) through Inworld and listen. If it mispronounces, add a simple text preprocessing step that rewrites known problem words to phonetic spellings before the TTS call. Don't over-engineer upfront.

#### Escape Hatches

All major providers follow identical two-call pattern (`POST /voices/add` → `POST /tts/{voice_id}`). Migration = swap base URL + auth header. Original sample enables instant re-cloning on any provider.

| Provider | Cost @ 150M chars/mo | Quality (ELO) | Notes |
|---------|----------------------|--------------|-------|
| **Inworld** (primary) | ~$750–$1,500 | #1 / 1160 | Zero Data Retention, SOC 2 II |
| **Hume Octave 2** (backup) | ~$1,140 | #14 / 1046 | Strong emotional range; needs FFmpeg |
| **Fish Audio** (backup) | ~$2,250 | #7 / 1074 | Good expressiveness; OGG wrap uncertain |

---

## 10. Social Media — Postiz (Phase 2)

Another dev is researching Postiz. **Now prioritized as Phase 2** for Social Butler (#10) and Content Factory (#8).

Expected integration pattern: Same as others — Sunder central account or user-authed via Composio, agent manages posts/scheduling via API.

> **Note:** Probably makes more sense to just buy Postiz (hosted/enterprise) rather than self-host. Self-hosting requires getting your own social platform app approvals (Facebook, Instagram, X, etc.) which takes significant time and effort. The hosted version comes with pre-approved app credentials out of the box.

---

## 11. Document Extraction (Inbound) — Gemini 2.5 Flash + ExtendAI

### Architecture

```
User forwards document via WhatsApp (or uploads via dashboard)
    → Stored in Supabase Storage: documents/{client_id}/{doc_id}.{ext}
    → Trigger.dev task: "document-processing" (per-client queue)
    → Gemini 2.5 Flash: classify + split (against tag pool)
    → For each split: extract via Gemini structured output or ExtendAI
    → Auto-link to CRM contacts/deals (fuzzy match)
    → Confirm via WhatsApp with extracted summary
```

**Core capability reused from Sunder:** Battle-tested pipeline — upload → Gemini classification → PDF splitting → structured extraction → per-field confidence → validation. Changed only input method (WhatsApp-first) and tag configuration (RE-specific).

### Platform Tags (RE Defaults)

| Tag | Extracted Fields |
|-----|-----------------|
| `floor_plan` | unit_number, sqft, bedrooms, bathrooms, facing, floor_level |
| `otp` | property, price, option_fee, exercise_deadline, conditions[] |
| `tenancy_agreement` | tenant, landlord, property, monthly_rent, start_date, end_date, deposit |
| `valuation_report` | property, market_value, forced_sale_value, valuer, date |
| `commission_note` | property, transaction_value, rate, gross_commission, co_broke_split |
| `property_brochure` | development_name, developer, address, unit_mix[], pricing_range, TOP_date |
| `receipt` | vendor, amount, date, category, description |
| `other` | description (catch-all, no structured extraction) |

### User Custom Tags (Self-Serve Schema Builder)

Users define custom extraction schemas conversationally. The AI creates the schema, tests it against a sample, and auto-extracts from then on.

```
User: "I get renovation quotations. Can you extract data from those?"
Agent: "What fields do you care about?"
User: "Contractor name, total cost, itemized breakdown, start date, warranty"
Agent: "Got it. Created extraction schema:

       📄 renovation_quotation
       • contractor_name (text), total_cost (currency)
       • line_items (array), start_date (date), warranty_period (text)

       Want to test it? Forward me a sample."

User: [forwards PDF]
Agent: "Extracted: Contractor: HomeStyle Pte Ltd, Total: $42,800...
       Looks right? I can adjust the schema."
```

Behind the scenes: Agent calls `create_extraction_schema` → row in `extraction_schemas` table → classification hint added to Gemini tag pool → future documents auto-classified and extracted.

### Extraction Pipeline

```
Document arrives (WhatsApp forward or dashboard upload)
      │
      ▼
Store in Supabase Storage: documents/{client_id}/{doc_id}.{ext}
      │
      ▼
Trigger.dev task: "document-processing" (per-client queue)
      │
      ▼
1. Upload to Google Files API (temporary)
      │
      ▼
2. Gemini 2.5 Flash: classify + split
   Tag pool = platform tags + client's custom tags
   Each tag has a classificationHint (2-3 sentences)
   Returns: { splits: [{ type, startPage, endPage, identifier, date }] }
      │
      ▼
3. For each split:
   a. If PDF: extract page range as child PDF
   b. Route to extraction backend:
      - Gemini structured output (simple schemas, <10 fields)
      - ExtendAI processor (complex schemas, tables, citations)
   c. Validate extraction (per-field confidence, business rules)
   d. Store results in document_extractions table
      │
      ▼
4. Auto-link to CRM:
   - Fuzzy match extracted names → contacts table
   - Match property addresses → active deals
   - Set document.contact_id and document.deal_id
      │
      ▼
5. Confirm via WhatsApp:
   "Filed the OTP for 42 Noriega under Sarah Chen's deal.
    Exercise deadline: Feb 28. Option fee: $5K (1%).
    Want me to create a task for the deadline?"
      │
      ▼
6. Cleanup: delete from Google Files API
```

### Two Extraction Backends

| Backend | When | Cost | Features |
|---------|------|------|----------|
| Gemini 2.5 Flash structured output | Simple schemas (<10 fields, no tables) | Free (bundled with classification call) | Fast, one API call, no citations |
| ExtendAI processor | Complex schemas (tables, nested data) | ~$0.10-0.50/doc | Per-field OCR confidence, bounding boxes, handles messy scans |

User custom schemas start with Gemini. Upgrade to ExtendAI when higher accuracy or citation support is needed.

### Database Schema

```sql
-- Inbound documents (files the user sends to the AI)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),      -- auto-linked or manually set
  deal_id UUID REFERENCES deals(id),             -- auto-linked or manually set
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,                       -- pdf, jpg, png, etc.
  file_size INTEGER,
  file_hash TEXT,                                -- SHA256 for deduplication
  status TEXT NOT NULL DEFAULT 'uploaded',       -- uploaded, processing, complete, failed
  -- Gemini classification output
  primary_tag TEXT,
  tags JSONB DEFAULT '{}',                       -- { "floor_plan": 2, "receipt": 1 }
  description TEXT,
  is_heterogeneous BOOLEAN DEFAULT false,
  document_date DATE,
  -- Processing metadata
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-split extraction results
CREATE TABLE document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  split_index INTEGER NOT NULL DEFAULT 0,
  start_page INTEGER,
  end_page INTEGER,
  tag_id TEXT NOT NULL,                          -- extraction schema slug
  identifier TEXT,                               -- invoice #, unit #, policy #
  document_date DATE,
  -- Extraction output
  extracted_data JSONB DEFAULT '{}',
  original_extracted_data JSONB DEFAULT '{}',    -- immutable backup for audit
  extraction_metadata JSONB DEFAULT '{}',        -- per-field confidence, citations
  extraction_status TEXT DEFAULT 'pending',      -- pending, processing, complete, needs_review, failed
  extraction_error TEXT,
  -- Validation
  validation_failures JSONB,
  low_confidence_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User-defined extraction schemas (custom document types)
CREATE TABLE extraction_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  slug TEXT NOT NULL,                            -- e.g. "renovation_quotation"
  display_name TEXT NOT NULL,
  classification_hint TEXT NOT NULL,             -- 2-3 sentences for Gemini classification
  fields JSONB NOT NULL,                         -- array of { name, type, description, required }
  extraction_backend TEXT DEFAULT 'gemini',      -- 'gemini' or 'extend'
  extend_processor_id TEXT,                      -- ExtendAI processor ID (if backend = 'extend')
  validate_rules JSONB DEFAULT '[]',
  sample_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',                   -- draft, active, archived
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, slug)
);

-- RLS on all three tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_isolation" ON documents FOR ALL
  USING (client_id = current_setting('app.client_id')::TEXT);
CREATE POLICY "client_isolation" ON document_extractions FOR ALL
  USING (document_id IN (SELECT id FROM documents WHERE client_id = current_setting('app.client_id')::TEXT));
CREATE POLICY "client_isolation" ON extraction_schemas FOR ALL
  USING (client_id = current_setting('app.client_id')::TEXT);
```

### Agent Tools

| Tool | Description |
|------|-------------|
| `process_document` | Classify, split, extract. Called automatically when user forwards a file via WhatsApp. |
| `search_documents` | Find docs by type, contact, deal, date, or content. Returns metadata + download URLs. |
| `create_extraction_schema` | Create custom schema for a new document type. User describes fields conversationally. |
| `update_extraction_schema` | Add/remove fields, update classification hint, activate/archive. |
| `list_extraction_schemas` | List all schemas (platform defaults + user custom). |

### User Experience

```
User (WhatsApp): [forwards PDF of tenancy agreement]

Agent:
  "Filed the tenancy agreement under Sarah Chen's deal.
   Key details:
   • Tenant: James Tan
   • Monthly rent: $3,200
   • Lease: 1 Mar 2026 – 28 Feb 2028
   • Deposit: $6,400 (2 months)

   Want me to create a task for the lease expiry?"
```

### Cost at Scale

| Scale | Docs/month | Monthly cost |
|-------|-----------|-------------|
| MVP (10 clients) | ~50 | ~$0/mo (Gemini only, free with classification) |
| Phase 3 (100 clients) | ~5,000 | ~$50-125/mo (80% Gemini, 20% ExtendAI) |
| 1,000 clients | ~50,000 | ~$500-1,250/mo |

### Scaling Path

| Phase | Platform tags | User schemas | Backend |
|---|---|---|---|
| MVP | 8 RE-specific | 0 | Gemini structured output only |
| Month 1-3 | Same 8 | 1-3 per client | Gemini + ExtendAI |
| Growth | 15-20 (multi-vertical) | 5-10 per client | ExtendAI for high-volume tags |
| Scale | 30+ | Unlimited | Per-tag routing based on accuracy metrics |

---

## 12. Document Generation (Reports) — Custom MCP (Ported from Sunder)

### Architecture

```
Agent needs a report from extracted document data
    → Calls docgen MCP tools
    → MCP queries document_extractions (Supabase, RLS-scoped)
    → Generates Excel:
        Quick export → ExcelJS (deterministic, instant)
        AI report → Claude Skills API (30-60s)
    → Uploads to Supabase Storage: reports/{client_id}/
    → Returns signed download URL (1hr expiry)
    → Agent sends link via WhatsApp
```

**Ported from Sunder production.** The existing Sunder doc generation backend is production-ready. We port the core utilities, expose as MCP tools, remove the UI (agent handles everything via chat).

### Why This Fits Phase 1

| Phase 1 Already Has | Doc Gen MCP Adds | User Value |
|---------------------|------------------|------------|
| Document extraction pipeline (§11) | Excel report generation | "Show me all tenancy agreements in a spreadsheet" |
| Custom extraction schemas | Report templates | "Which properties have expiring leases this month?" |
| `document_extractions` table | Smart flattening + AI analysis | "Check if all GST calculations are correct" |
| Extract → CRM workflow | Extract → Report workflow | "Give me a summary of all valuations this quarter" |

**Natural progression:** Extract structured data → Generate reports from it.

### Report Types

| Type | Speed | Use Case |
|------|-------|----------|
| `quick_export` | Instant | Data dump — Excel with smart flattening |
| `ai_summary` | 30-60s | Key insights, totals, patterns — multi-sheet Excel |
| `ai_reconciliation` | 30-60s | Validation checks, error flagging — pass/fail indicators |
| `ai_custom` | 30-60s | User prompt → Claude custom analysis |

### MCP Server: `docgen-server`

**Location:** `mcp-servers/docgen/server.ts`

**3 Tools:**

**Tool 1: `generate_report`**

```typescript
{
  name: "generate_report",
  description: "Generate Excel report from extracted document data.",
  inputSchema: {
    type: "object",
    properties: {
      clientId: { type: "string", description: "Client ID (for RLS scoping)" },
      reportType: {
        type: "string",
        enum: ["quick_export", "ai_summary", "ai_reconciliation", "ai_custom"]
      },
      extractionSchemaIds: {
        type: "array", items: { type: "string" },
        description: "Filter by schema IDs (e.g., ['tenancy_agreement', 'valuation_report'])"
      },
      dateRange: {
        type: "object",
        properties: { startDate: { type: "string" }, endDate: { type: "string" } }
      },
      customPrompt: { type: "string", description: "For ai_custom type" }
    },
    required: ["clientId", "reportType", "extractionSchemaIds"]
  }
}
```

**Output:** `{ reportId, downloadUrl, expiresAt, metadata: { reportType, recordCount, schemasIncluded, fileSizeBytes } }`

**Behind the scenes:**
1. Query `document_extractions` (RLS scoped to clientId, filtered by schemaIds + dateRange)
2. Convert to Excel via `excel-generator.ts` (smart flattening) — or call `claude-report.ts` for AI reports
3. Upload to Supabase Storage `reports/{clientId}/`
4. Insert metadata into `report_history` table
5. Generate signed URL (1 hour expiry)
6. Return download URL

**Tool 2: `list_reports`** — List previously generated reports with fresh download URLs.

**Tool 3: `download_report`** — Get fresh signed URL for a specific report.

### Excel Features

All reports include:
- **Smart flattening**: Currency objects → amount + currency columns, nested objects → prefixed columns
- **Array expansion**: Arrays of objects → multiple rows (e.g., multiple tenants per lease)
- **Auto-formatting**: Currency formatting, date formatting, column widths
- **Auto-sum rows**: Numeric columns get TOTAL row at bottom
- **Frozen headers**: First row frozen for scrolling

### Porting from Sunder

| Sunder Source | Port To | Changes |
|---------------|---------|---------|
| `src/lib/docgen/excel-generator.ts` | `mcp-servers/docgen/lib/excel-generator.ts` | None — copy as-is |
| `src/lib/docgen/claude-report.ts` | `mcp-servers/docgen/lib/claude-report.ts` | None |
| `src/lib/docgen/types.ts` | `mcp-servers/docgen/lib/types.ts` | Adapt for MCP tool params |
| `src/lib/docgen/prompts.ts` | `mcp-servers/docgen/lib/prompts.ts` | RE-specific prompt templates |

**Schema mapping:** `case_id` → `client_id`, `tag_id` → `schema_id`, `splits` table → `document_extractions` table. Minimal changes.

### MCP Server Implementation

```typescript
import { createServer } from '@modelcontextprotocol/sdk/server/index.js';
import { createClient } from '@supabase/supabase-js';
import { convertSplitsToExcel } from './lib/excel-generator.js';
import { generateAIReport } from './lib/claude-report.js';
import { getPromptForType } from './lib/prompts.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'generate_report') {
    const { clientId, reportType, extractionSchemaIds, dateRange, customPrompt } = request.params.arguments;

    // 1. Set RLS context
    await supabase.rpc('set_client_context', { client_id: clientId });

    // 2. Query document_extractions (RLS-scoped)
    let query = supabase
      .from('document_extractions')
      .select('id, schema_id, extraction_date, extracted_data')
      .eq('client_id', clientId)
      .eq('status', 'complete')
      .in('schema_id', extractionSchemaIds)
      .not('extracted_data', 'is', null);

    if (dateRange) {
      query = query.gte('extraction_date', dateRange.startDate).lte('extraction_date', dateRange.endDate);
    }

    const { data: extractions, error } = await query;
    if (error || !extractions?.length) return errorResult('No extracted data found');

    // 3. Generate Excel
    let fileBuffer: Buffer;
    if (reportType === 'quick_export') {
      fileBuffer = await convertSplitsToExcel(
        extractions.map(e => ({
          id: e.id, tag_id: e.schema_id,
          document_date: e.extraction_date,
          identifier: null, potential_duplicate: null,
          extracted_data: e.extracted_data
        }))
      );
    } else {
      const json = JSON.stringify(extractions.map(e => e.extracted_data));
      const prompt = getPromptForType(reportType, customPrompt);
      const result = await generateAIReport(json, prompt, clientId);
      fileBuffer = Buffer.from(result.fileBuffer);
    }

    // 4. Upload to Supabase Storage + insert report_history + return signed URL
    const filePath = `${clientId}/${Date.now()}_${reportType}.xlsx`;
    await supabase.storage.from('reports').upload(filePath, fileBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const { data: report } = await supabase.from('report_history').insert({
      client_id: clientId, report_type: reportType,
      name: getReportDisplayName(reportType),
      file_path: filePath, file_size_bytes: fileBuffer.length,
      record_count: extractions.length, schemas_included: extractionSchemaIds,
      generated_by: 'agent'
    }).select('id').single();

    const { data: signedUrl } = await supabase.storage.from('reports').createSignedUrl(filePath, 3600);

    return {
      content: [{ type: 'text', text: JSON.stringify({
        reportId: report.id, downloadUrl: signedUrl.signedUrl,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        metadata: { reportType, recordCount: extractions.length, schemasIncluded: extractionSchemaIds, fileSizeBytes: fileBuffer.length }
      })}]
    };
  }

  // list_reports and download_report follow same pattern — query report_history, generate fresh signed URLs
});
```

### Database Schema

```sql
CREATE TABLE report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'quick_export', 'ai_summary', 'ai_reconciliation', 'ai_custom'
  )),
  name TEXT NOT NULL,
  custom_prompt TEXT,
  file_path TEXT NOT NULL,                       -- Storage path: {client_id}/{timestamp}_{type}.xlsx
  file_size_bytes INT,
  record_count INT NOT NULL,
  schemas_included TEXT[] NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL,                    -- "agent" for MCP calls
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON report_history FOR ALL
  USING (client_id = current_setting('app.client_id'));

-- Storage bucket: reports (RLS per client_id folder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;
```

### User Experience

```
Example 1: Quick Export

User (WhatsApp): "Export all tenancy agreements to Excel"
Agent: "Generating export... ⏳"
Agent (2s later): "Here's your Excel export of 42 tenancy agreements:
                  📊 Download: [link expires in 1 hour]"
```

```
Example 2: AI Reconciliation

User: "Check if all GST calculations are correct in tenancy agreements"
Agent: "Running validation checks... ⏳"
Agent (40s later): "Reconciliation complete:
                   ✅ 40 agreements passed all checks
                   ⚠️ 2 issues found:
                   1. TEN-042: GST mismatch ($135 expected, $120 recorded)
                   2. TEN-088: Missing tenant signature date
                   📊 Full validation report: [link]
                   Should I flag these for review?"
```

```
Example 3: AI Analysis

User: "Analyze all property valuations this year and show me trends"
Agent: "Analyzing 87 valuations... ~30 seconds ⏳"
Agent (45s later): "Key findings:
                   • Average valuation: $2.3M (+12% vs last year)
                   • District 10 leads at $3.8M average
                   • 3 outliers flagged (>2σ from mean)
                   📊 Full report: [link]"
```

### Cost

| Item | Cost |
|------|------|
| Quick exports | $0 (deterministic, no AI) |
| AI reports | ~$0.05-0.10 per report |
| Storage | ~$0.021/GB/month |
| Per 100 clients (5 AI reports/client/mo) | ~$7-22/mo total |

### Dependencies

- ExcelJS (npm, from Sunder)
- Anthropic SDK (for AI reports, already in use)
- `document_extractions` table (Section 11, Build 7-8)

### Implementation Checklist

- [ ] Copy Sunder utilities (excel-generator, claude-report, types, prompts) — ~1 hour
- [ ] Create MCP server with 3 tools — ~2 hours
- [ ] Database migration (report_history + storage bucket) — ~30 min
- [ ] Agent skill definition (SKILL.md) — ~1 hour
- [ ] End-to-end test from chat — ~30 min
- **Total: ~5 hours** (ready to use same day)

**Recommendation:** Add as Build 9. Builds on document extraction (Build 7-8), completes the document workflow.

### Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Defer AI reports to Phase 2? | **No** — AI reports are the killer feature. Quick exports alone are meh. |
| 2 | Support CSV export? | **No** — Excel with smart flattening is strictly better. |
| 3 | Email reports instead of download links? | **Phase 2** — WhatsApp links sufficient for MVP. |
| 4 | Rate limit AI reports? | **Monitor first** — $0.05/report × 5/client/month = $0.25/client/month. |
| 5 | Scheduled reports (daily/weekly)? | **Phase 2** — Pattern 1 (basic skills) handles this once stable. |

---

## 13. Artifact Publishing — "Mini Lovable" (Custom)

### The Idea

The agent doesn't just answer questions and update databases — it **produces finished deliverables**. Webpages, pitch sites, interactive maps, property showcases. Things you could send to a client and they'd think a designer made it.

This is the "mini Lovable" capability: the agent generates production-grade, single-file HTML/CSS/JS artifacts and publishes them to a URL the user can share.

### Why This Matters

The interior designer example tells the whole story:

> You give the agent a neighborhood. It browses Zillow to pull recent listings with interior photos, navigates to Google Street View to capture exterior shots of each property, and analyzes each home's existing aesthetic. Then it takes the actual interior photos and uses them as seed images for image generation to produce redesigned rooms that match each home's specific style. It feeds those redesigned stills into video generation as first-frame images to produce walkthrough videos of the reimagined spaces. And it compiles everything into a publishable webpage with an embedded interactive map of nearby amenities — coffee shops, restaurants, parks.
>
> The agent didn't just use six tools sequentially. It chained them creatively — each output becoming the input to the next — and produced a finished deliverable. That's what separates a demo from real work.

For RE agents specifically: personalized property showcase pages, neighborhood guide microsites, client pitch decks as interactive web experiences, open house landing pages with embedded maps and photo galleries.

### Architecture

```
Agent receives request (e.g., "make a showcase page for the 42 Noriega listing")
    → Agent gathers inputs (photos, property data, neighborhood info via search/browser tools)
    → Agent generates HTML/CSS/JS artifact using frontend-design skill
    → Artifact saved to client workspace filesystem
    → Published via Supabase Storage signed URLs (v1) or R2 + Workers (v1.5)
    → Agent returns shareable URL to user via WhatsApp
```

### Frontend Design Skill (System Prompt)

The agent uses a specialized skill for artifact generation that enforces high design quality and avoids generic AI aesthetics:

**Core principles:**
- **Bold aesthetic direction** — every artifact commits to a clear visual identity (editorial/magazine, luxury/refined, brutalist, organic, etc.) rather than defaulting to generic templates
- **Distinctive typography** — no Inter, Roboto, or Arial; characterful font pairings that elevate the design
- **Intentional color** — dominant colors with sharp accents, not timid evenly-distributed palettes
- **Motion and polish** — scroll-triggered reveals, hover states, micro-interactions via CSS animations
- **Spatial composition** — asymmetry, overlap, generous negative space, grid-breaking elements
- **Atmosphere** — gradient meshes, noise textures, layered transparencies, dramatic shadows; never flat white backgrounds

**What it produces:** Self-contained HTML files with embedded CSS/JS. Production-grade, functional, visually striking. Each one different — the skill explicitly avoids converging on common patterns across generations.

### Use Cases for RE (v1)

| Use Case | What the Agent Builds | Tools Chained |
|----------|----------------------|---------------|
| **Property Showcase** | Single-listing page with hero photos, room descriptions, neighborhood map, agent CTA | Browser (photo scraping) → Image gen (room staging) → Frontend skill → Publish |
| **Neighborhood Guide** | Interactive microsite with amenity map, walkability scores, school ratings, recent sales | Search → Browser → Map embed → Frontend skill → Publish |
| **Open House Landing Page** | RSVP page with property gallery, floor plan, directions, scheduling link | CRM data → Cal.com availability → Frontend skill → Publish |
| **Client Pitch Page** | Personalized "why work with me" page for a specific prospect with relevant sold listings | CRM data → Search (comps) → Frontend skill → Publish |
| **Market Report Web Version** | Interactive version of weekly market report with charts and drill-downs | Doc generation data → Frontend skill → Publish |

### What Makes This Different from Just "Generating HTML"

1. **Tool chaining** — the artifact is the final step of a multi-tool pipeline. Each output feeds the next.
2. **Design quality** — the skill enforces a high bar. No cookie-cutter templates. Each artifact has a distinct aesthetic matched to context.
3. **Publishable by default** — not a file dump. A URL the user shares immediately.
4. **Personalized per-recipient** — each artifact is generated for a specific client, property, or prospect. Not a template with merge fields.

### Hosting and Publishing

**v1 (simplest):**
- Static HTML files served via Supabase Storage signed URLs
- URL pattern: `https://{client-id}.sunder.app/artifacts/{artifact-slug}`
- No build step required — single-file HTML with embedded CSS/JS

**v1.5 (if needed):**
- Deploy to Cloudflare R2 + Workers for CDN-backed hosting
- Custom domain support per client

**Alternative: here.now (free hosting)**
- Free static hosting alternative to surge.sh — https://here.now/
- Good fit for artifact publishing: single-file HTML deploys with zero config
- Evaluate when sandbox/website-building features are added

### Cost Estimate

| Component | Cost | Notes |
|-----------|------|-------|
| Artifact generation (LLM) | ~$0.03–0.10/artifact | Sonnet for code generation, similar to doc gen |
| Image generation (if used) | ~$0.02–0.05/image | Depends on provider (Nano Banana, DALL-E, etc.) |
| Hosting | ~$0/mo | Supabase Storage signed URLs or R2 free tier |
| **Total per artifact** | **~$0.05–0.20** | Negligible at MVP volume |

### Implementation Checklist

- [ ] Frontend-design skill definition (SKILL.md with full system prompt) — ~2 hours
- [ ] Artifact storage path and naming convention in workspace — ~30 min
- [ ] Supabase Storage upload + signed URL generation route — ~1 hour
- [ ] Agent tool: `publish_artifact(html, slug, metadata)` — ~1 hour
- [ ] End-to-end test: request → generate → publish → share URL — ~1 hour
- **Total: ~6 hours**

**Recommendation:** Add as Build 10. Builds on document generation (Build 9) and browser automation. The "wow factor" feature for demos and sales.

### Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Include image/video generation in v1? | **Start with static** — photo + text artifacts first. Image gen (Nano Banana, etc.) and video gen (Veo 3) are Phase 2 enhancements. |
| 2 | Custom domains per client? | **Phase 2** — `{client-id}.sunder.app` subdomains sufficient for v1. |
| 3 | Artifact expiration? | **No expiration in v1** — monitor storage. Add TTL later if needed. |
| 4 | Edit after publish? | **Regenerate** — agent creates a new version at same URL. No visual editor. |
| 5 | Listing video generation approach? | **Phase 2 candidate** — Calico AI workflow (see reference below). Sub-$10/video vs $1K–$5K traditional production. |

#### Reference: AI Listing Video Pipeline (Calico AI)

Source: https://heycalico.ai/ · Demo: https://www.youtube.com/watch?v=Ob4MFma5x34

A proven workflow for generating luxury real estate listing videos from static photos at ~$10/video:

1. **Image selection** — Pull the 6 best images from any property listing (e.g. PropertyGuru/99.co for SG market)
2. **Image animation** — Calico AI animates each image with cinematic motion (dolly shots, pans, luxury styling)
3. **Voiceover script** — LLM analyzes the listing and writes a polished 30-second narration script
4. **Audio generation** — ElevenLabs generates AI narration + custom music track
5. **Assembly** — CapCut (or equivalent) assembles final video with captions

**Why this matters for Sunder:** Static listing photos are table stakes. Buyers want walkthrough-feel video before booking showings. This pipeline could be automated as an agent service — user provides a listing URL, agent produces a shareable video. Fits the "finished deliverables" pattern of the artifact generation system above.

**Phase 2 integration path:** Agent tool `generate_listing_video(listing_url)` → orchestrates the pipeline → publishes to artifact URL. Depends on artifact publishing infra (Build 10) being in place first.

---

## 14. Diagramming — Excalidraw MCP (Sunder Central Account)

### Architecture

```
Sunder connects to Excalidraw MCP server (remote or self-hosted)
    → Agent generates hand-drawn style diagrams via MCP tool calls
    → Diagrams rendered as interactive Excalidraw files or exported as images
    → Published to artifact URLs or embedded in chat responses
```

### Source

- **GitHub:** https://github.com/excalidraw/excalidraw-mcp
- **Remote endpoint:** `https://mcp.excalidraw.com`
- **License:** MIT
- **Self-hosted option:** Deploy on Vercel (one-click)

### Why This Works

- **MCP-native** — plugs directly into our agent's tool system via `create_new_connections` (custom MCP type)
- **Hand-drawn aesthetic** — feels personal and approachable, not corporate. Fits the agent-to-user communication style.
- **Remote or self-hosted** — connect to `mcp.excalidraw.com` for zero-ops, or self-host on Vercel for full control
- **Cost to Sunder: $0** — open-source (MIT), remote endpoint is free
- **Interactive editing** — users can open and edit generated diagrams in fullscreen

### What the Agent Does With Diagrams

| Use Case | Product Feature | Example |
|----------|----------------|---------|
| **Transaction timeline** | Transaction Coordinator (#17) | Visual timeline: OTP signed → exercise deadline → completion date → key collection |
| **Property comparison** | Client Matchmaker (#29) | Side-by-side comparison chart: Unit A vs Unit B (price, PSF, size, floor, facing) |
| **Process flow** | Onboarding, any workflow | "Here's how the buying process works" — visual walkthrough for first-time buyers |
| **Pipeline visualization** | CRM / Morning Briefing | Visual snapshot of active deals by stage |
| **Area map / neighborhood** | Neighborhood Expert (#27) | Annotated area diagram showing amenities, MRT, schools relative to property |
| **Commission breakdown** | Commission Tracker (#18) | Visual split diagram: gross commission → co-broke → agency cut → agent net |

### User Experience

```
User: "Show Sarah a visual breakdown of the buying timeline for her Noriega deal"

Agent:
  → Generates Excalidraw diagram via MCP:
    OTP Signed (Feb 10) → Exercise Deadline (Feb 24) → Completion (May 10)
    └── Checklist items branching off each milestone
  → Publishes to artifact URL or sends as image in chat
  → "Here's the transaction timeline for Sarah's deal at 42 Noriega.
     Exercise deadline is in 14 days (Feb 24). Want me to send this to Sarah?"
```

### Integration with Artifact Publishing (§13)

Excalidraw diagrams complement HTML artifacts. The agent can:
1. Generate a diagram (Excalidraw MCP) → embed in an HTML artifact (§13) → publish to client-facing URL
2. Generate standalone diagrams for internal briefings and CRM notes
3. Export diagrams as PNG/SVG for WhatsApp delivery

### Deployment Options

| Option | Pros | Cons | Recommended |
|--------|------|------|-------------|
| **Remote** (`mcp.excalidraw.com`) | Zero ops, instant setup | Dependency on third-party uptime | **MVP** |
| **Self-hosted** (Vercel) | Full control, no external dependency | Minor setup/maintenance | Phase 2+ |

### Cost

$0 at any scale. Open-source, no per-use charges. Self-hosting on Vercel fits within free tier for expected volume.

---

## Cost Summary

**Updated:** February 18, 2026

> **Important (Feb 23, 2026):** Treat this section as legacy directional guidance only.  
> Active unit economics source of truth is `services/02-Unit Economics Model ($20 Target vs Actual).md` plus its CSV model files.

### MVP (0-10 clients) - Phase 1

| Service | Cost | Notes |
|---------|------|-------|
| CRM | $0 | Supabase free tier |
| Knowledge Base | $0 | Filesystem storage |
| Cal.com | $0 | User's own free accounts |
| Tally.so | $0 | User's own free accounts |
| Transcription (Whisper) | ~$0.20/mo | $0.006/min, negligible at MVP scale |
| Voice Cloning (Inworld) | ~$2/mo | ~1,000 voice notes × 200 chars, Max model |
| Document Extraction | ~$0/mo | Gemini structured output, free with classification |
| Document Generation | ~$0/mo | Quick exports free, AI reports negligible at MVP |
| **Total** | **~$2–5/mo** | |

### Phase 2 (Social Media)

| Service | Cost | Notes |
|---------|------|-------|
| All Phase 1 services | $27/mo | Supabase Pro tier at scale |
| Postiz | TBD | Research pending |
| **Total** | **~$27-50/mo** | (+ Postiz costs TBD) |

### Phase 3 (10-50 clients) - Full Stack

| Service | Cost | Notes |
|---------|------|-------|
| CRM | $25/mo | Supabase Pro |
| Knowledge Base | $0 | Filesystem |
| Cal.com | $0 | User's own free accounts |
| Tally.so | $0 | User's own free accounts |
| Transcription (Whisper) | ~$2/mo | ~$0.006/min, scales linearly |
| Voice Cloning (Inworld) | ~$20/mo | ~10,000 notes × 200 chars, Max model |
| Postiz | TBD | Research pending |
| Resend | $90/mo | Scale plan |
| Short.io | $0 | User's own free accounts |
| DocuSeal | $70/mo | Pro + per-doc |
| Document Extraction | ~$75/mo | ~5,000 docs, 80% Gemini + 20% ExtendAI |
| Document Generation | ~$15/mo | ~250 AI reports @ $0.05 + storage |
| **Total** | **~$297/mo** | (+ Postiz costs TBD) |

### Per-Client Cost at Scale

At 100 clients: ~$297/mo total = **$2.97/client/month** for the entire built-in services layer.

Product charges $149/mo per client. Infrastructure cost is ~2% of revenue.

**Key Changes:**
- MVP now focused on core product value (CRM, Knowledge, Scheduling, Forms)
- Transcription decided: OpenAI Whisper API (Sunder central account, ~$0/mo at MVP)
- Voice Cloning added: Inworld AI (Sunder central account, #1 quality, ~$2/mo at MVP)
- Document Extraction added: Gemini 2.5 Flash + ExtendAI pipeline (reused from Sunder, ~$0/mo at MVP)
- Document Generation added: Custom MCP ported from Sunder (Excel reports + AI analysis, ~$0/mo at MVP)
- Email (Resend) deferred to Phase 3 - can use WhatsApp for MVP notifications
- Social media (Postiz) is Phase 2 priority
- Link tracking and document signing are Phase 3 enhancements

---

## Implementation Priority

**Updated:** February 16, 2026

```
Phase 1 (MVP):
  ☐ CRM foundation (Supabase + UI)          — core product, build first
  ☐ Knowledge Base (filesystem + UI)        — Document Vault, RAG, product knowledge
  ☐ Cal.com via Composio                    — scheduling, viewing bookings
  ☐ Tally.so forms via Composio             — Open House Manager, lead capture, feedback
  ☐ Voice Input: Whisper (§8.1)             — user sends voice → Neo transcribes + responds
  ☐ Voice Input: Granola MCP (§8.2)        — meeting transcripts → Neo (user installs Granola free)
  ☐ Voice Output: Inworld AI (§9)          — user types → voice note to client (cloned voice)
                                             — Neo replies to user as voice (Neo fixed voice)
  ☐ Document Extraction (§11)              — classify, split, extract from forwarded docs (Build 7-8)
  ☐ Document Generation MCP (§12)          — Excel reports from extracted data (Build 9)
  ☐ Excalidraw MCP (§14)                   — visual diagrams, timelines, comparisons (remote MCP, zero setup)

Phase 2:
  ☐ Postiz social media                     — Social Butler (#10), Content Factory (#8)

Phase 3:
  ☐ Resend                                  — email notifications + sequences
  ☐ Short.io link attribution               — campaign tracking, referral links
  ☐ DocuSeal document signing               — transaction automation
  ☐ Google Calendar/Gmail (via Composio)    — if needed for integrations
```

---

## Composio: The Auth Layer

Composio is the universal auth adapter. Any tool the user needs to connect goes through Composio.

### Currently Using

| Integration | Composio Tools | Auth Type |
|-------------|---------------|-----------|
| Cal.com | 141 actions | API Key |
| Tally.so | 16 actions | API Key |
| Short.io | 18 actions | API Key |
| Google Calendar | Read/write events | OAuth |
| Gmail | Read-only (MVP), send (v2) | OAuth |

### Future Expansion

| Integration | When | Why |
|-------------|------|-----|
| Google Contacts | v1.5 | Import existing contacts into CRM |
| Stripe | v2 | Commission tracking, payment collection |
| Meta Ads | v3 | Ad Pilot (#9) |
| Instagram | v2 | Social Butler (#10) DM automation |

> **Ad Lead Automation Note (Feb 2026):**
> Two ad lead flows, very different complexity:
> - **Click-to-WhatsApp (CTWA) ads** → lead opens WhatsApp directly → WhatsApp Cloud API webhook receives it like any normal message → agent responds automatically. Meta includes a `referral` object in the webhook payload (ad ID, campaign name) — use this to tag the lead's CRM source and personalize the opener. **Push agents toward CTWA.**
> - **Meta Lead Ads** (form fills inside FB/IG) → leads land in Meta Lead Center → need outbound WhatsApp to reach them. Requires Meta Lead Gen webhook → Sunder backend → CRM → agent sends first message. Composio Meta Ads toolkit handles this at v3.
> - **Postiz is not relevant here** — it's a content scheduler (Social Butler), not a lead responder.

Composio's abstraction means we can add any integration without building OAuth flows. The agent gets new tools instantly.

> **Alternatives to Composio (noted 2026-03-12):**
> - **WorkOS** — https://workos.com/ — enterprise-grade auth and integrations
> - **Paragon** — https://www.useparagon.com/pricing — embedded integration platform
> Evaluate if Composio pricing, reliability, or coverage becomes a bottleneck.

---

## E2E Setup Guide: Composio Integration Implementation

**Status:** Implementation guide for Cal.com and Tally via Composio
**Updated:** February 16, 2026

This section provides the complete end-to-end implementation for integrating user-authenticated services (Cal.com, Tally) using Composio.

### Overview: Three Implementation Phases

1. **Your Setup** (One-time, ~15 minutes) - Developer configuration
2. **User Connects Account** (Per user, ~2 minutes) - OAuth flow
3. **Using the Integration** (Ongoing) - Making API calls

---

### Phase 1: Initial Developer Setup

#### Step 1: Create Composio Account & Get API Key

```bash
# 1. Visit Composio Dashboard
https://platform.composio.dev/

# 2. Sign up with email or GitHub

# 3. Navigate to: Settings → API Keys
# 4. Click "Create API Key"
# 5. Copy the key (starts with "composio_...")

# 6. Add to your environment
# .env
COMPOSIO_API_KEY=composio_xxxxxxxxxxxxxxxxxx
APP_URL=http://localhost:3000  # Your app URL for callbacks
```

#### Step 2: Install SDK

```bash
# In your RE AI CRM backend project
npm install composio-core

# Or if using Python for certain components
pip install composio-core
```

#### Step 3: Set Up Backend Routes

Create three essential endpoints:

**3.1: Connection Initiation Endpoint**

```typescript
// File: src/app/api/integrations/connect/route.ts
// POST /api/integrations/connect

import { Composio } from 'composio-core';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, platform } = await request.json();
    // userId = your internal user ID (e.g., "user_abc123")
    // platform = "calcom" or "tally"

    const composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY!
    });

    // Initiate connection with Composio-managed credentials
    const connectionRequest = await composio.connectedAccounts.initiate(
      userId,
      platform, // Uses Composio's default OAuth credentials
      {
        callbackUrl: `${process.env.APP_URL}/api/integrations/callback`
      }
    );

    // Return redirect URL to frontend
    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      connectionRequestId: connectionRequest.id
    });

  } catch (error) {
    console.error('Connection initiation failed:', error);
    return NextResponse.json(
      { error: 'Failed to initiate connection' },
      { status: 500 }
    );
  }
}
```

**3.2: OAuth Callback Handler**

```typescript
// File: src/app/api/integrations/callback/route.ts
// GET /api/integrations/callback

import { Composio } from 'composio-core';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Your database client

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const connectionRequestId = searchParams.get('connection_request_id');
    const status = searchParams.get('status');

    if (status === 'success' && connectionRequestId) {
      const composio = new Composio({
        apiKey: process.env.COMPOSIO_API_KEY!
      });

      // Wait for connection to be established
      const connectedAccount = await composio.connectedAccounts
        .waitForConnection(connectionRequestId);

      console.log('✅ Connected:', {
        accountId: connectedAccount.id,
        app: connectedAccount.appName,
        status: connectedAccount.status
      });

      // Store connected account ID in your database
      // Extract userId from connection request or session
      const userId = 'user_abc123'; // Get from your session/auth

      await db.userIntegrations.upsert({
        where: {
          userId_platform: {
            userId: userId,
            platform: connectedAccount.appName
          }
        },
        create: {
          userId: userId,
          platform: connectedAccount.appName,
          connectedAccountId: connectedAccount.id,
          status: 'active',
          connectedAt: new Date()
        },
        update: {
          connectedAccountId: connectedAccount.id,
          status: 'active',
          lastUsedAt: new Date()
        }
      });

      // Redirect user to success page
      return NextResponse.redirect(
        `${process.env.APP_URL}/dashboard/integrations?connected=true&app=${connectedAccount.appName}`
      );
    }

    // Handle failure
    return NextResponse.redirect(
      `${process.env.APP_URL}/dashboard/integrations?error=connection_failed`
    );

  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(
      `${process.env.APP_URL}/dashboard/integrations?error=callback_error`
    );
  }
}
```

**3.3: Action Execution Endpoint**

```typescript
// File: src/app/api/integrations/execute/route.ts
// POST /api/integrations/execute

import { Composio } from 'composio-core';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, action, params } = await request.json();
    // action = "CALCOM_GET_BOOKINGS" or "TALLY_LIST_FORMS"

    const composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY!
    });

    // Execute the action
    // Composio automatically:
    // 1. Looks up connected account for userId
    // 2. Retrieves stored access_token
    // 3. Checks if token is expired
    // 4. Refreshes token if needed
    // 5. Makes API call
    const result = await composio.tools.execute(action, {
      userId: userId,
      params: params
    });

    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    console.error('Action execution failed:', error);
    return NextResponse.json(
      { error: 'Failed to execute action' },
      { status: 500 }
    );
  }
}
```

#### Step 4: Create Frontend UI

**Integrations Connection Page**

```typescript
// File: app/dashboard/integrations/page.tsx

'use client';

import { useState } from 'react';

export default function IntegrationsPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const connectIntegration = async (platform: 'calcom' | 'tally') => {
    setLoading(platform);

    try {
      // Call your backend
      const response = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_abc123', // Get from your auth session
          platform: platform
        })
      });

      const { redirectUrl } = await response.json();

      // Redirect user to Composio Connect page
      window.location.href = redirectUrl;

    } catch (error) {
      console.error('Connection failed:', error);
      setLoading(null);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Connect Your Apps</h1>

      <div className="grid gap-4">
        {/* Cal.com Integration */}
        <div className="border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">📅 Cal.com</h3>
              <p className="text-sm text-gray-600">
                Manage your calendar and bookings
              </p>
            </div>
            <button
              onClick={() => connectIntegration('calcom')}
              disabled={loading === 'calcom'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {loading === 'calcom' ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Tally Integration */}
        <div className="border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">📝 Tally</h3>
              <p className="text-sm text-gray-600">
                Access your forms and submissions
              </p>
            </div>
            <button
              onClick={() => connectIntegration('tally')}
              disabled={loading === 'tally'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {loading === 'tally' ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Step 5: Database Schema

```sql
-- Add integration tracking to your database

CREATE TABLE user_integrations (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'calcom', 'tally', etc.
  connected_account_id TEXT NOT NULL, -- From Composio
  status TEXT NOT NULL, -- 'active', 'expired', 'revoked'
  connected_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  metadata JSONB DEFAULT '{}', -- Store additional info
  UNIQUE(user_id, platform)
);

-- Index for fast lookups
CREATE INDEX idx_user_integrations_user ON user_integrations(user_id);
CREATE INDEX idx_user_integrations_platform ON user_integrations(platform);
```

---

### Phase 2: User Connection Flow

This is what happens when a user connects their Cal.com or Tally account:

#### The Complete User Journey

**Step 1: User Clicks "Connect"**

```
User on your integrations page → Clicks "Connect Cal.com"
    ↓
Frontend sends: POST /api/integrations/connect
    {
      userId: "user_abc123",
      platform: "calcom"
    }
```

**Step 2: Backend Creates Connection Request**

```
Your Backend
    ↓
composio.connectedAccounts.initiate('user_abc123', 'calcom', {...})
    ↓
Composio API creates connection request
    ↓
Returns: {
  redirectUrl: "https://connect.composio.dev/link/ln_abc123xyz",
  id: "conn_req_123"
}
    ↓
Frontend receives redirectUrl
    ↓
window.location.href = redirectUrl
```

**Step 3: User on Composio Connect Page**

```
URL: https://connect.composio.dev/link/ln_abc123xyz

User sees:
┌─────────────────────────────────────┐
│  🔗 Connect to Cal.com              │
│                                     │
│  RE AI CRM wants to access          │
│  your Cal.com account               │
│                                     │
│  This will allow:                   │
│  ✓ View your bookings              │
│  ✓ Create new events               │
│  ✓ Manage your availability        │
│                                     │
│  [ Continue with Cal.com ]          │
│                                     │
│  Powered by Composio                │
└─────────────────────────────────────┘

User clicks "Continue with Cal.com"
```

**Step 4: Redirected to Cal.com (or Tally)**

```
URL: https://app.cal.com/auth/oauth2/authorize?client_id=...

Option A - User HAS Cal.com account:
┌─────────────────────────────────────┐
│  📅 Cal.com                         │
│  Sign in to authorize               │
│  Email: [________________]          │
│  Password: [____________]           │
│  [ Sign in ]                        │
└─────────────────────────────────────┘

Option B - User DOES NOT have account:
┌─────────────────────────────────────┐
│  📅 Cal.com                         │
│  Create your account                │
│  Name: [________________]           │
│  Email: [________________]          │
│  Password: [____________]           │
│  [ Sign up with Google ]            │
│  [ Create Account ]                 │
└─────────────────────────────────────┘

User creates account → proceeds to authorization
```

**Step 5: User Authorizes**

```
┌─────────────────────────────────────┐
│  📅 Cal.com                         │
│  RE AI CRM wants to:                │
│  ✓ View calendar availability       │
│  ✓ Create bookings                  │
│  ✓ Manage event types               │
│                                     │
│  [ Deny ]        [ Allow ]          │
└─────────────────────────────────────┘

User clicks "Allow"
    ↓
Cal.com redirects to Composio with auth code
```

**Step 6: Composio Token Exchange (Behind the Scenes)**

```
Cal.com → https://connect.composio.dev/callback?code=cal_auth_xyz

Composio automatically:
1. Exchanges auth code for access_token + refresh_token
2. Stores tokens securely (encrypted)
3. Creates connected_account record
4. Redirects to your callback URL
```

**Step 7: Back to Your App**

```
Composio → https://yourdomain.com/api/integrations/callback
           ?connection_request_id=conn_req_123
           &status=success

Your backend:
1. composio.connectedAccounts.waitForConnection(conn_req_123)
2. Gets connectedAccount object
3. Saves connectedAccount.id to database
4. Redirects user to success page
```

**Step 8: Success**

```
┌─────────────────────────────────────┐
│  ✅ Cal.com Connected!              │
│  Your account is ready              │
│  [ Back to Dashboard ]              │
└─────────────────────────────────────┘
```

---

### Phase 3: Using Connected Accounts

Once connected, here's how to make API calls:

#### Example: Get User's Cal.com Bookings

**Frontend Request:**

```typescript
// User action triggers API call
const response = await fetch('/api/integrations/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_abc123',
    action: 'CALCOM_GET_BOOKINGS',
    params: {
      startDate: '2026-02-01',
      endDate: '2026-02-28'
    }
  })
});

const { data } = await response.json();
console.log('Bookings:', data);
```

**Backend Execution:**

```typescript
// Your backend automatically handles auth
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY
});

// Composio handles everything:
// 1. Looks up connected account for userId
// 2. Retrieves stored access_token
// 3. Checks if token expired
// 4. Refreshes token if needed
// 5. Makes API call to Cal.com
// 6. Returns result

const result = await composio.tools.execute('CALCOM_GET_BOOKINGS', {
  userId: 'user_abc123',
  params: {
    startDate: '2026-02-01',
    endDate: '2026-02-28'
  }
});

return result; // Bookings data
```

#### Example: List User's Tally Forms

```typescript
// Get available Tally tools
const tallyTools = await composio.tools.get({
  apps: ['tally'],
  userId: 'user_abc123'
});

// Execute action
const forms = await composio.tools.execute('TALLY_LIST_FORMS', {
  userId: 'user_abc123',
  params: {} // Tool-specific parameters
});

console.log('User's Tally forms:', forms);
```

#### Token Refresh (Automatic)

**You never handle token refresh** - Composio does it automatically:

```
Your code: composio.tools.execute(...)
    ↓
Composio checks: Is access_token expired?
    ↓
If YES:
    - Uses refresh_token to get new access_token
    - Updates stored tokens
    - Continues with API call
    ↓
If NO:
    - Uses existing access_token
    ↓
Makes API call to Cal.com/Tally
    ↓
Returns result to your code
```

---

### Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────┐
│ PHASE 1: Your Setup (One-time)                          │
├──────────────────────────────────────────────────────────┤
│ 1. Create Composio account                              │
│ 2. Get API key → Add to .env                            │
│ 3. Install composio-core SDK                            │
│ 4. Create backend routes:                               │
│    - POST /api/integrations/connect                     │
│    - GET /api/integrations/callback                     │
│    - POST /api/integrations/execute                     │
│ 5. Create frontend UI (integrations page)               │
│ 6. Set up database schema (user_integrations table)     │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ PHASE 2: User Connects (Per user, per integration)      │
├──────────────────────────────────────────────────────────┤
│ 1. User clicks "Connect Cal.com"                        │
│ 2. Frontend → POST /api/integrations/connect            │
│ 3. Backend → composio.initiate(userId, platform)        │
│ 4. Backend returns redirectUrl                          │
│ 5. User → Redirected to connect.composio.dev            │
│ 6. User → Clicks "Continue with Cal.com"                │
│ 7. User → Redirected to app.cal.com OAuth page          │
│ 8. User → Signs in (or creates account if needed)       │
│ 9. User → Clicks "Allow" on authorization page          │
│ 10. Cal.com → Redirects to Composio with auth code      │
│ 11. Composio → Exchanges code for tokens                │
│ 12. Composio → Stores tokens (encrypted)                │
│ 13. Composio → Redirects to your callback URL           │
│ 14. Your backend → Saves connected_account_id to DB     │
│ 15. User → Sees success page                            │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ PHASE 3: Using Integration (Ongoing)                    │
├──────────────────────────────────────────────────────────┤
│ 1. User action triggers need for data                   │
│ 2. Frontend → POST /api/integrations/execute            │
│ 3. Backend → composio.tools.execute(action, params)     │
│ 4. Composio → Handles auth, refresh, API call           │
│ 5. Backend → Returns data to frontend                   │
│ 6. Frontend → Displays data to user                     │
│ → Repeat as needed                                       │
└──────────────────────────────────────────────────────────┘
```

---

### Key Implementation Notes

#### 1. Composio-Managed vs Custom Credentials

**For MVP: Use Composio-Managed (Recommended)**

```typescript
// No setup required - works immediately
const connectionRequest = await composio.connectedAccounts.initiate(
  'user_123',
  'calcom', // Composio provides OAuth credentials
  { callbackUrl: '...' }
);
```

**Pros:**
- ✅ Zero setup time
- ✅ Start testing immediately
- ✅ No OAuth app approval wait

**Cons:**
- ⚠️ Says "Composio wants to access..."
- ⚠️ Composio branding

**For Production: Bring Your Own OAuth Apps (Optional)**

When ready for white-labeling:

```typescript
// 1. Create OAuth apps on Cal.com/Tally platforms
// 2. Create custom auth config in Composio

const authConfig = await composio.authConfigs.create("CALCOM", {
  name: "RE AI CRM - Cal.com",
  type: "use_custom_auth",
  authScheme: "OAUTH2",
  credentials: {
    client_id: process.env.CALCOM_CLIENT_ID,
    client_secret: process.env.CALCOM_CLIENT_SECRET,
    oauth_redirect_uri: "https://backend.composio.dev/api/v3/toolkits/auth/callback"
  }
});

// 3. Use custom config
const connectionRequest = await composio.connectedAccounts.initiate(
  'user_123',
  authConfig.id, // Your custom config
  { callbackUrl: '...' }
);
```

#### 2. Error Handling

```typescript
// Frontend: Connection initiation
try {
  const response = await fetch('/api/integrations/connect', {...});
  if (!response.ok) throw new Error('Connection failed');

  const { redirectUrl } = await response.json();
  window.location.href = redirectUrl;

} catch (error) {
  // Show error to user
  toast.error('Failed to connect. Please try again.');
}

// Backend: Callback handler
try {
  const connectedAccount = await composio.connectedAccounts
    .waitForConnection(connectionRequestId);

  // Success - save to DB
  await saveToDatabase(connectedAccount);

} catch (error) {
  console.error('Connection failed:', error);

  // Redirect to error page
  return redirect('/integrations?error=connection_failed');
}
```

#### 3. Testing the Flow

```bash
# 1. Start your dev server
npm run dev

# 2. Navigate to integrations page
http://localhost:3000/dashboard/integrations

# 3. Click "Connect Cal.com"
# 4. You'll be redirected through:
#    - Composio Connect page
#    - Cal.com OAuth page
#    - Back to your callback
#    - Success page

# 5. Check database
# Verify connected_account_id was saved

# 6. Test API call
# Make a request to /api/integrations/execute
```

---

### Timeline & Checklist

#### Time Estimates

| Task | Duration |
|------|----------|
| Initial Composio setup | 5 minutes |
| Backend routes implementation | 15 minutes |
| Frontend UI creation | 10 minutes |
| Database schema setup | 5 minutes |
| **Total developer setup** | **~35 minutes** |
| User connection flow (per user) | 2-3 minutes |
| First API call implementation | 5 minutes |

#### Pre-Launch Checklist

**Before Launch:**
- [ ] Composio account created
- [ ] API key obtained and added to .env
- [ ] SDK installed (`composio-core`)
- [ ] Backend routes implemented and tested
- [ ] Frontend UI built
- [ ] Database schema created
- [ ] Callback URL configured in environment
- [ ] Test connection flow end-to-end
- [ ] Test token refresh behavior
- [ ] Error handling implemented

**Per Integration:**
- [ ] Test with real user account
- [ ] Verify tokens stored correctly
- [ ] Test API calls work
- [ ] Test error cases (denied auth, expired tokens)
- [ ] Add disconnect functionality (optional)

---

### Common Pitfalls & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Callback not working | Wrong callback URL | Ensure `APP_URL` env var is correct |
| Connection fails silently | No error handling | Add try/catch blocks |
| Token not found | userId mismatch | Use consistent userId across all calls |
| API calls fail | Token expired | Composio handles this - check logs |
| User sees error after auth | Callback route broken | Check callback route logs |
| Connected account not saved | Database error | Check DB schema and permissions |

---

### Next Steps

**Immediate (MVP) - Priority Order:**
1. **CRM foundation** - Build core Supabase schema + basic UI
2. **Knowledge Base** - Filesystem structure + metadata index + RAG setup
3. **Cal.com integration**
   - Implement connection flow via Composio
   - Test with real Cal.com account
   - Implement booking management (get/create/cancel)
   - Add to onboarding flow
4. **Tally integration**
   - Implement connection flow via Composio
   - Test form creation via API
   - Set up webhook integration
   - Build Open House sign-in form template
5. **Transcription service** - Need to discuss: service selection, integration approach

**Phase 2:**
1. Postiz social media integration
   - Research Postiz Composio support
   - Implement connection flow
   - Build post scheduling + analytics

**Phase 3:**
1. Resend email (notifications + sequences)
2. Short.io link tracking (campaign attribution)
3. DocuSeal document signing (transaction automation)

**Production Readiness (Ongoing):**
1. Consider creating custom OAuth apps (white-label)
2. Add connection health monitoring
3. Implement token refresh error handling
4. Add disconnect/reconnect functionality

---

## Edge Cases & Known Gotchas

### Why Build CRM + Docs but Integrate Scheduling

Scheduling complexity is **algorithmic** (timezone intersection, recurrence rules, CalDAV sync, multi-party availability) — you can't simplify it, the edge cases ARE the product. CRM and docs complexity lives in **business logic** (which the AI agent handles) and **data storage** (which Supabase handles). Agent-operated CRM with read-mostly UI is a fundamentally different problem class than a scheduling engine.

### CRM: Contact Deduplication

The #1 CRM rabbit hole. Leads arrive from WhatsApp, open house forms, manual entry, referrals — duplicates are inevitable.

**Strategy:** Phone number as canonical key.
- Normalize all phone numbers on ingestion (strip spaces, add country code, E.164 format)
- On new contact creation, check for existing match by phone → merge if found
- Secondary dedup on email (exact match)
- Fuzzy name matching is a Phase 2 nice-to-have, not MVP

**Risk if ignored:** User sees 3 "Sarah Lee" entries from 3 different channels, loses trust in the system.

### CRM: Data Import on Signup

Users will want to bring existing contacts (CSV from Excel, export from PropertyGuru CRM, etc.).

**MVP approach:** Simple CSV import with:
- Column auto-detection (name, phone, email by header matching)
- Phone normalization + dedup against existing contacts
- Preview step before committing
- Skip/merge on duplicates

**Don't over-engineer:** No need for Zapier-style field mapping UI. Agent can help users clean messy CSVs conversationally.

### CRM: Custom Fields Creep

JSONB `contact_fields` approach is correct, but RE agents across different markets want wildly different fields (Singapore: HDB eligibility, property type preferences; US: pre-approval status, school district preferences).

**Mitigation:** Ship sensible defaults per vertical. Let agent add custom fields conversationally ("Track their budget range? I'll add that field."). Don't build a field configuration UI at MVP.

### Document Vault: File Durability

**Risk:** File durability depends on Supabase Storage availability. Supabase Storage is S3-backed and durable by default.

**Mitigation plan:**
- Background sync to Supabase Storage (or Cloudflare R2) as backup — filesystem stays the hot path for agent reads/writes, object storage is the durable copy
- Sync job runs on file create/update, writes to `{client_id}/{file_path}` in object storage
- Recovery: if container is rebuilt, pull files from object storage on first boot
- **Cost:** Supabase Storage free tier = 1GB, R2 = 10GB free. Sufficient for MVP.

### Document Vault: File Size Policy

RE involves heavy files — 100-page condo prospectuses, high-res floor plans, property video walkthroughs. WhatsApp media downloads can balloon storage.

**Policy:**
- Max single file: 50MB (covers any PDF/DOCX, most images)
- Video files: compress or link externally (don't store 500MB property tours in vault)
- Monitor per-client storage usage in Supabase metadata
- Alert agent if client approaches storage threshold

---

## Escape Hatches

Every external dependency has a cloud pivot or self-hosted fallback:

| Cloud Service | Pivot Option (Cloud) | Self-Hosted Fallback | Trigger |
|--------------|---------------------|---------------------|---------|
| Cal.com (user's account) | **Calendly** (75+ Composio actions, free tier) | Cal.com self-hosted (OSS) | If free tier removed, reliability issues, or API changes |
| Tally.so (user's account) | Typeform, Google Forms | Formbricks (OSS) | If free tier is removed or API access gated |
| Short.io (user's account) | Bitly, Rebrandly | Shlink (OSS) | If free tier is removed or API access gated |
| Resend | SendGrid, Mailgun | Self-hosted email (SES + custom) | Scale economics |
| DocuSeal Cloud | DocuSign API | DocuSeal On-Prem (OSS) | Privacy requirements |
| Gemini 2.5 Flash (classification + extraction) | GPT-4o, Claude Haiku | Custom classification pipeline | Google API reliability issues |
| ExtendAI (complex extraction) | AWS Textract, Azure Form Recognizer | Custom OCR + structured extraction | Pricing changes, accuracy issues |

**Note:** Composio's abstraction layer makes pivots fast. Calendly migration from Cal.com = ~1 day (swap action names). The architecture never locks into a single provider. Skills call abstract tool interfaces — swap the backend, keep the skill.
