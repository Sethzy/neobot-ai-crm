# Agent Contact Enrichment Plan

> Goal: Get phone number, WhatsApp, email, and photo for every CEA-registered agent (~37K active agents) so we can display richer agent profiles and enable users to reach out directly.

## Current State

Our `cea_agents` table has 6 fields from the data.gov.sg CSV:
- `registration_no`, `salesperson_name`, `registration_start_date`, `registration_end_date`, `estate_agent_name`, `estate_agent_license_no`

**No phone, no email, no photo, no WhatsApp.**

---

## PRIMARY APPROACH: Scrape OpenAgent.sg (FREE, all data)

**Discovery:** OpenAgent.sg exposes phone, WhatsApp, email, and photo for every agent in plain HTML at a predictable URL: `https://openagent.sg/agent/{registrationNo}`

**Confirmed data fields (from DOM snapshot of R043039D):**

| Field | Source | Example |
|---|---|---|
| Phone | `<a href="tel:+6591766109">` | +65 9176 6109 |
| WhatsApp | `<a href="https://wa.me/91766109">` | 91766109 |
| Email | `<a href="mailto:kavinkuah88@hotmail.com">` | kavinkuah88@hotmail.com |
| Photo | `<img alt="KUAH KAI PIN, KAVIN">` with src | CEA headshot |

**Coverage:** OpenAgent uses the same CEA data source as us. Every active agent should have a page. Contact info coverage depends on whether agents have claimed their profiles (the "Claim profile" button is visible for unclaimed profiles).

### Implementation Plan

**Phase 1: Build scraper script** (~1 day)

```
scripts/property-pipeline/src/enrich_agents_openagent.py
```

