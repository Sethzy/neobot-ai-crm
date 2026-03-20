# Property Market Data Agent Tool (`search_market_data`)

**PR:** PR 55: Property market data agent tool (out-of-plan scope exception)
**Decisions:** None (standalone data access tool, same class as PR 8a drive-time and PR 8b calculate)
**Goal:** Give the Sunder agent instant, structured access to Singapore property market data (CEA agents, CEA transactions, HDB resale, URA private sales) via a single `search_market_data` tool.

**Architecture:** The property data lives in a **separate Supabase project** (env vars `NEXT_PUBLIC_PROPERTY_SUPABASE_URL`, `NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY`). All tables have public RLS read-only policies — no auth needed. The tool uses the existing `createPropertyPublicServerClient()` singleton from `src/lib/supabase/property-public-server.ts`. A single tool with a `dataset` discriminator routes to the correct table. Two modes: `search` (returns rows) and `stats` (returns sampled aggregates with explicit count + sample metadata). Env-gated via `isPropertySupabaseConfigured()` — returns empty `{}` if property DB isn't configured. System prompt guidance is also env-conditional (same pattern as `BROWSER_AUTOMATION_PROMPT` / `includeBrowserAutomation`). Reuses existing helpers: `median()` and `toNumber()` from `src/lib/property/utils.ts`, `buildIlikePattern()` from `src/lib/crm/postgrest-filters.ts`, `createMockSupabase()` from `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`.

**Tech Stack:** Vercel AI SDK `tool()`, Zod, Supabase PostgREST (query builder), Vitest

**Depends on:** Nothing — fully standalone.

**Important implementation notes:**
- `cea_agents` PK is `registration_no`, NOT `id`. Count queries must use `select("*", { count: "exact", head: true })`.
- `cea_agents` has NO `town` or `district` column. `hdb_resale_transactions` has NO `district`. Filters must be dataset-aware — silently ignore unsupported filters per dataset.
- For agents/transactions stats, only the exact count is needed — skip the sample query entirely.
- For HDB/URA stats, select only price columns needed for aggregation, not `*`.
- All ilike filters must go through `buildIlikePattern()` from `src/lib/crm/postgrest-filters.ts`.
- Reuse `createMockSupabase()` from `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — it supports thenable builders and sequenced results.

**Reference files (read these before starting):**
- `src/lib/runner/tools/web/scrape.ts` — canonical tool pattern (factory + Zod + const assertions)
- `src/lib/runner/tools/crm/search.ts` — search pattern (Supabase builder, ilike, filters, entity config)
- `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — **reuse this** for all market tool tests
- `src/lib/runner/tool-registry.ts` — how tools are wired into the runner
- `src/lib/runner/tools/index.ts` — barrel export pattern
- `src/lib/supabase/property-public-server.ts` — property DB client (singleton, no session)
- `src/lib/supabase/property-env.ts` — `isPropertySupabaseConfigured()` env guard
- `src/lib/property/utils.ts` — `median()`, `toNumber()`, `extractDistrictNumber()` (reuse)
- `src/lib/crm/postgrest-filters.ts` — `buildIlikePattern()` (reuse for safe ilike escaping)
- `src/lib/runner/context.ts:121-196` — `buildSystemPrompt()` — conditional section injection pattern
- `scripts/property-pipeline/migrations/001_create_property_tables.sql` — exact table schemas
- `app/market/hdb/[town]/[slug]/page.tsx:140-147` — HDB PSF formula: `price / (sqm * 10.764)`

**Property DB tables (separate Supabase project, public RLS read-only):**

| Table | PK | Has `town` | Has `district` | Price columns |
|-------|-----|-----------|---------------|---------------|
| `cea_agents` | `registration_no` | NO | NO | none |
| `cea_transactions` | `id` (bigserial) | YES | YES | none |
| `hdb_resale_transactions` | `id` (bigserial) | YES | NO | `resale_price`, `floor_area_sqm` |
| `ura_transactions` | `id` (bigserial) | NO | YES | `price`, `area_sqm`, `price_psf` (generated) |

---

## Relevant Files

### Create
- `src/lib/runner/tools/market/search-market-data.ts` — tool implementation (search mode only in Task 1)
- `src/lib/runner/tools/market/index.ts` — `createMarketTools()` factory barrel
- `src/lib/runner/tools/market/__tests__/search-market-data.test.ts` — search mode tests
- `src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts` — stats mode tests
- `src/lib/runner/tools/market/__tests__/index.test.ts` — barrel + env-gating tests

