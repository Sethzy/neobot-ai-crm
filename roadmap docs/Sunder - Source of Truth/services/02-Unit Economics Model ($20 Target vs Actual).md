# Unit Economics Model ($20 Target vs Actual)

**Status:** Draft for review  
**Date:** February 23, 2026  
**Scope:** V1 paid service stack unit economics

---

## Why this exists

The current docs had a **$20/user/month target** but no full per-active-user model across the full paid stack.

This file adds that missing model and points to the spreadsheet-ready CSVs.

---

## Files in this model pack

1. `services/02-unit-economics-assumptions.csv`  
   Rates + per-active-user usage assumptions (Low / Base / High).
2. `services/03-unit-economics-scenarios.csv`  
   Total monthly cost and cost per active user at user counts: 1, 5, 10, 25, 50, 100.
3. `services/04-unit-economics-service-breakdown.csv`  
   Service-level contribution by scenario and user-count.

---

## What was modeled

Paid stack included in this model:

1. OpenRouter
2. Supabase
3. Vercel Sandbox
4. Brave Search
5. Exa
6. Browserbase
7. Firecrawl
8. OpenAI Whisper
9. Inworld
10. Gemini 2.5 Flash
11. ExtendAI
12. Composio
13. Vercel (platform baseline, because frontend/functions are deployed there)

Notes:

1. Cal.com and Tally are user-owned/free in v1, so platform cost to Sunder is modeled as $0.
2. Supabase fixed fee is modeled with a **$25/month Pro assumption** and explicit overage lines from Supabase docs.
3. ExtendAI public page does not expose a clean per-credit PAYG rate; model uses an explicit assumption (`$0.25/complex doc`) documented in the assumptions CSV.

---

## Headline results

Cost per active user by scenario:

| Scenario | 1 user | 5 users | 10 users | 25 users | 50 users | 100 users |
|---|---:|---:|---:|---:|---:|---:|
| **Low usage** | $114.31 | $26.31 | $15.31 | $8.71 | $6.81 | $6.22 |
| **Base usage** | $118.92 | $30.92 | $19.92 | $14.82 | $13.64 | $13.05 |
| **High usage** | $135.60 | $49.70 | $43.20 | $39.66 | $38.52 | $37.98 |

Interpretation:

1. The `$20/user/month` target is **not realistic at very low active-user counts** because fixed platform costs dominate.
2. Under **Base** assumptions, target is met at ~10+ active users, but with thin headroom at 10 users.
3. Under **High** usage, target is **not met** even at 100 users.

---

## Main cost drivers (Base scenario, 50 active users)

Top services by monthly spend:

1. OpenRouter: **$211.00** (31.0%)
2. Vercel Sandbox: **$156.05** (22.9%)
3. Firecrawl: **$88.00** (12.9%)
4. Browserbase: **$74.00** (10.9%)

These four are ~78% of total model cost in the Base 50-user case.

---

## Source links used

1. OpenRouter: https://openrouter.ai/pricing
2. Supabase billing/overages: https://supabase.com/docs/guides/platform/billing-on-supabase
3. Vercel Sandbox: https://vercel.com/docs/sandbox
4. Brave Search API: https://api-dashboard.search.brave.com/documentation/pricing
5. Exa: https://exa.ai/pricing
6. Browserbase: https://www.browserbase.com/pricing
7. Firecrawl: https://www.firecrawl.dev/pricing
8. OpenAI Whisper model page: https://openai.com/index/whisper/
9. Inworld: https://inworld.ai/pricing
10. Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
11. ExtendAI: https://www.extend.ai/pricing
12. Composio: https://composio.dev/pricing
13. Vercel: https://vercel.com/pricing

---

## Decision impact

This model confirms the concern in review comments:

1. Platform-level estimates based on aggregate usage (for example, 900 actions/month total) understate cost risk.
2. Once usage scales per active user, browser + search + model spend can move quickly.
3. The `$20` target is feasible only with strict usage controls and/or narrower default service paths.
