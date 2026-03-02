# PR 8: Web Search Tool — Handover Notes

**Author:** Code review session, 2026-03-02
**For:** Developer implementing PR8 tasklist (`docs/tasks/2026-03-02-pr8-web-search-tool-tasklist.md`)
**Purpose:** Corrections, API doc findings, and architectural decisions to apply ON TOP of the tasklist.

---

## 1. API Keys

Both keys are required. Already added to `.env.local` — do NOT commit that file. Also add placeholder entries to `.env.example` (part of Task 3 in the tasklist).

```
BRAVE_SEARCH_API_KEY=   # Get from https://api.search.brave.com
EXA_API_KEY=            # Get from https://exa.ai
```

---

## 2. Corrections from API Docs

The tasklist was written from the Tasklet reference contracts, not from the actual provider docs. Here's what the real APIs say vs what the tasklist assumes:

### 2a. Brave `count` max is 20, not 100

**Tasklist says:** `limit` param accepts 1–100 (from Tasklet contract)
**Brave docs say:** `count` param max is 20, default is 20.

**Decision:** Clamp `limit` to `z.number().int().min(1).max(20)`. Do NOT paginate — not worth the complexity. Update the `.describe()` text to say "max 20".

### 2b. `qdr:h` (past hour) has no Brave equivalent

**Tasklist says:** Map `qdr:h` → `ph`
**Brave docs say:** Valid `freshness` values are `pd` (past 24h), `pw` (week), `pm` (month), `py` (year), or custom date range `YYYY-MM-DDtoYYYY-MM-DD`. There is no `ph`.

**Decision:** Map `qdr:h` → `pd` (closest equivalent: past 24 hours). Document this in a code comment.

### 2c. `cdr:` custom date range format is Google, not Brave

**Tasklist says:** Support `cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY`
**Brave docs say:** Custom ranges use `YYYY-MM-DDtoYYYY-MM-DD` format