### Modify
- `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — extend shared mock helper to support `count` on query results
- `src/lib/runner/tools/index.ts` — add `export { createMarketTools } from "./market"`
- `src/lib/runner/tool-registry.ts` — wire `createMarketTools()` with env gating
- `src/lib/ai/system-prompt.ts` — add `MARKET_DATA_PROMPT` constant, update Web section only
- `src/lib/runner/context.ts` — conditional injection of `MARKET_DATA_PROMPT` (same as browser automation pattern)
- `src/lib/ai/__tests__/system-prompt.test.ts` — add Market Data assertions
- `src/lib/runner/__tests__/context.test.ts` — add market-data conditional prompt tests
- `src/lib/runner/__tests__/context-crm-config.test.ts` — add property-env mock for context assembly stability
- `src/lib/runner/__tests__/tool-registry.test.ts` — add market tools mock + env-gating tests
- `src/lib/runner/__tests__/run-agent.test.ts` — add `createMarketTools` to mock
- `src/lib/runner/__tests__/run-autopilot.test.ts` — add `createMarketTools` to mock
- `src/lib/runner/__tests__/stale-cleanup.test.ts` — add `createMarketTools` to mock
- `src/lib/runner/__tests__/serialization.test.ts` — add `createMarketTools` to mock
- `src/lib/runner/__tests__/run-agent-crm-config.test.ts` — add `createMarketTools` to mock
- `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts` — add `createMarketTools` to mock

---

## Task 1: `search_market_data` — search mode only (strict TDD)

**Files:**
- Create: `src/lib/runner/tools/market/__tests__/search-market-data.test.ts`
- Create: `src/lib/runner/tools/market/search-market-data.ts`

**IMPORTANT:** This task implements **search mode ONLY**. Zero stats code — no `computeStats`, no `STATS_SAMPLE_LIMIT`, no stats branch. The `mode` param exists in the schema but execute should throw `"Stats mode not yet implemented"` if called. Stats code arrives only after Task 2 writes failing tests.

**Step 1: Write the failing test file**

Uses `createMockSupabase` from `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` (thenable builders, sequenced results). Also spies on `buildIlikePattern` to prove safe escaping.

```typescript
// src/lib/runner/tools/market/__tests__/search-market-data.test.ts
/**
 * Tests for search_market_data tool — search mode.
 * @module lib/runner/tools/market/__tests__/search-market-data
 */
import { describe, expect, it, vi } from "vitest";

import * as postgrestFilters from "@/lib/crm/postgrest-filters";

