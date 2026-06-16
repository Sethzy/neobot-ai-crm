# Handover: Google Maps Drive Time Tool

## Context

Sunder's agent has no `run_command` (sandbox was cut from v2 plan). This means the agent can't call arbitrary external APIs. The Chief of Staff reference (`services/template-automations.md`) describes a calendar transit automation that needs Google Maps Routes API for real drive times between addresses. Today, this is the one capability the agent genuinely can't do.

**The fix is simple:** build a `calculate_drive_time` tool the same way `web_search` and `web_scrape` are built — a server-side `fetch()` call to the Google Maps Routes API wrapped in an AI SDK `tool()`. No sandbox needed.

## What to build

A new tool: `calculate_drive_time`

**Input:**
- `origin` (string) — address or place
- `destination` (string) — address or place
- `departure_time` (string, optional) — ISO 8601 datetime for traffic-aware routing. Defaults to now.

**Output (success):**
```ts
{
  success: true,
  origin: string,
  destination: string,
  duration_minutes: number,
  duration_display: string,    // e.g. "23 mins"
  distance_km: number,
  distance_display: string,    // e.g. "14.2 km"
  traffic_aware: boolean,
}
```

**Output (error):**
```ts
{ success: false, error: string }
```

## API details

- **Endpoint:** `https://routes.googleapis.com/directions/v2:computeRoutes`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
  - `X-Goog-Api-Key: ${GOOGLE_MAPS_API_KEY}`
  - `X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.legs`
- **Body:**
```json
{
  "origin": { "address": "<origin>" },
  "destination": { "address": "<destination>" },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE",
  "departureTime": "<ISO 8601 or omit>"
}
```
- **Response shape:** `routes[0].duration` (e.g. `"1380s"`), `routes[0].distanceMeters` (number)
- **Auth:** API key from env var `GOOGLE_MAPS_API_KEY`. Free tier covers typical usage (2-5 calls/day).
- **Docs:** https://developers.google.com/maps/documentation/routes/compute-route-matrix

## Where it goes

Follow the exact pattern of `src/lib/runner/tools/web/search.ts`:

1. **Create** `src/lib/runner/tools/web/drive-time.ts`
   - Export `createDriveTimeTool()` returning `{ calculate_drive_time }`
   - Use `tool()` from `ai` package with Zod input schema
   - Use `fetchWithTimeout` from `./fetch-with-timeout` (already exists)
   - Read `GOOGLE_MAPS_API_KEY` from `process.env`
   - Parse the `routes[0].duration` string (e.g. `"1380s"`) into minutes
   - Parse `routes[0].distanceMeters` into km

2. **Register** in `src/lib/runner/tools/web/index.ts`
   - Add `...createDriveTimeTool()` to `createWebTools()`

3. **Env var** — add `GOOGLE_MAPS_API_KEY` to `.env.example` / Vercel env config

4. **Test** — add `src/lib/runner/tools/web/__tests__/drive-time.test.ts`
   - Mock fetch, verify request shape, verify duration parsing, verify error handling for missing API key

## What this unlocks

Once this tool exists, the agent can:
- Calculate real drive times between property viewings (core real estate use case)
- Create calendar transit buffer events (Chief of Staff Layer 1 pattern)
- Batch errand routing (pipe-separated multi-stop support can be a follow-up)
- Answer "how long to get from X to Y" in chat

## Scope boundaries

- **This PR:** Single origin→destination drive time. One tool, one file, register it.
- **Follow-up (optional):** Multi-stop routing (accept array of waypoints, return leg-by-leg). Not needed for v1.
- **Not in scope:** Distance Matrix service, transit/walking/cycling modes, Places autocomplete.

## Estimated effort

Small. ~100 lines of tool code + ~80 lines of tests. Same shape as `web_search.ts`.
