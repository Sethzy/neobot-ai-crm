# Batch Enrichment Skill — Infrastructure Review

**Date:** 2026-04-03  
**Scope:** Validate whether the current Sunder sandbox + credential brokering setup can support the batch enrichment design in `docs/product/designs/2026-04-03-batch-enrichment-skill-design.md`.

## Executive Summary

The infrastructure can support the batch-enrichment shape, but not exactly as written today.

What is confirmed:

- A single sandboxed Node process running for 13 minutes is supported by Vercel. The current 5-minute limit is our code, not Vercel's ceiling.
- Memory, outbound networking, stdout summary size, and artifact upload size are all fine for a 500-record run.
- The current golden snapshot is already on Node `v24.14.1`, so the Node 24 assumption is valid.
- Vercel's network policy format does support per-domain header injection, including multiple headers on one domain, and it is not method-specific.
- Supabase PostgREST `PATCH` is valid for partial row updates, and `Authorization: Bearer <service-role>` bypasses RLS.

What is **not** safe or not yet true:

- The current shared `bash` tool should **not** be given Supabase service-role brokering as-is. With the current wildcard egress rule (`"*": []`) and arbitrary shell access, that would give any sandboxed bash session privileged CRM read/write capability and a path to exfiltrate data.
- The current Brave key is **not** capable of 8 search requests/second. Live headers on 2026-04-03 show `1 req/sec` and `2000 req/month`, and a second request inside one second returned `429`.
- `results.json` checkpointing does **not** survive a mid-command sandbox failure with the current artifact sync model, because artifacts are only synced after the bash command exits.

## 1. Confirmed Limits

### Sandbox timeout

Current app setting:

- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts:23` sets `SANDBOX_TIMEOUT_MS = 5 * 60 * 1000`.

Confirmed platform limit:

- Vercel Sandbox defaults to 5 minutes, but the platform maximum is **45 minutes on Hobby** and **5 hours on Pro/Enterprise**.
- A 13-minute run is therefore allowed on any Vercel plan.

Assessment:

- The design's 13-minute assumption is valid.
- Raising the timeout is a repo change, not an infrastructure blocker.
- Recommended setting: **15 minutes**, not exactly 13, to leave room for sandbox boot, retries, and cleanup.

Sources:

- Vercel Sandbox pricing and limits: https://vercel.com/docs/vercel-sandbox/pricing
- Local code: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

### Memory

Current app setting:

- We do **not** pass `resources` to `Sandbox.create()` in `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts:126-140`.

Confirmed platform limit:

- Vercel allocates **2 GB memory per vCPU**.
- Default sandbox size is **2 vCPUs**, so the default sandbox is effectively **4 GB RAM**.
- Maximum is **8 vCPUs / 16 GB RAM**.

Assessment:

- This workload is nowhere near the sandbox memory ceiling.
- Even if you buffered all 500 scrape snippets at 10 KB each, that is only about **5 MB**.
- A `results.json` file in the 1-2 MB range is trivial relative to 4 GB.
- 8-way concurrency is safe from a memory standpoint. There is no reason to increase vCPUs for this workload yet.

Sources:

- Vercel Sandbox pricing and limits: https://vercel.com/docs/vercel-sandbox/pricing
- Local SDK README: `node_modules/@vercel/sandbox/README.md`

### Network / outbound HTTPS

Confirmed platform behavior:

- Vercel documents network policy and egress allowlists, but does not publish a tiny per-sandbox outbound socket cap that would make 8 HTTPS requests a problem.
- Node 24 `fetch()` in the sandbox is powered by Undici, not the legacy `http` client.
- I verified the current golden snapshot runtime directly: `node -v` inside the sandbox returned **`v24.14.1`** and `process.versions.undici` returned **`7.24.4`**.

Assessment:

- **8 concurrent outbound HTTPS requests is fine.**
- The network bottleneck here is external API rate limits, not the sandbox.
- Do **not** tune `http.globalAgent.maxSockets`; it is not the control surface for `fetch()`.

Sources:

- Node fetch docs: https://nodejs.org/learn/getting-started/fetch
- Node globals docs: https://nodejs.org/download/release/v24.0.2/docs/api/globals.html
- Live sandbox probe against `SANDBOX_GOLDEN_SNAPSHOT_ID` on 2026-04-03

### DNS resolution in Node 24

Confirmed platform behavior:

- Node documents that `dns.lookup()` is backed by `getaddrinfo(3)` and various networking APIs use it internally.
- Node does **not** document an application-level DNS cache for `fetch()`.

Assessment:

- Assume **no app-level DNS cache guarantee**. Resolution will follow the OS / resolver path.
- At 8 concurrency this is not a problem.
- If you add raw per-domain website fetches later and push concurrency much higher, DNS lookups could become a latency factor before memory becomes a problem.

Sources:

- Node DNS docs: https://nodejs.org/download/release/v24.2.0/docs/api/dns.html

### stdout capture

Current app setting:

- `create-lazy-bash-tool.ts:188-205` passes `maxOutputLength: 100_000` to `createBashTool()`.

Assessment:

- The important limit here is **our tool wrapper**, not Vercel Sandbox.
- A short human summary is fine.
- Printing per-record logs or dumping JSON to stdout is not fine; output will be truncated around 100 KB.
- The design already writes structured output to files, which is the correct pattern.

Recommendation:

- Keep stdout to a compact summary only.
- Write machine-readable details to `agent/home/results.json`.

Sources:

- Local code: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

### Artifact sync

Current app behavior:

- `syncOutputArtifacts()` runs **after** each bash call, not during it.
- It reads each file fully into a `Buffer`, hashes it, then uploads it with `supabase.storage.from(...).upload(...)`.
- There is no repo-side artifact size cap in this path.

Confirmed platform limit:

- Supabase Storage global file size limit is **50 MB on Free** and up to **500 GB on Pro**.

Assessment:

- A 1-2 MB `results.json` upload is safe.
- Current implementation can handle it easily.
- The real constraint is **durability during a crash**:
  - If the bash command finishes, artifact sync is fine.
  - If the sandbox dies mid-command, `results.json` never gets synced back because sync only happens after command completion.

Implication for the design:

- The design's claim that a partially written `results.json` can be recovered after a sandbox death is **not true with the current sync model**.
- Successful CRM writes are still durable if the script writes them directly to Supabase as it goes.
- The checkpoint file itself is **not durable** unless you persist it externally during the run.

Sources:

- Local code: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- Local code: `src/lib/storage/agent-files.ts`
- Supabase Storage limits: https://supabase.com/docs/guides/storage/uploads/file-limits

## 2. Supabase Brokering Feasibility

### Does the rule format support multiple headers on one domain?

Yes.

Why:

- The local Vercel Sandbox SDK type for `NetworkTransformer` is `headers?: Record<string, string>`.
- The SDK's `toAPINetworkPolicy()` implementation merges all transformed headers for a domain into one injected header map.
- That means this is valid:

```ts
"xtewwwycvapskgvfnliq.supabase.co": [{
  transform: [{
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }],
}]
```

Assessment:

- The broker format is correct.
- You can inject both `apikey` and `Authorization` on the same Supabase host.

Sources:

- Local SDK type: `node_modules/@vercel/sandbox/dist/network-policy.d.ts`
- Local SDK implementation: `node_modules/@vercel/sandbox/dist/utils/network-policy.js`

### Does brokering depend on HTTP method?

No.

Why:

- Vercel's network policy is domain-based egress policy plus request header transforms.
- Neither the public types nor the SDK implementation include method filters.

Assessment:

- If a domain is matched, the header injection applies to `GET`, `POST`, `PATCH`, etc.
- Using `PATCH` for Supabase REST updates is compatible with the broker.

Sources:

- Vercel Sandbox SDK reference: https://vercel.com/docs/vercel-sandbox/sdk-reference
- Local SDK types: `node_modules/@vercel/sandbox/dist/network-policy.d.ts`

### Does PostgREST PATCH work for partial updates?

Yes.

Confirmed syntax:

- PostgREST supports partial updates with `PATCH` plus horizontal filters.
- Example shape:

```http
PATCH /rest/v1/companies?company_id=eq.<uuid>
Content-Type: application/json
apikey: <project key>
Authorization: Bearer <service role key>