import { createMockSupabase } from "../../crm/__tests__/mock-supabase";
import { createSearchMarketDataTool } from "../search-market-data";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createSearchMarketDataTool", () => {
  it("returns the search_market_data tool with execute function", () => {
    const { client } = createMockSupabase();
    const tools = createSearchMarketDataTool(client as never);
    expect(tools.search_market_data).toBeDefined();
    expect(tools.search_market_data.execute).toBeTypeOf("function");
  });

  describe("agents dataset — search mode", () => {
    it("searches cea_agents and returns results", async () => {
      const agents = [
        { registration_no: "R012345A", salesperson_name: "John Tan", estate_agent_name: "PropNex" },
      ];
      const { client, from } = createMockSupabase({
        cea_agents: { data: agents, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", agent_name: "John", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "agents",
        results: agents,
        count: 1,
      });
      expect(from).toHaveBeenCalledWith("cea_agents");
    });

    it("calls buildIlikePattern for agent_name filter", async () => {
      const spy = vi.spyOn(postgrestFilters, "buildIlikePattern");
      const { client } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", agent_name: "John%Tan_", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(spy).toHaveBeenCalledWith("John%Tan_");
      spy.mockRestore();
    });

    it("applies exact match on registration number", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [{ registration_no: "R012345A" }], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", agent_reg_no: "R012345A", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.eq).toHaveBeenCalledWith("registration_no", "R012345A");
    });

    it("normalizes lowercase registration number to uppercase", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", agent_reg_no: "r012345a", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.eq).toHaveBeenCalledWith("registration_no", "R012345A");
    });

    it("silently ignores town filter on agents (column does not exist)", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", town: "BEDOK", mode: "search" },
        EXECUTION_OPTIONS,
      );

      // town should NOT be applied — cea_agents has no town column
      expect(builders.cea_agents.eq).not.toHaveBeenCalledWith("town", expect.anything());
    });

    it("silently ignores district filter on agents (column does not exist)", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", district: "15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.eq).not.toHaveBeenCalledWith("district", expect.anything());
    });
  });

  describe("transactions dataset — search mode", () => {
    it("searches cea_transactions with town filter (uppercased)", async () => {
      const txns = [{ id: 1, town: "BEDOK", transaction_date: "2025-06-15" }];
      const { client, from, builders } = createMockSupabase({
        cea_transactions: { data: txns, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "transactions", town: "bedok", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({ success: true, dataset: "transactions", results: txns, count: 1 });
      expect(from).toHaveBeenCalledWith("cea_transactions");
      expect(builders.cea_transactions.eq).toHaveBeenCalledWith("town", "BEDOK");
    });

    it("applies date range filters", async () => {
      const { client, builders } = createMockSupabase({
        cea_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "transactions", date_from: "2025-01-01", date_to: "2025-12-31", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_transactions.gte).toHaveBeenCalledWith("transaction_date", "2025-01-01");
      expect(builders.cea_transactions.lte).toHaveBeenCalledWith("transaction_date", "2025-12-31");
    });

    it("returns error when date_from is after date_to", async () => {
      const { client } = createMockSupabase({
        cea_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "transactions", date_from: "2025-12-31", date_to: "2025-01-01", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "date_from must be on or before date_to",
      });
    });
  });

  describe("hdb dataset — search mode", () => {
    it("searches hdb_resale_transactions with town and flat_type", async () => {
      const hdb = [{ id: 1, town: "BEDOK", flat_type: "4 ROOM", resale_price: 500000 }];
      const { client, from } = createMockSupabase({
        hdb_resale_transactions: { data: hdb, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", flat_type: "4 ROOM", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({ success: true, dataset: "hdb", results: hdb, count: 1 });
      expect(from).toHaveBeenCalledWith("hdb_resale_transactions");
    });

    it("silently ignores district filter on hdb (column does not exist)", async () => {
      const { client, builders } = createMockSupabase({
        hdb_resale_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "hdb", district: "15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.hdb_resale_transactions.eq).not.toHaveBeenCalledWith("district", expect.anything());
    });
  });

  describe("ura dataset — search mode", () => {
    it("searches ura_transactions with district (normalized to zero-padded)", async () => {
      const ura = [{ id: 1, project: "THE SAIL", district: "01", price: 1800000 }];
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: ura, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", district: "1", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.eq).toHaveBeenCalledWith("district", "01");
    });

    it("extracts district number from 'District 15' format", async () => {
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", district: "District 15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.eq).toHaveBeenCalledWith("district", "15");
    });

    it("searches ura by project name via buildIlikePattern", async () => {
      const spy = vi.spyOn(postgrestFilters, "buildIlikePattern");
      const { client } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", project: "THE SAIL", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(spy).toHaveBeenCalledWith("THE SAIL");
      spy.mockRestore();
    });

    it("passes the escaped ilike pattern into the query builder", async () => {
      const spy = vi.spyOn(postgrestFilters, "buildIlikePattern").mockReturnValue("%escaped%");
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", project: "50% off_", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.ilike).toHaveBeenCalledWith("project", "%escaped%");
      spy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("returns error on Supabase query failure", async () => {
      const { client } = createMockSupabase({
        cea_agents: { data: null, error: { message: "relation does not exist" } },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "relation does not exist" });
    });
  });

  describe("limit", () => {
    it("defaults to 20 results", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.limit).toHaveBeenCalledWith(20);
    });

    it("respects custom limit", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", mode: "search", limit: 5 },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.limit).toHaveBeenCalledWith(5);
    });
  });

  describe("stats mode stub", () => {
    it("returns not-yet-implemented error for stats mode", async () => {
      const { client } = createMockSupabase();
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "Stats mode not yet implemented" });
    });
  });
});
```

**Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-market-data.test.ts
```

Expected: **FAIL** — `Cannot find module '../search-market-data'`

**Step 3: Write the search-mode-only implementation**

The implementation must have:
- No `computeStats` function
- No `STATS_SAMPLE_LIMIT` constant
- No stats branch — just `return { success: false, error: "Stats mode not yet implemented" }`
- Dataset-aware filter map — only applies filters to datasets that have the column
- Uses `buildIlikePattern()` for all text search filters
- Uses `extractDistrictNumber()` for district normalization
- Uppercases town
- Uppercases `agent_reg_no`
- Returns `{ success: false, error: "date_from must be on or before date_to" }` for inverted date ranges

```typescript
// src/lib/runner/tools/market/search-market-data.ts
/**
 * Property market data search tool — instant access to Singapore property DB.
 * Queries CEA agents, CEA transactions, HDB resale, and URA private sales.
 * @module lib/runner/tools/market/search-market-data
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildIlikePattern } from "@/lib/crm/postgrest-filters";
import { extractDistrictNumber } from "@/lib/property/utils";

/** Datasets available for search. */
const DATASETS = ["agents", "transactions", "hdb", "ura"] as const;
type Dataset = (typeof DATASETS)[number];

/** Default result limit for search mode. */
const DEFAULT_LIMIT = 20;
/** Maximum result limit for search mode. */
const MAX_LIMIT = 100;

/** Per-dataset configuration: table name, date column, default ordering, and which columns exist. */
const DATASET_CONFIG: Record<
  Dataset,
  {
    table: string;
    dateColumn: string | null;
    orderBy: { column: string; ascending: boolean };
    hasTown: boolean;
    hasDistrict: boolean;
  }
> = {
  agents: {
    table: "cea_agents",
    dateColumn: null,
    orderBy: { column: "salesperson_name", ascending: true },
    hasTown: false,
    hasDistrict: false,
  },
  transactions: {
    table: "cea_transactions",
    dateColumn: "transaction_date",
    orderBy: { column: "transaction_date", ascending: false },
    hasTown: true,
    hasDistrict: true,
  },
  hdb: {
    table: "hdb_resale_transactions",
    dateColumn: "month",
    orderBy: { column: "month", ascending: false },
    hasTown: true,
    hasDistrict: false,
  },
  ura: {
    table: "ura_transactions",
    dateColumn: "contract_date",
    orderBy: { column: "contract_date", ascending: false },
    hasTown: false,
    hasDistrict: true,
  },
};

/** ISO date format: YYYY-MM-DD */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const inputSchema = z.object({
  dataset: z
    .enum(DATASETS)
    .describe(
      "Which dataset to query. agents = CEA agent registry (37K agents). " +
      "transactions = CEA residential transaction records (1.3M). " +
      "hdb = HDB resale transactions (970K). " +
      "ura = URA private residential sales (500K).",
    ),
  mode: z
    .enum(["search", "stats"])
    .default("search")
    .describe(
      "search = return individual records (paginated). " +
      "stats = return aggregate statistics (count, median price, avg PSF, price range). " +
      "Stats are computed from a sample of up to 10,000 matching rows; exact total count is always accurate.",
    ),
  town: z.string().optional().describe("Town name filter (exact match, auto-uppercased). For transactions and hdb datasets. E.g. 'BEDOK'."),
  district: z.string().optional().describe("District filter. For transactions and ura datasets. Accepts '01', '9', 'District 15'. Auto-normalizes."),
  date_from: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD").optional().describe("Start date (YYYY-MM-DD). For datasets with transaction dates."),
  date_to: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD").optional().describe("End date (YYYY-MM-DD). For datasets with transaction dates."),
  agent_reg_no: z.string().optional().describe("CEA registration number (exact match). For agents and transactions."),
  agent_name: z.string().optional().describe("Agent name (partial match). For agents dataset."),
  agency_name: z.string().optional().describe("Agency name (partial match). For agents dataset."),
  property_type: z.string().optional().describe("Property type (exact match). For transactions and ura."),
  flat_type: z.string().optional().describe("HDB flat type (exact match). E.g. '4 ROOM'. For hdb dataset."),
  street: z.string().optional().describe("Street name (partial match). For hdb and ura datasets."),
  project: z.string().optional().describe("Project name (partial match). For ura dataset."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
    .describe(`Max results for search mode. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`),
});

/**
 * Normalize a district input to zero-padded two-digit string.
 * Accepts: "9" → "09", "15" → "15", "District 15" → "15"
 */
function normalizeDistrict(input: string): string | null {
  const num = extractDistrictNumber(input);
  if (num === null) return null;
  return num.toString().padStart(2, "0");
}

function normalizeAgentRegNo(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Apply dataset-aware filters to a Supabase query builder.
 * Silently ignores filters that don't apply to the given dataset.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(qb: any, dataset: Dataset, params: Record<string, string | undefined>) {
  const config = DATASET_CONFIG[dataset];

  // Universal filters — only if the dataset has the column
  if (params.town && config.hasTown) {
    qb = qb.eq("town", params.town.toUpperCase());
  }
  if (params.district && config.hasDistrict) {
    const normalized = normalizeDistrict(params.district);
    if (normalized) qb = qb.eq("district", normalized);
  }
  if (params.date_from && config.dateColumn) {
    qb = qb.gte(config.dateColumn, params.date_from);
  }
  if (params.date_to && config.dateColumn) {
    qb = qb.lte(config.dateColumn, params.date_to);
  }

  // Dataset-specific filters
  if (params.agent_reg_no) {
    const normalized = normalizeAgentRegNo(params.agent_reg_no);
    if (dataset === "agents") qb = qb.eq("registration_no", normalized);
    else if (dataset === "transactions") qb = qb.eq("salesperson_reg_num", normalized);
  }
  if (params.agent_name && dataset === "agents") {
    qb = qb.ilike("salesperson_name", buildIlikePattern(params.agent_name));
  }
  if (params.agency_name && dataset === "agents") {
    qb = qb.ilike("estate_agent_name", buildIlikePattern(params.agency_name));
  }
  if (params.property_type && (dataset === "transactions" || dataset === "ura")) {
    qb = qb.eq("property_type", params.property_type);
  }
  if (params.flat_type && dataset === "hdb") {
    qb = qb.eq("flat_type", params.flat_type);
  }
  if (params.street) {
    if (dataset === "hdb") qb = qb.ilike("street_name", buildIlikePattern(params.street));
    else if (dataset === "ura") qb = qb.ilike("street", buildIlikePattern(params.street));
  }
  if (params.project && dataset === "ura") {
    qb = qb.ilike("project", buildIlikePattern(params.project));
  }

  return qb;
}

/**
 * Creates the search_market_data tool.
 * @param supabase - Property Supabase client (from createPropertyPublicServerClient)
 */
export function createSearchMarketDataTool(supabase: SupabaseClient) {
  const search_market_data = tool({
    description:
      "Search Singapore property market data — CEA agent registry, residential transaction records, " +
      "HDB resale prices, and URA private sales. Use mode 'search' for individual records or " +
      "'stats' for aggregate statistics (count, median price, avg PSF). " +
      "Instant and structured — prefer this over web search or browsing for Singapore property market questions.",
    inputSchema,
    execute: async ({ dataset, mode, town, district, date_from, date_to, agent_reg_no, agent_name, agency_name, property_type, flat_type, street, project, limit }) => {
      try {
        // Stats mode — not yet implemented (added in Task 2)
        if (mode === "stats") {
          return { success: false as const, error: "Stats mode not yet implemented" };
        }

        if (date_from && date_to && date_from > date_to) {
          return { success: false as const, error: "date_from must be on or before date_to" };
        }

        const config = DATASET_CONFIG[dataset];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let queryBuilder = (supabase as any).from(config.table).select("*");

        queryBuilder = applyFilters(queryBuilder, dataset, {
          town, district, date_from, date_to, agent_reg_no,
          agent_name, agency_name, property_type, flat_type, street, project,
        });

        queryBuilder = queryBuilder.order(config.orderBy.column, {
          ascending: config.orderBy.ascending,
        });

        const maxResults = limit ?? DEFAULT_LIMIT;
        const { data, error } = await queryBuilder.limit(maxResults);

        if (error) return { success: false as const, error: error.message };

        const results = data ?? [];
        return { success: true as const, dataset, results, count: results.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown market data error";
        return { success: false as const, error: message };
      }
    },
  });

  return { search_market_data };
}
```

**Step 4: Run the tests**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-market-data.test.ts
```

Expected: **All search mode tests PASS**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/market/search-market-data.ts src/lib/runner/tools/market/__tests__/search-market-data.test.ts
git commit -m "feat(pr55): search_market_data tool — search mode only, dataset-aware filters, TDD"
```

---

## Task 2: Stats mode — failing tests first, then implement (strict TDD)

**Files:**
- Create: `src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts`
- Modify: `src/lib/runner/tools/market/search-market-data.ts`

**Step 0: Extend the shared CRM Supabase mock to support `count`**

Modify `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` before writing stats tests. Add `count?: number | null` to `QueryResult`, and make the builder's `then()` resolve with `{ data, error, count }`.

Why this must happen first:
- The revised stats tests depend on `count` for exact totals.
- Reusing the shared helper stays DRY, but only if the helper actually models the contract the feature uses.

**Step 1: Write stats tests (they MUST fail against the stub)**

Uses `createMockSupabase` with sequenced results: first `from()` = sample query, second `from()` = count query.

For agents/transactions: the sample query should NOT be called (count-only path).

```typescript
// src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts
/**
 * Tests for search_market_data tool — stats mode.
 * Written BEFORE stats implementation (TDD red phase).
 * @module lib/runner/tools/market/__tests__/search-market-data-stats
 */
import { describe, expect, it } from "vitest";

import { createMockSupabase } from "../../crm/__tests__/mock-supabase";
import { createSearchMarketDataTool } from "../search-market-data";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_market_data — stats mode", () => {
  describe("count-only datasets (agents, transactions)", () => {
    it("returns agent count without fetching rows", async () => {
      // Only ONE from() call needed — count query, no sample query
      const { client, from } = createMockSupabase({
        cea_agents: { data: null, error: null, count: 42 },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", agency_name: "ERA", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "agents",
        stats: { totalAgents: 42 },
        totalMatching: 42,
      });
      // Should call from() only ONCE (count-only, no sample fetch)
      expect(from).toHaveBeenCalledTimes(1);
    });

    it("returns transaction count without fetching rows", async () => {
      const { client, from } = createMockSupabase({
        cea_transactions: { data: null, error: null, count: 1234 },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "transactions", agent_reg_no: "R012345A", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "transactions",
        stats: { totalTransactions: 1234 },
        totalMatching: 1234,
      });
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe("HDB stats (includes PSF — symmetric with URA)", () => {
    it("returns price + PSF stats for hdb dataset", async () => {
      const hdbSample = [
        { resale_price: 400000, floor_area_sqm: 90 },
        { resale_price: 500000, floor_area_sqm: 95 },
        { resale_price: 600000, floor_area_sqm: 100 },
      ];
      // Sequenced: first from() = sample (select price cols), second from() = count
      const { client } = createMockSupabase({
        hdb_resale_transactions: [
          { data: hdbSample, error: null },
          { data: null, error: null, count: 3 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.dataset).toBe("hdb");
      expect(result.totalMatching).toBe(3);
      expect(result.stats.totalTransactions).toBe(3);
      expect(result.stats.medianPrice).toBe(500000);
      expect(result.stats.avgPrice).toBe(500000);
      expect(result.stats.priceRange).toEqual({ min: 400000, max: 600000 });
      // HDB PSF computed from resale_price / (floor_area_sqm * 10.764)
      expect(result.stats.avgPsf).toBeTypeOf("number");
      expect(result.stats.avgPsf).toBeGreaterThan(0);
      expect(result.stats.medianPsf).toBeTypeOf("number");
    });

    it("selects only price columns for HDB sample (not *)", async () => {
      const { client, builders } = createMockSupabase({
        hdb_resale_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "hdb", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      // First from() call's select should be price columns, not "*"
      expect(builders.hdb_resale_transactions.select).toHaveBeenCalledWith(
        "resale_price, floor_area_sqm",
      );
    });
  });

  describe("URA stats", () => {
    it("returns price + PSF stats for ura dataset", async () => {
      const uraSample = [
        { price: 1000000, price_psf: 1500 },
        { price: 2000000, price_psf: 2000 },
      ];
      const { client } = createMockSupabase({
        ura_transactions: [
          { data: uraSample, error: null },
          { data: null, error: null, count: 2 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", district: "15", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.stats).toEqual({
        totalTransactions: 2,
        medianPrice: 1500000,
        avgPrice: 1500000,
        priceRange: { min: 1000000, max: 2000000 },
        avgPsf: 1750,
        medianPsf: 1750,
      });
    });

    it("selects only price columns for URA sample (not *)", async () => {
      const { client, builders } = createMockSupabase({
        ura_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.select).toHaveBeenCalledWith("price, price_psf");
    });
  });

  describe("sampling metadata", () => {
    it("includes sampled flag when total exceeds sample limit", async () => {
      const { client } = createMockSupabase({
        ura_transactions: [
          { data: [{ price: 1000000, price_psf: 1500 }], error: null },
          { data: null, error: null, count: 500_000 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.totalMatching).toBe(500_000);
      expect(result.sampled).toBe(true);
      expect(result.sampleSize).toBe(10_000);
    });

    it("omits sampled flag when total is within limit", async () => {
      const { client } = createMockSupabase({
        hdb_resale_transactions: [
          { data: [{ resale_price: 500000, floor_area_sqm: 90 }], error: null },
          { data: null, error: null, count: 1 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.totalMatching).toBe(1);
      expect(result).not.toHaveProperty("sampled");
      expect(result).not.toHaveProperty("sampleSize");
    });
  });

  describe("empty results", () => {
    it("handles empty results for ura", async () => {
      const { client } = createMockSupabase({
        ura_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", district: "99", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.stats).toEqual({
        totalTransactions: 0,
        medianPrice: null,
        avgPrice: null,
        priceRange: null,
        avgPsf: null,
        medianPsf: null,
      });
    });
  });
});
```

**Step 2: Run the stats tests — confirm they fail**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts
```

Expected: **FAIL** — stub returns `{ success: false, error: "Stats mode not yet implemented" }`

**Step 3: Implement stats mode in `search-market-data.ts`**

Replace the stats stub with the real implementation. Add these imports at the top:

```typescript
import { extractDistrictNumber, median, toNumber } from "@/lib/property/utils";
```

(Update the existing `extractDistrictNumber` import to include `median` and `toNumber`.)

Add constants after `MAX_LIMIT`:

```typescript
/** Maximum rows fetched for stats aggregation (sampled). */
const STATS_SAMPLE_LIMIT = 10_000;
/** Sqft per sqm conversion factor. */
const SQFT_PER_SQM = 10.764;
/** Datasets that only need a count (no price data). */
const COUNT_ONLY_DATASETS: Dataset[] = ["agents", "transactions"];
/** Select columns for stats sample queries per dataset. */
const STATS_SELECT_COLUMNS: Partial<Record<Dataset, string>> = {
  hdb: "resale_price, floor_area_sqm",
  ura: "price, price_psf",
};
```

Add the `computeStats` function:

```typescript
function computeStats(records: Record<string, unknown>[], dataset: Dataset) {
  if (dataset === "hdb") {
    const prices = records.map((r) => toNumber(r.resale_price as number | string | null)).filter((p): p is number => p !== null && p > 0);
    const psfValues = records.map((r) => {
      const price = toNumber(r.resale_price as number | string | null);
      const sqm = toNumber(r.floor_area_sqm as number | string | null);
      if (price === null || sqm === null || sqm <= 0) return null;
      return Math.round(price / (sqm * SQFT_PER_SQM));
    }).filter((p): p is number => p !== null);
    const sorted = [...prices].sort((a, b) => a - b);
    return {
      totalTransactions: records.length,
      medianPrice: median(prices),
      avgPrice: prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
      priceRange: sorted.length > 0 ? { min: sorted[0], max: sorted[sorted.length - 1] } : null,
      medianPsf: median(psfValues) !== null ? Math.round(median(psfValues)!) : null,
      avgPsf: psfValues.length > 0 ? Math.round(psfValues.reduce((s, p) => s + p, 0) / psfValues.length) : null,
    };
  }
  // URA
  const prices = records.map((r) => toNumber(r.price as number | string | null)).filter((p): p is number => p !== null && p > 0);
  const psfValues = records.map((r) => toNumber(r.price_psf as number | string | null)).filter((p): p is number => p !== null && p > 0);
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    totalTransactions: records.length,
    medianPrice: median(prices),
    avgPrice: prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
    priceRange: sorted.length > 0 ? { min: sorted[0], max: sorted[sorted.length - 1] } : null,
    medianPsf: median(psfValues) !== null ? Math.round(median(psfValues)!) : null,
    avgPsf: psfValues.length > 0 ? Math.round(psfValues.reduce((s, p) => s + p, 0) / psfValues.length) : null,
  };
}
```

Replace the stats stub in `execute` with:

```typescript
        if (mode === "stats") {
          const filterParams = { town, district, date_from, date_to, agent_reg_no, agent_name, agency_name, property_type, flat_type, street, project };

          // Count-only datasets — skip sample query entirely
          if (COUNT_ONLY_DATASETS.includes(dataset)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let countBuilder = (supabase as any)
              .from(config.table)
              .select("*", { count: "exact", head: true });
            countBuilder = applyFilters(countBuilder, dataset, filterParams);
            const { count, error } = await countBuilder;
            if (error) return { success: false as const, error: error.message };
            const total = count ?? 0;
            const statsKey = dataset === "agents" ? "totalAgents" : "totalTransactions";
            return {
              success: true as const,
              dataset,
              stats: { [statsKey]: total },
              totalMatching: total,
            };
          }

          // HDB/URA — fetch sample (price columns only) + exact count in parallel
          const selectColumns = STATS_SELECT_COLUMNS[dataset] ?? "*";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let sampleBuilder = (supabase as any).from(config.table).select(selectColumns);
          sampleBuilder = applyFilters(sampleBuilder, dataset, filterParams);
          sampleBuilder = sampleBuilder.order(config.orderBy.column, { ascending: config.orderBy.ascending });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let countBuilder = (supabase as any)
            .from(config.table)
            .select("*", { count: "exact", head: true });
          countBuilder = applyFilters(countBuilder, dataset, filterParams);

          const [sampleResult, countResult] = await Promise.all([
            sampleBuilder.limit(STATS_SAMPLE_LIMIT),
            countBuilder,
          ]);

          if (sampleResult.error) return { success: false as const, error: sampleResult.error.message };
          if (countResult.error) return { success: false as const, error: countResult.error.message };

          const records = (sampleResult.data ?? []) as Record<string, unknown>[];
          const totalMatching = countResult.count ?? records.length;
          const sampled = totalMatching > STATS_SAMPLE_LIMIT;

          return {
            success: true as const,
            dataset,
            stats: computeStats(records, dataset),
            totalMatching,
            ...(sampled ? { sampled: true, sampleSize: STATS_SAMPLE_LIMIT } : {}),
          };
        }
```

**Step 4: Run all stats tests — confirm they pass**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts
```

Expected: **All PASS**

**Step 5: Run search tests too — confirm no regressions**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-market-data.test.ts
```

Expected: **All PASS** (the stats stub test should now be updated or removed — it served its TDD purpose. Replace it with a simple "stats mode returns success" smoke test.)

**Step 6: Commit**

```bash
git add src/lib/runner/tools/market/search-market-data.ts src/lib/runner/tools/market/__tests__/search-market-data-stats.test.ts src/lib/runner/tools/market/__tests__/search-market-data.test.ts
git commit -m "feat(pr55): stats mode — count-only for agents/txns, price+PSF for HDB/URA, sampling metadata"
```

---

## Task 3: Barrel, tool-registry wiring, ALL mock updates

**Files:**
- Create: `src/lib/runner/tools/market/index.ts`
- Create: `src/lib/runner/tools/market/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/__tests__/context-crm-config.test.ts`
- Modify: `src/lib/runner/__tests__/tool-registry.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/runner/__tests__/run-autopilot.test.ts`
- Modify: `src/lib/runner/__tests__/stale-cleanup.test.ts`
- Modify: `src/lib/runner/__tests__/serialization.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent-crm-config.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts`

**Step 1: Create barrel** — same as previous revision (no changes needed).

**Step 2: Add barrel export to `src/lib/runner/tools/index.ts`** — add `export { createMarketTools } from "./market";`.

**Step 3: Wire into `src/lib/runner/tool-registry.ts`** — add import for `createMarketTools` and `isPropertySupabaseConfigured`. Add env-gated `marketTools` creation. Spread into both subagent and main return blocks.

**Step 4: Update ALL 7 test files that mock `@/lib/runner/tools`.**

For each file, add `createMarketTools: mockCreateMarketTools` (or `vi.fn()`) to the `vi.mock("@/lib/runner/tools")` block. Also add a mock for `@/lib/supabase/property-env`:

```typescript
vi.mock("@/lib/supabase/property-env", () => ({
  isPropertySupabaseConfigured: vi.fn().mockReturnValue(false),
}));
```

The 7 files:
1. `src/lib/runner/__tests__/tool-registry.test.ts` — **also add env-gating tests** (see below)
2. `src/lib/runner/__tests__/run-agent.test.ts`
3. `src/lib/runner/__tests__/run-autopilot.test.ts`
4. `src/lib/runner/__tests__/stale-cleanup.test.ts`
5. `src/lib/runner/__tests__/serialization.test.ts`
6. `src/lib/runner/__tests__/run-agent-crm-config.test.ts`
7. `src/lib/runner/__tests__/run-agent-tool-error-path.test.ts`

**Step 5: Add env-gating tests to `tool-registry.test.ts`**

```typescript
  it("includes market tools when property supabase is configured", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    const tools = createRunnerTools("supabase" as never, "client-id", "thread-id");
    expect(tools).toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).toHaveBeenCalledOnce();
  });

  it("omits market tools when property supabase is not configured", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(false);
    const tools = createRunnerTools("supabase" as never, "client-id", "thread-id");
    expect(tools).not.toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).not.toHaveBeenCalled();
  });

  it("includes market tools for subagents when configured", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    const tools = createRunnerTools("supabase" as never, "client-id", "thread-id", { isSubagent: true });
    expect(tools).toHaveProperty("search_market_data");
  });
