# Handover: Batch Enrichment Skill — Infrastructure Review

**Date:** 2026-04-03
**Author:** Seth
**Status:** Design doc written, need infra validation before implementation

---

## Context

We're building a batch enrichment skill that runs a pre-built Node script in the Vercel Sandbox to enrich 500+ CRM records in a single `bash` tool call. The design doc is at `docs/product/designs/2026-04-03-batch-enrichment-skill-design.md`. Read it first.

The product design is settled. What I need validated is whether the infrastructure can actually support it. Specifically: sandbox limits, credential brokering for Supabase, Brave/Exa rate limits, and the concurrent fetch model.

---

## What you need to evaluate

### 1. Sandbox execution limits

The design assumes a single `bash` tool call running a Node script for 3-8 minutes inside the Vercel Sandbox.

Confirm:
- **Timeout ceiling** — We currently set `SANDBOX_TIMEOUT_MS = 5 * 60 * 1000` in `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts:22`. The design assumes 13 minutes. What's the actual max Vercel allows? Can we raise it?
- **Memory** — 500 concurrent HTTP responses buffered in Node. What's the sandbox memory limit? Is it enough?
- **Network** — Can the sandbox sustain 8 concurrent outbound HTTPS connections? Any connection pooling limits?
- **stdout size** — The script prints a summary + writes files. Is there a stdout capture limit in the bash tool? Check `maxOutputLength` in `create-lazy-bash-tool.ts`.
- **Artifact sync** — `syncOutputArtifacts()` runs after each bash command. With a `results.json` that could be 1-2MB for 500 records, does the upload-to-Supabase-Storage step handle it? Check `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`.

### 2. Credential brokering for Supabase

The design requires the sandbox script to write enriched records directly to Supabase via REST API. Auth needs to be injected via the existing credential brokering pattern.

Current state — `create-lazy-bash-tool.ts` already brokers:
- `api.search.brave.com` → `X-Subscription-Token` header
- `api.exa.ai` → `x-api-key` header

What needs to be added:
- `xxx.supabase.co` → `apikey: {SUPABASE_ANON_KEY}` + `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`

Evaluate:
- **Is the broker rule format correct?** The current implementation uses `networkPolicy.allow` with `transform` arrays. Check if it supports injecting multiple headers on the same domain. See `create-lazy-bash-tool.ts:110-124`.
- **Service role key vs anon key** — The script needs to bypass RLS to write to any client's records (the agent runs server-side with the service role key). Is injecting the service role key into a per-user sandbox safe? The VM is ephemeral and isolated, but this is a more powerful credential than Brave/Exa keys.
- **Supabase REST API shape** — The script would do `PATCH /rest/v1/companies?company_id=eq.{id}` with the enriched fields. Confirm the PostgREST PATCH syntax works for partial updates. Does RLS apply when using the service role key? (It shouldn't, but verify.)

### 3. Brave Search API rate limits

The design runs 500 Brave searches at 8 concurrent.

Confirm:
- **Free tier limits** — 2,000 queries/month. What's the per-second rate? One 500-record run at 8 concurrent = ~8 requests/second peak.
- **429 handling** — We've already seen 429 errors in testing. Does the free tier throttle at 1 req/sec? 5 req/sec? The script needs to know what delay to add between requests.
- **Paid tier** — What does the paid plan cost and what are its limits?

### 4. Exa Scrape API limits

Same questions:
- **Rate limits** — What's the per-second/per-minute cap?
- **Reliability** — In testing, some sites return `CRAWL_HTTP_403`. What percentage of sites fail? Is there a fallback worth implementing (raw `fetch` + HTML parsing)?
- **Cost** — What does 500 scrapes cost?

### 5. Concurrent fetch in Node 24

The script uses Node's built-in `fetch` with a work-stealing queue (8 concurrent).

Confirm:
- **DNS resolution** — Does Node 24 in the sandbox VM cache DNS? 500 different domains = 500 DNS lookups.
- **Connection limits** — Default `http.globalAgent.maxSockets` in Node. Is 8 concurrent fine or do we need to configure this?
- **Memory under load** — 8 concurrent responses, each up to 10KB (scrape snippets). Peak memory should be minimal, but confirm the sandbox doesn't have aggressive memory limits.

### 6. Vercel Sandbox network policy

The credential brokering uses `networkPolicy.allow` to define which domains the sandbox can reach and what headers to inject.

Confirm:
- **Wildcard rule** — The current code has `"*": []` as a catch-all. Does this mean the sandbox can reach any domain, or only the explicitly listed ones?
- **Multiple headers per domain** — Can the broker inject both `apikey` and `Authorization` headers on the same Supabase domain?
- **Does the broker work with POST/PATCH?** Current usage is GET (Brave search) and POST (Exa). We need PATCH for Supabase updates. Confirm the broker doesn't filter by HTTP method.

---

## Key files to read

| File | What to check |
|------|--------------|
| `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` | Sandbox creation, timeout, credential brokering setup |
| `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` | File sync after bash command (size limits?) |
| `src/lib/runner/tools/sandbox/types.ts` | Type definitions for sandbox config |
| `src/lib/env.ts` | Which env vars are available server-side |
| `.env.local` | Current credential values (for local testing) |

Also reference:
- Vercel Sandbox SDK docs: `vercel-sandbox-snapshots-refs.json` has pointers
- Vercel Sandbox network policy docs: check if there's a `networkPolicy` type definition in `node_modules/@vercel/sandbox/dist/`

---

## Deliverable

A companion review doc at `docs/product/designs/2026-04-03-batch-enrichment-infra-review.md` covering:

1. Confirmed limits (timeout, memory, network, stdout, artifact size)
2. Supabase brokering feasibility (header injection, service role key safety)
3. API rate limit numbers (Brave free/paid, Exa)
4. Any blockers or required changes before implementation
5. Recommended concurrency setting (8? 12? lower?) based on rate limits

No code changes needed — this is a docs-only review.