**Decision:** Drop `cdr:` support entirely for v1. Only support `qdr:` shortcuts. If the LLM sends an unsupported `tbs` value, return it as-is to Brave (it'll be ignored) — but log or comment that we're being permissive here. YAGNI.

Update the Zod `.describe()` for `tbs` to only mention the supported `qdr:` values.

### 2c-bis. Default location should be "SG", not "US"

**Tasklist says:** `location` defaults to `"US"` (from Tasklet contract)
**Reality:** Our users are real estate agents in Singapore. Defaulting to US makes no sense.

**Decision:** Set default location to `"SG"` (Singapore 2-char country code, which is what Brave's `country` param expects). In the implementation:
```ts
params.set("country", location ?? "SG");
```
Update the `.describe()` to say `'Defaults to "SG"'` instead of `"US"`.

Add test: when `location` is omitted, `country` param should be `"SG"`.

### 2d. Exa response shape inconsistency

**Tasklist assumes:** `data.results` is the array of content objects
**Exa docs show two shapes:**
- Reference page: `{ content: [{ url, text, ... }] }`
- Livecrawl/example page: `{ results: [{ text, ... }], requestId: "..." }`

**Decision:** Handle both defensively:
```ts
const items: ExaContentResult[] = data?.results ?? data?.content ?? [];
```

### 2e. Exa has per-URL error reporting via `statuses`

**Tasklist says:** Nothing — treats empty results as generic "no content" error
**Exa docs say:** A 200 response can include per-URL errors in a `statuses` array:
```json
{
  "results": [],
  "statuses": [{
    "id": "https://example.com",
    "status": "error",
    "error": { "tag": "CRAWL_NOT_FOUND", "httpStatusCode": 404 }
  }]
}
```
Error tags: `CRAWL_NOT_FOUND`, `CRAWL_TIMEOUT`, `CRAWL_LIVECRAWL_TIMEOUT`, `SOURCE_NOT_AVAILABLE`, `CRAWL_UNKNOWN_ERROR`

**Decision:** After checking `results`/`content`, also check `statuses` for errors. Surface the error tag in the tool response so the LLM knows WHY scraping failed (blocked, timeout, 404, etc).

Implementation sketch:
```ts
if (!firstResult || !firstResult.text) {
  const statuses = data?.statuses ?? [];
  const urlStatus = statuses.find((s: any) => s.id === url);
  if (urlStatus?.status === "error") {
    const tag = urlStatus.error?.tag ?? "UNKNOWN";
    return { success: false as const, error: `Scrape failed: ${tag}` };
  }
  return { success: false as const, error: "No content could be extracted from the URL." };
}
```

Add tests for: (a) `CRAWL_NOT_FOUND`, (b) `CRAWL_TIMEOUT`, (c) no statuses entry (fallback to generic error).

### 2f. Brave additional useful params

**Brave docs mention but tasklist omits:**
- `extra_snippets` (boolean) — returns additional excerpts per result. Useful for giving the LLM more context.
- `search_lang` — filter by content language
- `offset` — for pagination (max 9)

**Decision:** Don't add these to v1 tool schema. Note them here for future reference. If we want richer results later, `extra_snippets: true` is the easiest win.

---

## 3. Architectural Decisions

These were reviewed against the App Spec, architecture decisions JSON, and existing codebase patterns.

### 3a. Return shape: keep plain `{ success, ... }` (NOT envelope)

The App Spec mentions a normalized envelope (`toolResultEnvelopeSchema` with `data/error/source`), but the existing CRM and storage tools all use the plain `{ success: true, ...data } | { success: false, error }` shape.

**Decision:** Stay consistent with existing tools. Use plain shape. We'll migrate all tools to the envelope together in a future PR if needed — not piecemeal.

### 3b. URL validation: enforce `http://` or `https://` at schema level

**Decision:** Add protocol enforcement to `web_scrape`'s URL schema:
```ts
url: z
  .string()
  .url()
  .refine(
    (u) => u.startsWith("http://") || u.startsWith("https://"),
    { message: "URL must use http:// or https:// protocol" },
  )
  .describe("The URL of the webpage to read. Must be http:// or https://.")
```

Add test: non-http URL (e.g., `ftp://example.com`) should fail schema validation.

### 3c. Runner integration test: MANDATORY, not optional

**Decision:** Update `src/lib/runner/__tests__/run-agent.test.ts`:

1. Add `mockCreateWebTools` to the `vi.hoisted()` block:
```ts
mockCreateWebTools: vi.fn(),
```

2. Add it to the `vi.mock("@/lib/runner/tools", ...)` block:
```ts
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
}));
```

3. Add an assertion that `streamText` receives web tools:
```ts
it("includes web tools in streamText call", async () => {
  mockCreateWebTools.mockReturnValue({ web_search: {}, web_scrape: {} });
  // ... trigger runAgent ...
  const toolsArg = mockStreamText.mock.calls[0][0].tools;
  expect(toolsArg).toHaveProperty("web_search");
  expect(toolsArg).toHaveProperty("web_scrape");
});
```

### 3d. TDD: enforce genuine red-green

The tasklist writes test + implementation in the same step for some behaviors (test passes immediately). For proper TDD:

- Write each test FIRST
- Run it → confirm it fails (red)
- Write minimum implementation → confirm it passes (green)

Steps 5/6 in Task 1 (query params test) and step 5/6 in Task 2 (request body test) will pass immediately after step 3's implementation. That's fine — they're verification tests, not driving tests. But acknowledge in commit messages which tests drove new code vs verified existing code.

### 3e. `web_search` has no constructor args — different from CRM/storage

**Important pattern difference:** CRM tools need `(supabase, clientId)`. Storage tools need `(supabase, clientId)`. Web tools need **nothing** — they read API keys from `process.env` at execute time.

This means:
- `createWebTools()` takes zero arguments
- In `run-agent.ts`: `const webTools = createWebTools();` (no supabase/clientId)
- No tenant scoping needed (these are stateless external API calls)

### 3f. `maxSteps` may need bumping

Current `MAX_STEPS_TIER_1 = 4`. With web tools, the agent might: (1) call `web_search`, (2) call `web_scrape` on a result, (3) synthesize. That's 3 tool steps + final response = 4 steps minimum. If the agent also uses CRM tools in the same turn, 4 may be tight.

**Decision:** Don't change in PR8. Note it as a potential follow-up if agents hit the step limit during testing.

---

## 4. Existing Codebase Patterns to Match

### Tool factory pattern
```
src/lib/runner/tools/crm/contacts.ts  → createContactTools(supabase, clientId)
src/lib/runner/tools/storage/index.ts → createStorageTools(supabase, clientId)
src/lib/runner/tools/web/search.ts    → createSearchTool()        ← NEW (no args)
src/lib/runner/tools/web/scrape.ts    → createScrapeTool()         ← NEW (no args)
src/lib/runner/tools/web/index.ts     → createWebTools()           ← NEW (barrel)
```

### Barrel chain
```
tools/web/index.ts  exports  createWebTools
tools/index.ts      exports  createWebTools  (add line: export { createWebTools } from "./web";)
run-agent.ts        imports  { createCrmTools, createStorageTools, createWebTools }
```

### Runner integration (`run-agent.ts` changes)
```ts
// Import
import { createCrmTools, createStorageTools, createWebTools } from "@/lib/runner/tools";

// Type
type RunnerTools = ReturnType<typeof createCrmTools>
  & ReturnType<typeof createStorageTools>
  & ReturnType<typeof createWebTools>;

// Inside runAgent(), after storageTools:
const webTools = createWebTools();
const tools = {
  ...crmTools,
  ...storageTools,
  ...webTools,
};
```

### Test mock pattern (from `run-agent.test.ts`)
Uses `vi.hoisted()` + `vi.mock()`. Web tools mock goes in the same `vi.mock("@/lib/runner/tools", ...)` block. See section 3c above.

---

## 5. Files to Create/Modify (corrected)

### Create
| File | Purpose |
|------|---------|
| `src/lib/runner/tools/web/__tests__/search.test.ts` | Search tool tests |
| `src/lib/runner/tools/web/__tests__/scrape.test.ts` | Scrape tool tests |
| `src/lib/runner/tools/web/search.ts` | Brave Search API tool |
| `src/lib/runner/tools/web/scrape.ts` | Exa contents API tool |
| `src/lib/runner/tools/web/index.ts` | Web tools barrel |

### Modify
| File | Change |
|------|--------|
| `src/lib/runner/tools/index.ts` | Add `export { createWebTools } from "./web"` |
| `src/lib/runner/run-agent.ts` | Import + wire `createWebTools`, update `RunnerTools` type |
| `src/lib/runner/__tests__/run-agent.test.ts` | Add `mockCreateWebTools` + assertion test |
| `.env.example` | Add `BRAVE_SEARCH_API_KEY=` and `EXA_API_KEY=` |

---

## 6. Test Gaps to Add (not in original tasklist)

| Test | File | Why |
|------|------|-----|
| Non-http URL fails schema validation | `scrape.test.ts` | Security: prevent `ftp://`, `file://` etc |
| Unsupported `tbs` value passes through silently | `search.test.ts` | Documents permissive behavior |
| Exa `statuses` with `CRAWL_NOT_FOUND` | `scrape.test.ts` | Surfaces 404 errors to LLM |
| Exa `statuses` with `CRAWL_TIMEOUT` | `scrape.test.ts` | Surfaces timeout errors to LLM |
| Exa response uses `content` key instead of `results` | `scrape.test.ts` | Handles API shape inconsistency |
| Runner test: `streamText` tools include `web_search` + `web_scrape` | `run-agent.test.ts` | Catches registration regressions |
| `vi.stubEnv` cleanup (afterEach/beforeEach) | both test files | Prevents env leakage between tests |
| Default location sends `country=SG` when omitted | `search.test.ts` | Verify Singapore default, not US |

---

## 7. Tasklist Reference Path Fix

The tasklist references Tasklet contracts as:
```
references/tasklet/tools/built-in/03-web_search_web.md
references/tasklet/tools/built-in/04-web_scrape_website.md
```

The actual repo paths are:
```
roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/03-web_search_web.md
roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/04-web_scrape_website.md
```

Not a code issue — just so the dev knows where to look if they want to cross-reference.

---

## 8. Commit Plan (3 commits)

1. `feat(pr8): add web_search tool with Brave Search API` — search.ts + search.test.ts
2. `feat(pr8): add web_scrape tool with Exa API` — scrape.ts + scrape.test.ts
3. `feat(pr8): register web tools in runner` — barrel, runner wiring, runner test update, .env.example