For each `registration_no` in our `cea_agents` table:
1. Fetch `https://openagent.sg/agent/{registration_no}` (simple HTTP GET — it's server-rendered, not a SPA)
2. Parse HTML with BeautifulSoup/lxml
3. Extract from `<a href="tel:...">`, `<a href="https://wa.me/...">`, `<a href="mailto:...">`, `<img>` src
4. Upsert into `cea_agents` table

**Phase 2: Rate limiting & batching** (~0.5 day)

- Rate limit: 1 request per 1-2 seconds (be respectful)
- 37K agents × 1.5s = ~15.4 hours. Run overnight.
- Chunk into batches of 5K, with resume capability (track last processed reg_no)
- Store raw HTML responses temporarily for debugging

**Phase 3: Schema migration + UI update** (~1 day)

```sql
ALTER TABLE cea_agents
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_source TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contact_updated_at TIMESTAMPTZ;
```

Update agent profile page to show Call, WhatsApp, and Email buttons when data is available.

**Phase 4: Ongoing refresh**

- Run monthly to pick up new agents and updated contact info
- Add to the existing pipeline cron alongside CEA/HDB/URA refreshes

### Why this works

- OpenAgent is a public, community-driven platform (they link to their Telegram community and invite feedback)
- No login wall, no CAPTCHA, no anti-scraping measures visible
- The data is server-rendered HTML (not a client-side SPA like CEA register)
- URL pattern is trivially predictable: `/agent/{CEA_REG_NO}`
- We already have all 37K registration numbers

### Legal considerations

- OpenAgent displays publicly available data derived from CEA Public Register + agent self-claims
- Their Terms of Use should be reviewed before bulk scraping
- The data we extract (phone, email) is contact info that agents have chosen to make public
- Alternative: We could also just link TO OpenAgent's profile as an interim solution (zero scraping)

---

## SECONDARY SOURCES (supplement for agents not on OpenAgent)

---

## Data Sources (Ranked by Effort)

### Option A: Buy SPADB/SPAD Database (~$500 SGD, immediate)

Two commercial databases already aggregate this data:

| Provider | URL | Price | Coverage |
|---|---|---|---|
| **SPADB** | sgpropertyagentdatabase.com | $499 SGD (promo, usual $990) | 36K+ agents |
| **SPAD** | singaporepropertyagentdatabase.com | Unknown (Plus/Premium tiers) | 35K+ agents |

**Fields included:** Name, CEA number, agency, mobile number (WhatsApp-verified), email, join date, seniority ranking.

**Pros:**
- Instant CSV/Excel download — can be loaded into our pipeline in hours
- ~95-98% mobile number coverage, WhatsApp-verified
- Updated weekly (Plus/Premium) or daily
- No scraping needed, no legal risk

**Cons:**
- One-time data purchase, needs periodic re-purchase for updates
- We don't control the data source
- $500 upfront cost

**Verdict:** Best option for immediate coverage. Buy once, load into pipeline, then supplement with our own collection over time.

---

### Option B: Scrape CEA Public Register (photo only)

The CEA register at `eservices.cea.gov.sg` shows a **professional headshot photo** for each agent (confirmed — see Kavin Kuah R043039D profile). It does NOT show phone/email.

**URL pattern:** `https://eservices.cea.gov.sg/aceas/public-register/sales/1/{uuid}/sales`

**What we get:** Agent photo (JPEG/PNG from `<figure><img>` element)

**Implementation:**
1. For each registration number, search the CEA register to get the agent's UUID
2. Navigate to the detail page, extract the `<img>` from the `<figure>` element
3. Download and store in Supabase Storage (`agent-photos/{registration_no}.jpg`)

**Challenges:**
- CEA register is a client-rendered SPA (Angular/React) — need headless browser (Playwright)
- 37K agents × ~3 sec each = ~31 hours. Needs parallelization or batching over days
- No public API — must scrape the web UI
- Rate limiting / IP blocking risk
- CEA Terms of Use may restrict automated scraping

**Verdict:** Doable for photos, but run it as a background enrichment job. Not suitable for phone/email.

---

### Option C: Scrape Agency Portals (phone + email for subset)

Major agencies have their own agent directories with contact info:

| Agency | Agent Directory URL | Phone | Email | Coverage |
|---|---|---|---|---|
| **ERA** | propertyportal.era.com.sg/agent/detail/{regNo} | Yes (office line) | Yes (Cloudflare-protected) | ERA agents only |
| **PropNex** | profile.propnex.com/{regNo} | Likely | Likely | PropNex agents only |
| **OrangeTee** | orangetee.com | Likely | Likely | OrangeTee agents only |
| **Huttons** | huttons.com.sg | Likely | Likely | Huttons agents only |

**Pros:** Free, direct from source, likely accurate
**Cons:**
- Only covers agents at that specific agency
- Each portal has different structure — need custom scrapers per agency
- Cloudflare protection on some (ERA confirmed)
- Phone numbers shown may be office/branch numbers, not personal mobile
- Terms of service restrictions

**Verdict:** Supplementary source. Not practical as primary strategy for 37K agents.

---

### Option D: Scrape Property Portals (phone from listings)

Agents list properties on 99.co, PropertyGuru, SRX — their phone numbers appear on listings.

| Portal | Agent Profile URL | Phone Visible? |
|---|---|---|
| **99.co** | 99.co/singapore/agents/{regNo}-{name} | Partially masked (91xx xxxx) |
| **PropertyGuru** | propertyguru.com.sg/agent/{name}-{id} | Requires interaction/login |
| **SRX** | srx.com.sg/{name} | Varies |

**Pros:** Covers agents across all agencies
**Cons:**
- Phone numbers often masked (need to click "Show number")
- Anti-scraping protections (CAPTCHA, rate limiting)
- Legal grey area — portal ToS explicitly prohibit scraping
- We already have Apify actors for 99.co and PropertyGuru (PR 57) — but for listings, not agent profiles
- Coverage limited to agents with active listings

**Verdict:** Not recommended as primary source. Legal risk, low reliability.

---

### Option E: Agent Self-Registration ("Claim Profile")

Build a feature where agents claim their profile on our platform and provide their own contact info.

**Flow:**
1. Agent finds their profile on neobot.sg/market/agents/{regNo}
2. Clicks "Claim this profile"
3. Verifies identity (CEA number + OTP to their registered phone)
4. Provides: phone, WhatsApp, email, optional photo override
5. Profile shows verified contact info

**Pros:**
- 100% accurate, agent-provided data
- Builds direct relationship with agents (our target users!)
- Legal — agents consent to share their own data
- Creates a funnel to Sunder/NeoBot product signup

**Cons:**
- Cold start problem — no agents will claim profiles initially
- Requires outreach/marketing to drive adoption
- Slow coverage ramp-up

**Verdict:** Essential long-term strategy but can't be the only approach. Combine with Option A for bootstrap data.

---

## Recommended Plan

### Phase 1: Bootstrap (Week 1) — Buy + Load

1. **Purchase SPADB database** ($499 SGD) — instant CSV with ~36K agents' mobile + email
2. **Extend `cea_agents` table** — add columns: `mobile_phone`, `email`, `photo_url`, `whatsapp_number`, `contact_source` (enum: 'spadb' | 'cea_register' | 'self_claimed' | 'manual')
3. **Write enrichment script** — `scripts/property-pipeline/src/enrich_agents_spadb.py` that joins SPADB CSV to our `cea_agents` table on `registration_no` and upserts phone/email
4. **Update agent profile page** — show phone, WhatsApp (link to `wa.me/{number}`), email on the profile page
5. **Total effort:** ~1-2 days

### Phase 2: Photo Enrichment (Week 2) — Scrape CEA Register

1. **Write headless scraper** — `scripts/property-pipeline/src/scrape_cea_photos.py` using Playwright
2. **For each agent:** Search by reg number → click detail → extract photo URL → download → upload to Supabase Storage
3. **Rate limit:** 1 request per 2 seconds, run overnight in batches of 5K agents
4. **Store:** `agent-photos/{registration_no}.jpg` in Supabase Storage, set `photo_url` in `cea_agents`
5. **Update agent profile page** — replace initials avatar with real photo when available
6. **Total effort:** ~2-3 days

### Phase 3: Claim Profile (Week 3-4) — Self-Registration

1. **Add "Claim this profile" CTA** on agent profile pages
2. **Verification flow:** Agent enters reg number + phone → we send OTP → they verify → provide contact details
3. **Store verified contact info** with `contact_source = 'self_claimed'` (highest priority)
4. **Self-claimed data overrides** SPADB data when available
5. **This doubles as an acquisition channel** — every agent who claims their profile is a potential NeoBot customer
6. **Total effort:** ~3-5 days

### Phase 4: Ongoing Refresh

- Re-purchase SPADB quarterly ($499/quarter) or set up own scraping pipeline
- CEA photo scraper runs monthly for new registrations
- Claimed profiles are always fresh (agent-maintained)

---

## Schema Changes

```sql
-- Migration: Add contact enrichment columns to cea_agents
ALTER TABLE cea_agents
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_source TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contact_updated_at TIMESTAMPTZ;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_cea_agents_mobile ON cea_agents (mobile_phone) WHERE mobile_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cea_agents_email ON cea_agents (email) WHERE email IS NOT NULL;
```

---

## Display Priority

When showing contact info on agent profiles, use this priority:
1. **Self-claimed** (agent-verified, most trustworthy)
2. **SPADB data** (commercial database, good coverage)
3. **CEA register** (photos only)
4. **None** — show initials avatar + "Claim this profile" CTA

---

## Legal Considerations

- **SPADB purchase:** Commercial database built from public domain information (CEA Public Register). Standard B2B data purchase — no legal issues.
- **CEA register scraping:** Public government data intended for consumer protection. Low risk, but check CEA Terms of Use. Photos are publicly displayed for identity verification purposes.
- **Portal scraping (99.co, PropertyGuru):** Explicitly prohibited by ToS. **Do not pursue.**
- **Agent self-registration:** Zero legal risk — agent provides their own data with consent.
- **PDPA compliance:** Singapore Personal Data Protection Act requires consent for collection/use of personal data. SPADB data is collected from public sources; self-claimed data has explicit consent. Display a privacy notice on agent profiles explaining data sources.

---

## Cost Summary

| Item | Cost | Frequency |
|---|---|---|
| SPADB database | $499 SGD | Quarterly |
| CEA photo scraper | Dev time only | Monthly cron |
| Claim profile feature | Dev time only | One-time build |
| **Total Year 1** | **~$2,000 SGD** | |

---

## Sources

- [CEA Public Register](https://eservices.cea.gov.sg/aceas/public-register/) — photos, confirmed via Playwright
- [SPADB](https://www.sgpropertyagentdatabase.com/) — $499 SGD, 36K+ agents with mobile + email
- [SPAD](https://singaporepropertyagentdatabase.com/) — alternative provider, similar coverage
- [ERA Agent Portal](https://propertyportal.era.com.sg/agent/detail/R043039D) — shows office phone + email (Cloudflare-protected)
- [99.co Agent Profiles](https://www.99.co/singapore/agents/R043039D-kavin-kuah) — phone partially masked
- [CEA Salesperson Info - data.gov.sg](https://data.gov.sg/datasets/d_07c63be0f37e6e59c07a4ddc2fd87fcb/view) — 6 fields only, no contact info
