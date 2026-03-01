# Real Estate Directory — What Needs Doing

> Last updated: 2026-03-01

Everything below is outstanding work for the real estate directory. Organized by priority.

---

## High Priority (Pre-Release QA)

### 1. Full QA verification pass

Run the standard checks and visually smoke-test every page:

```bash
npx vitest run          # all 917 tests pass
npx tsc --noEmit        # zero type errors
npm run build           # production build succeeds
```

Manual checks:
- [ ] Visit `/agents` — confirms 301 redirect to `/market/agents`
- [ ] Visit `/properties`, `/hdb`, `/agencies`, `/areas` — same redirect behavior
- [ ] `/market` hub page renders 5 category cards with correct counts
- [ ] `/market/agents` — search works, table paginates
- [ ] `/market/agents/[regNo]` — charts render (volume, heatmap, donuts, map)
- [ ] `/market/properties/[slug]` — price trend, floor premium, transactions table
- [ ] `/market/hdb/[town]/[slug]` — flat type donut, price trend, floor premium
- [ ] `/market/agencies/[slug]` — verify charts section renders
- [ ] `/market/areas/[slug]` — verify charts section renders
- [ ] CTA banner appears on all profile pages
- [ ] Sub-nav highlights correct active section on all pages
- [ ] Mobile responsive at 375px — everything stacks, no horizontal overflow

### 2. Verify agency & area profile charts

These were implemented later and may be incomplete. Confirm:
- `/market/agencies/[slug]` has a charts section (not just a transaction list)
- `/market/areas/[slug]` has a charts section

Files: `app/market/agencies/[slug]/charts.tsx`, `app/market/areas/[slug]/charts.tsx`

---

## Medium Priority (Post-Release Enhancements)

### 3. Automated data refresh (Vercel Cron)

The data pipeline currently runs manually via CLI. To keep data fresh, implement Vercel Cron endpoints:

**Planned schedules** (from `docs/landing/plans/property-data-plan.md`):

| Endpoint | Schedule | Data source |
|----------|----------|-------------|
| `/api/cron/agent-refresh` | Daily 6 AM SGT (`0 22 * * *` UTC) | CEA agent CSV |
| `/api/cron/ura-refresh` | Tue & Fri 8 AM SGT (`0 0 * * 2,5` UTC) | URA eService API |
| `/api/cron/hdb-refresh` | Monthly 17th 6 AM SGT (`0 22 16 * *` UTC) | HDB resale data |

**What's needed:**
1. Create API route handlers in `app/api/cron/` that call the Python pipeline (or rewrite in TypeScript)
2. Protect with `Authorization: Bearer ${CRON_SECRET}` header
3. Add `"crons"` config to `vercel.json`
4. Requires Vercel Pro plan (already active)

**Current `vercel.json`:**
```json
{
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```
Missing: the `"crons"` array.

### 4. Add `map:generate` npm script

For discoverability, add to `package.json`:
```json
"map:generate": "tsx scripts/generate-sg-map.ts"
```

The map script rarely needs re-running (URA Master Plan updates ~every 5 years), but having an npm script makes it discoverable for future devs.

### 5. JSON-LD structured data

Not blocking, but improves SEO for rich snippets in Google search results.

| Page type | Schema | Key fields |
|-----------|--------|------------|
| Agent profile | `Person` + `RealEstateAgent` | name, registration number, agency |
| Property profile | `Residence` | name, district, price range |
| HDB street | `Residence` | town, flat types, price range |

Would be added via `<script type="application/ld+json">` in each page's metadata.

---

## Low Priority (Future Iterations)

### 6. Internal linking between profiles

Cross-link related entities to improve SEO crawl depth:
- Agent profile → link to their agency page
- Agent profile → link to area pages they're active in
- Property profile → link to agents who sold there
- Area profile → link to top agents in that area

### 7. Comparison pages (Programmatic SEO)

Generate pages like:
- `/market/compare/bedok-vs-tampines` — HDB town comparison
- `/market/compare/d09-vs-d10` — district comparison

This is Phase 3 (Programmatic SEO) per the property data plan.

### 8. Data freshness indicators

Show "Last updated: X days ago" on listing pages, sourced from the `pipeline_runs` table.

### 9. Map data refresh documentation

The `scripts/generate-sg-map.ts` script fetches from data.gov.sg's URA Master Plan 2019 dataset. Document:
- When to regenerate (only if URA releases a new Master Plan — next expected ~2024/2029)
- How to verify the output (run script, check 55 entries, visual check)
- Troubleshooting if data.gov.sg API changes

---

## Architecture Notes for Future Devs

### Data flow

```
CSV files / URA API
        │
        ▼
scripts/property-pipeline/run_pipeline.py  (Python, manual CLI)
        │
        ▼
Supabase Postgres (6 tables, RLS read-only)
        │
        ▼
Next.js SSR (app/market/* pages query Supabase directly)
        │
        ▼
Public web pages (no auth required)
```

### Key decisions

1. **No API layer** — pages query Supabase directly via server components. No `/api/market/*` endpoints.
2. **Separate Supabase project** — property data is isolated from the main Sunder app DB.
3. **Truncate + insert** — transaction tables have no unique constraints. Each pipeline run does a full refresh.
4. **Static map data** — the 55 planning area SVG paths are checked into the repo as a TypeScript constant. No runtime fetch.
5. **Blue chart palette** — charts use a blue scale (`#1e3a5f` → `#93c5fd`), differentiated from the brand green (`#024F46`).

### Key files to read first

1. `scripts/property-pipeline/README.md` — how to run the data pipeline
2. `docs/landing/plans/property-data-plan.md` — full spec (data sources, cron schedules, SEO plan)
3. `app/market/layout.tsx` — shared layout for all market pages
4. `app/market/agents/[regNo]/page.tsx` — most complex profile page (good reference)
5. `src/lib/property/utils.ts` — all formatting/slug utilities