```

**Step 6: Write barrel test** — same as previous revision.

**Step 6a: Update context-layer tests for env-gated Market Data prompt**

Because Task 4 changes `context.ts`, update:
- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/runner/__tests__/context-crm-config.test.ts`

Add a mock for `@/lib/supabase/property-env` and new tests that prove:
- `assembleContext()` does NOT include `<market-data>` by default
- `assembleContext()` includes `<market-data>` when `includeMarketData: true`
- `assembleSystemOnly()` follows the same rule
- CRM setup mode remains stable when property env is mocked off

These tests are mandatory. `context.ts` is the actual injection point; `system-prompt.test.ts` alone is not enough.

**Step 7: Run all affected tests**

```bash
npx vitest run src/lib/runner/tools/market/ src/lib/runner/__tests__/
```

Expected: **All PASS**

**Step 8: Type check**

```bash
npx tsc --noEmit
```

**Step 9: Commit**

```bash
git add src/lib/runner/tools/market/index.ts src/lib/runner/tools/market/__tests__/index.test.ts src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts src/lib/runner/__tests__/
git commit -m "feat(pr55): barrel + tool-registry wiring + all 7 runner test mock updates"
```

---

## Task 4: System prompt + context assembly (conditional) + prompt tests

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/__tests__/context-crm-config.test.ts`

**Step 1: Add `MARKET_DATA_PROMPT` constant to system-prompt.ts**

Export a new constant (like `BROWSER_AUTOMATION_PROMPT`):

```typescript
export const MARKET_DATA_PROMPT = `<market-data>
You have access to Singapore property market data via search_market_data. Use it for historical property market questions — it's instant and structured.

Datasets: agents (CEA registry, 37K), transactions (CEA deals, 1.3M), hdb (HDB resale, 970K), ura (URA private, 500K).
- Use mode "stats" for aggregate questions (average price, median PSF, transaction volume).
- Use mode "search" to find specific records (agent profile, recent sales in a district).
- Stats on large datasets are computed from a 10K sample. The exact total count is always accurate.
- Prefer this over web search or browsing for historical Singapore property data.
</market-data>`;
```

**Step 2: Update the "Web:" section in `<tool-usage>`**

Change:

```
- Use web search for market data, recent news, regulatory info, or anything the user needs that isn't in their CRM.
```

To:

```
- Use web search for live news, recent regulatory updates, or anything outside CRM and market data.
```

**Step 3: Do NOT update the static `<tool-usage>` category list in `SYSTEM_PROMPT`**

Keep the base category list unchanged. Market Data capability is env-gated and must only appear when property Supabase is configured.

Why:
- `SYSTEM_PROMPT` is unconditional.
- `MARKET_DATA_PROMPT` is conditional.
- Adding "market data" to the unconditional base prompt would tell non-property deployments they have a tool they do not actually have.

**Step 4: Gate `MARKET_DATA_PROMPT` in `context.ts`**

Follow the exact same pattern as `includeBrowserAutomation` / `BROWSER_AUTOMATION_PROMPT`.

In `context.ts`, add a new option `includeMarketData?: boolean` to `BuildSystemPromptOptions` and all interfaces that pass it through. Import `MARKET_DATA_PROMPT` from `system-prompt.ts`. In `buildSystemPrompt()`, after the browser automation conditional:

```typescript
  if (includeMarketData) {
    sections.push(MARKET_DATA_PROMPT);
  }