{
  "industry": "Logistics",
  "description": "..."
}
```

Assessment:

- The proposed `PATCH /rest/v1/companies?company_id=eq.{id}` pattern is valid.
- This is the correct REST shape for partial updates.

Sources:

- PostgREST tables/views docs: https://docs.postgrest.org/en/v12/references/api/tables_views.html

### Does service-role authorization bypass RLS?

Yes.

Confirmed behavior:

- Supabase documents that RLS enforcement is based on the **`Authorization` header**, not the `apikey` header.
- A client using the service role key in the `Authorization` header **always bypasses RLS**.

Assessment:

- The proposed header pair is functionally correct:
  - `apikey: SUPABASE_ANON_KEY`
  - `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY`
- Because `Authorization` carries the service-role credential, writes will bypass tenant RLS.

### Is injecting the service-role key into the sandbox safe?

**Technically feasible, but not safe in the current shared `bash` tool design.**

Important distinction:

- Vercel's brokered headers are safer than env vars because the secret is not readable from inside the VM.
- But that does **not** mean the capability is low-risk.
- Any code that can reach the allowed Supabase domain can still make privileged reads/writes using that injected authorization.

Why the current setup is risky:

- `create-lazy-bash-tool.ts` creates a **general-purpose arbitrary bash tool**.
- It currently includes a wildcard egress rule: `allow: { ...brokerRules, "*": [] }`.
- If Supabase service-role brokering is added there:
  - any sandboxed bash command can perform privileged CRM reads/writes, and
  - the same session can still send fetched data to arbitrary outbound domains via `*`.

That makes the risk profile fundamentally different from Brave/Exa:

- Brave and Exa keys are read-only third-party credentials.
- Supabase service role is a privileged first-party write credential.

Assessment:

- **Do not add Supabase service-role brokering to the shared `bash` tool while wildcard egress remains enabled.**

Required change:

- Use a **skill-specific sandbox configuration** for batch enrichment:
  - exact Supabase project host only
  - Brave host
  - Exa host
  - **no `*` wildcard**
- Better still, use a **least-privileged server credential** instead of the full service role:
  - dedicated DB role or secret key limited to the relevant tables/columns, or
  - a narrow RPC/write surface for enrichment results

Sources:

- Vercel knowledge-base discussion of credential brokering boundaries: https://vercel.com/kb/guide/vercel-sandbox-vs-e2b
- Supabase RLS/service-role troubleshooting: https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z
- Local code: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

## 3. Brave Search API Rate Limits

### What the public pricing page says

Brave's current pricing page for the **Search** endpoint says:

- **$5 per 1,000 requests**
- **$5 in free monthly credits**
- **50 queries per second** capacity

Source:

- https://brave.com/search/api/

### What the current key actually allows

I probed the live key in `.env.local` on 2026-04-03.

Returned headers:

- `X-RateLimit-Limit: 1, 2000`
- `X-RateLimit-Policy: 1;w=1, 2000;w=2592000`
- `X-RateLimit-Remaining: 0, 1985`

And a direct back-to-back test returned:

- first request: `200`
- second request in the same second: `429`

Assessment:

- The **current subscription/key is effectively 1 request/second and 2000 requests/month**.
- Do **not** assume the generic 50 QPS marketing page applies to the currently provisioned key.
- For implementation, trust the live headers on the account, not the generic product page.

### Operational impact on the design

At the current Brave limit:

- 500 records x 1 search each = **minimum 500 seconds** of search time
- That is about **8.3 minutes** before scrape/write latency, retries, or startup overhead

Conclusion:

- A 500-record run is still possible in one sandbox if everything else overlaps cleanly.
- It will **not** match the design's `~3-5 min` estimate on the current Brave key.
- A 1000-record run does **not** fit the current Brave limit inside 13 minutes.

### 429 handling

Brave documents:

- rate limiting uses a **1-second sliding window**
- every response includes `X-RateLimit-*` headers
- on 429, you should consult `X-RateLimit-Reset` and back off

Recommendation:

- On the current key, enforce a **1 request/second token bucket** for Brave.
- Add jittered backoff on 429.
- Do not let worker concurrency directly control Brave request rate.

Sources:

- Brave rate limiting guide: https://api-dashboard.search.brave.com/documentation/guides/rate-limiting
- Brave pricing: https://brave.com/search/api/
- Live header probe on 2026-04-03

## 4. Exa Limits, Reliability, and Cost

### Rate limits

Exa's current docs say:

- `/search`: **10 QPS**
- `/contents`: **100 QPS**
- `/answer`: **10 QPS**
- `/research`: **15 concurrent tasks**

Assessment:

- Exa is **not** the bottleneck for this design at 8 concurrency.
- If the enrichment script uses the dedicated `/contents` endpoint for scraping, 8-12 concurrent requests is comfortably within Exa's published limit.

Source:

- https://exa.ai/docs/reference/rate-limits

### Reliability / 403s

Exa's current error docs include:

- `SOURCE_NOT_AVAILABLE` (`403`) for forbidden or unavailable sources
- `CRAWL_TIMEOUT` (`408`)
- `CRAWL_LIVECRAWL_TIMEOUT` (`408`)
- `CRAWL_NOT_FOUND` (`404`)

Assessment:

- Exa clearly expects some sources to be inaccessible.
- Exa does **not** publish a site failure percentage, so I could not validate any "% of sites fail" number from official sources.
- What I could confirm is the class of failures, not their incidence rate.

Fallback recommendation:

- A raw `fetch(url).text()` fallback is worth considering **only as a narrow recovery path** for public pages when Exa returns a crawl/access failure.
- It will help only for some cases.
- It will **not** fix paywalls, authenticated pages, robots restrictions, or sites aggressively blocking all crawlers.
- This is a quality optimization, not a blocker for v1.

Source:

- Exa error codes: https://exa.ai/docs/reference/error-codes

### Cost

Exa's current pricing says:

- dedicated **`/contents`** endpoint: **$1 per 1,000 pages per content type**
- summaries: **$1 per 1,000 summaries**

Assessment for 500 scrapes:

- 500 contents fetches with one content type: about **$0.50**
- 500 summaries on top: another **$0.50**

If you instead use Exa search-with-contents:

- base **Search** price is **$7 per 1,000 requests** including contents for 10 results

For this design, where Brave is already doing discovery and Exa is only doing scrape/extract, the dedicated `/contents` endpoint is the cheaper fit.

Sources:

- Exa pricing: https://exa.ai/pricing
- Exa pricing update: https://exa.ai/docs/changelog/pricing-update

## 5. Vercel Sandbox Network Policy

### What does `"*": []` mean?

The Vercel SDK type docs show:

- custom `allow` rules mean traffic not explicitly allowed is denied
- `"*"` is a wildcard domain rule

Assessment:

- In the current code, `"*": []` means the sandbox can reach **any domain** with no additional header transforms.
- The named rules just add credential injection for matching domains.

This is fine for read-only third-party APIs. It is **not** fine once you add privileged first-party write access.

### Can the broker inject multiple headers on the same domain?

Yes.

- A single transform can inject multiple headers.
- Multiple transforms for one domain are also merged by the SDK implementation.

### Does it work with PATCH?

Yes.

- The policy is domain-based, not method-based.
- No special handling is needed for `PATCH`.

Sources:

- Vercel Sandbox SDK reference: https://vercel.com/docs/vercel-sandbox/sdk-reference
- Local SDK type: `node_modules/@vercel/sandbox/dist/network-policy.d.ts`
- Local SDK implementation: `node_modules/@vercel/sandbox/dist/utils/network-policy.js`

## 6. Recommended Concurrency

### Recommendation

Do **not** use one naive "8 workers => 8 Brave searches" model.

Use separate rate controls:

- Brave search: **1 req/sec** on the current key
- Exa contents: **8 concurrent** to start
- Supabase writes: **8 concurrent** to start

If the script architecture insists on one single end-to-end worker count, set it to:

- **1** on the current Brave key

That is operationally safe but gives up most of the design's speed benefit.

### Recommended implementation stance

Short term, with the current credentials:

- overall worker pool: **8**
- Brave limiter inside the pool: **1 req/sec**
- Exa/write concurrency: **8**

After upgrading Brave to a higher-throughput Search plan:

- **8** concurrent end-to-end workers is still the right starting point
- **12** is probably still safe, but I would not start there because the current bottleneck is not sandbox capacity

Bottom line:

- **Recommended setting today: 8 workers with a separate Brave 1 rps limiter**
- **Recommended setting after Brave upgrade: 8 workers end-to-end**

## 7. Required Changes Before Implementation

### Blockers

1. Raise sandbox timeout above 5 minutes.
2. Do **not** add Supabase service-role brokering to the shared wildcard-enabled `bash` tool.
3. Add explicit Brave rate limiting based on the live key headers.

### Strongly recommended

1. Make batch enrichment use a **skill-specific sandbox policy** rather than the general bash tool policy.
2. Remove wildcard egress for that skill-specific sandbox.
3. Use a narrower Supabase credential than the full service role if possible.
4. Persist progress externally if you really need crash-resumable `results.json` checkpoints.
5. Update the bash tool description string, which still says "Node 22"; the current golden snapshot is already Node 24.

## Final Call

Infrastructure verdict:

- **Vercel Sandbox itself is not the blocker.**
- **Brave throughput on the current key and Supabase brokering safety in the shared bash tool are the blockers.**

If you fix those two things, the design is operationally feasible.
