# Property UI Handover (Polish Pass)

## Objective
This handover is for a frontend/UI polish pass on the public property resource pages.

Focus is visual refinement and UX improvements only. Core routing/data plumbing is already implemented and should stay stable.

## Public Route Surfaces To Polish

### Agents
- `/agents`
- `/agents/[regNo]`

Files:
- `app/agents/page.tsx`
- `app/agents/[regNo]/page.tsx`
- `app/agents/layout.tsx`

### Properties
- `/properties`
- `/properties/[slug]`

Files:
- `app/properties/page.tsx`
- `app/properties/[slug]/page.tsx`
- `app/properties/layout.tsx`

### Agencies
- `/agencies`
- `/agencies/[slug]`

Files:
- `app/agencies/page.tsx`
- `app/agencies/[slug]/page.tsx`
- `app/agencies/layout.tsx`

### Areas
- `/areas`
- `/areas/[slug]`

Files:
- `app/areas/page.tsx`
- `app/areas/[slug]/page.tsx`
- `app/areas/layout.tsx`

### HDB
- `/hdb`
- `/hdb/[town]/[slug]`

Files:
- `app/hdb/page.tsx`
- `app/hdb/[town]/[slug]/page.tsx`
- `app/hdb/layout.tsx`

## Shared UI Pieces
These are intended to be expanded/replaced during polish:

- `src/components/property/stat-card.tsx`
- `src/components/property/config-notice.tsx`
- `src/components/landing/Header.tsx` (property nav links already added)

## Data/API Surfaces Backing UI
If UI needs client-side interactions/pagination enhancements, these routes already exist:

- `GET /api/agents` → `app/api/agents/route.ts`
- `GET /api/agents/[regNo]` → `app/api/agents/[regNo]/route.ts`
- `GET /api/agents/[regNo]/transactions` → `app/api/agents/[regNo]/transactions/route.ts`
- `GET /api/properties` → `app/api/properties/route.ts`
- `GET /api/properties/[slug]` → `app/api/properties/[slug]/route.ts`
- `GET /api/properties/[slug]/transactions` → `app/api/properties/[slug]/transactions/route.ts`

## Current Constraints To Preserve
- Keep these routes public (do not move under `app/(dashboard)/`).
- Keep existing URL structures unchanged.
- Keep query-param compatibility on profile routes:
  - properties: `?project=...&district=...`
  - agencies: `?name=...`
  - areas: `?name=...`
  - hdb street page: `?town=...&street=...`
- Keep “not configured” fallback behavior when property env vars are missing (via `ConfigNotice`).
- Do not remove `app/robots.ts` and `app/sitemap.ts` metadata routes.

## SEO/Metadata Touchpoints
- `app/robots.ts`
- `app/sitemap.ts`
- Route-level `generateMetadata(...)` in profile pages

Polish can improve metadata copy/quality, but route outputs should remain valid and fast.

## Supporting Helpers
- Property slug/text helpers: `src/lib/property/utils.ts`
- Site URL helper: `src/lib/site-url.ts`
- Property Supabase clients:
  - `src/lib/supabase/property-env.ts`
  - `src/lib/supabase/property-server.ts`
  - `src/lib/supabase/property-public-server.ts`
  - `src/lib/supabase/property-client.ts`

## Local Setup
Required env vars:
- `NEXT_PUBLIC_PROPERTY_SUPABASE_URL`
- `NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (optional but recommended)

## Validation Commands
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Property smoke test: `npm run smoke:property -- http://localhost:3000`

Smoke script file:
- `scripts/smoke-property-routes.sh`

## Notes For UI Polish
- Current agency/area list pages intentionally use sampled transaction windows for speed (not exact global aggregates).
- If polishing copy, avoid language implying exact “all-time” leaderboard unless backend aggregation strategy is changed.
- Mobile layout, visual hierarchy, spacing, typography, and table readability are the primary improvement opportunities.