```

Set `includeMarketData` at the real call sites:
- `run-agent.ts` → `assembleContext(...)`
- `run-autopilot.ts` → `assembleContext(...)`
- `tools/subagents/run-subagent.ts` → `assembleSystemOnly(...)`

Do not call `isPropertySupabaseConfigured()` inside `assembleContext()` or `assembleSystemOnly()` themselves. Keep env lookup at the runner boundary, same pattern as browser automation.

**Step 5: Update prompt tests**

In `src/lib/ai/__tests__/system-prompt.test.ts`:

Do NOT assert that `SYSTEM_PROMPT` always contains "market data". That capability is conditional and should be tested at the context assembly layer instead.

Add MARKET_DATA_PROMPT tests:

```typescript
describe("MARKET_DATA_PROMPT", () => {
  it("exports a non-empty string", () => {
    expect(typeof MARKET_DATA_PROMPT).toBe("string");
    expect(MARKET_DATA_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions all four datasets", () => {
    expect(MARKET_DATA_PROMPT).toContain("agents");
    expect(MARKET_DATA_PROMPT).toContain("transactions");
    expect(MARKET_DATA_PROMPT).toContain("hdb");
    expect(MARKET_DATA_PROMPT).toContain("ura");
  });

  it("mentions search_market_data tool name", () => {
    expect(MARKET_DATA_PROMPT).toContain("search_market_data");
  });

  it("documents sampling behavior", () => {
    expect(MARKET_DATA_PROMPT).toContain("10K sample");
  });
});
```

Add web-vs-market disambiguation test:

```typescript
  it("web section no longer says 'for market data'", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/web search for market data/i);
  });
