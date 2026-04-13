# Orthogonal API Marketplace + Tool Credit Metering

**PR:** 70  
**Date:** 2026-04-13  
**Status:** Design  

---

## What Gooseworks Does (the reference)

Gooseworks is an AI agent platform ($29/mo base) with a credit overlay:

- **1 credit = $0.01**
- **Platform holds all API keys** — Apify, Scrape Creators, Apollo, etc. Users never sign up for these directly.
- **Orthogonal** is their API discovery + execution layer: 27+ data providers (Reddit, LinkedIn, TikTok, contact enrichment) accessible via one semantic search API.
- **Flow per tool invocation:**
  1. Agent decides it needs data (e.g. "scrape r/growthhacking for HubSpot mentions")
  2. Calls `orthogonal_search` → finds Scrape Creators Reddit endpoint
  3. Calls `orthogonal_run` → platform executes with managed API key
  4. Deducts credits from user balance
  5. Returns results

The agent doesn't hold credentials. The runner holds them. Credits are the billing primitive on top of the monthly plan.

---

## What Sunder Adopts

### Scope (KISS)

**In:**
- Credit ledger for metered tool usage
- Orthogonal integration as a research/enrichment API layer (`discover_research_api` + `call_research_api` custom tools)
- Credits top-up via Stripe (extends PR 38b)
- Credits balance + usage history in `/settings/billing`

**Out (YAGNI):**
- x402 / USDC micropayments — not relevant to advisory sales practitioners
- Full public skill marketplace — instruction skills (PR 51) already covers this
- Per-client custom API key management
- Building our own API aggregator

---

## Architecture

### Tool Credit Ledger

New Supabase table: `tool_credit_transactions`

```sql
create table tool_credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  amount      integer not null,           -- positive = top-up, negative = deduction
  tool_name   text,                        -- null for top-ups
  session_id  text,                        -- managed-agents session ID, nullable
  note        text,                        -- e.g. "Orthogonal: scrapecreators /v1/reddit/subreddit/search"
  created_at  timestamptz default now()
);

create index on tool_credit_transactions (client_id, created_at desc);
```

**Balance** = `select coalesce(sum(amount), 0) from tool_credit_transactions where client_id = $1`

No separate balance column — ledger is the source of truth.

### Orthogonal Custom Tools

Two new tools declared on the agent and handled in the session runner:

**`discover_research_api`** — semantic search over Orthogonal's catalog  
Input: `{ query: string }` (e.g. "scrape Reddit posts by subreddit and keyword")  
Cost: 0 credits (free)  

**`call_research_api`** — execute an API endpoint from the catalog  
Input: `{ api: string, path: string, params: Record<string, string> }`  
Cost: variable (1–10 credits based on Orthogonal's per-call cost)

These are custom tools — agent emits `agent.custom_tool_use`, session runner handles:

```typescript
// src/lib/managed-agents/tools/orthogonal.ts

const CREDIT_COSTS: Record<string, number> = {
  "scrapecreators:/v1/reddit/subreddit/search": 3,
  "scrapecreators:/v1/reddit/search": 3,
  "scrapecreators:/v1/linkedin/search": 5,
  "apollo:/people/search": 5,
  // ... extend as we add providers
};

export async function handleOrthogonalRun(
  clientId: string,
  input: { api: string; path: string; params: Record<string, string> },
  sessionId: string,
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  const key = `${input.api}:${input.path}`;
  const cost = CREDIT_COSTS[key] ?? 5; // default 5 credits for unknown endpoints

  // 1. Check balance
  const balance = await getToolCreditBalance(clientId);
  if (balance < cost) {
    return { success: false, error: `Insufficient credits (need ${cost}, have ${balance}). Top up at Settings > Billing.` };
  }

  // 2. Execute via Orthogonal
  const result = await fetch("https://api.orth.sh/v1/run", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.ORTHOGONAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api: input.api, path: input.path, params: input.params }),
  }).then(r => r.json());

  // 3. Deduct credits
  await deductToolCredits(clientId, cost, `orthogonal:${key}`, sessionId);

  return { success: true, data: result };
}
```

### Credit Top-Up (extends PR 38b Stripe)

Add a "Credit Packs" section to the Stripe Checkout flow alongside subscriptions:

| Pack | Credits | Price |
|------|---------|-------|
| Starter | 500 | $5 |
| Growth | 2,500 | $20 |
| Scale | 10,000 | $75 |

On successful Stripe payment webhook (`checkout.session.completed` with `mode: payment`), insert a positive transaction into `tool_credit_transactions`.

### Settings UI

`/settings/billing` additions:
- **Credit balance** (live from ledger sum)
- **Top-up button** → Stripe Checkout for credit packs
- **Usage history table** — last 50 transactions (tool name, credits, date)

---

## What Orthogonal Gives You Out of the Box

| Provider | What it covers |
|----------|----------------|
| Scrape Creators | Reddit, LinkedIn, TikTok, Instagram, Twitter/X |
| Apollo.io | Contact + company enrichment (emails, titles, company data) |
| Crustdata | LinkedIn posts by keyword (useful for social listening) |
| SearchAPI | Reddit ads library, YouTube search |
| 23+ more | Discovered dynamically via `discover_research_api` |

For Sunder's advisory sales practitioners, the immediate value is:
- **Client research**: Apollo enrichment on leads before a meeting
- **Market intelligence**: Reddit sentiment on competitors or topics
- **Social listening**: LinkedIn posts by keyword (what's being said in target verticals)

---

## Session Runner Integration

In `src/lib/managed-agents/session-runner.ts` (or `dispatcher.ts`), add handlers for the two new tools:

```typescript
case "discover_research_api":
  result = await handleOrthogonalSearch(event.input.query);
  break;

case "call_research_api":
  result = await handleOrthogonalRun(clientId, event.input, session.id);
  break;
```

`clientId` is already injected into the runner closure — same pattern as all other tools.

---

## Credit Cost Rationale

Orthogonal charges per API call (USDC via x402). We absorb that cost and charge credits at ~2–3x markup:

- Scrape Creators Reddit search: ~$0.01–0.02 Orthogonal cost → 3 credits ($0.03) to user
- Apollo enrichment: ~$0.02–0.05 → 5 credits ($0.05)
- Margin covers Orthogonal cost + Sunder overhead

This is identical to what Gooseworks does — users pay us, we pay Orthogonal.

---

## Out of Scope

- Browser automation credit metering (Browser-Use already billed separately, usage is low)
- Property portal tools credit metering (env-gated, SG-specific — keep flat)
- Credit expiry
- Free credit grants on signup (add later if needed for activation)
- Seat-level credit allocation (org-wide balance is fine for v1)