```

**Step 6: Run prompt + context tests**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
npx vitest run src/lib/runner/__tests__/context.test.ts
npx vitest run src/lib/runner/__tests__/context-crm-config.test.ts
```

Expected: **All PASS**

**Step 7: Run full suite**

```bash
npx vitest run
```

Expected: **All PASS**

**Step 8: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/runner/context.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr55): conditional MARKET_DATA_PROMPT in system prompt + context assembly"
```

---

## Verification Checklist

```bash
# Type check
npx tsc --noEmit

# Market tool tests
npx vitest run src/lib/runner/tools/market/

# System prompt tests
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts

# Context assembly tests (market-data gating)
npx vitest run src/lib/runner/__tests__/context.test.ts
npx vitest run src/lib/runner/__tests__/context-crm-config.test.ts

# Registry + runner tests (all 7 files)
npx vitest run src/lib/runner/__tests__/

# Full suite — no regressions
npx vitest run
```

Manual smoke test (requires property DB env vars in `.env.local`):
1. `npm run dev`
2. Chat: "What's the average price of HDB flats in Bedok?" → `search_market_data { dataset: "hdb", town: "BEDOK", mode: "stats" }` → price + PSF stats with `totalMatching`
3. Chat: "Show me the last 5 URA transactions in District 9" → `search_market_data { dataset: "ura", district: "9", mode: "search", limit: 5 }` → district normalized to "09", 5 records returned
4. Confirm `sampled: true` on broad URA/HDB queries
5. Remove property env vars → restart → confirm tool is absent and Market Data prompt section is absent
