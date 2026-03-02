# PR 6: CRM Tools for the Agent — Implementation Plan

**Goal:** Implement 10 CRM tools (3 contact + 3 deal + 1 interaction + 3 task) that the AI agent calls via `streamText()` to read/write CRM data through Supabase.

**Architecture:** Factory pattern — `createCrmTools(supabase, clientId)` returns all 10 tools as an object. Each tool uses the Vercel AI SDK `tool()` function with a Zod input schema (`inputSchema`), executes a Supabase PostgREST query, and returns `{ success: true, <entity>: data }` or `{ success: false, error: string }`. The factory receives an authenticated Supabase client (RLS-scoped) and a `clientId` string (injected into inserts, never exposed to the LLM). All tools are registered in the runner's `streamText({ tools })` call, with step limit set via `stopWhen: stepCountIs(8)`.

**Tech Stack:** Vercel AI SDK v6 (`tool` from `ai`), Zod, Supabase PostgREST client, Vitest

**Architecture Decisions:** `TOOL-03` (12 tool categories — CRM is category 1), `TOOL-09` (search/extraction via direct API), `TOOL-01` (internal tools use strict Zod schemas)

**App Spec Sections:** §6.2 (tool definitions), §10.1 (CRM tables), §9 (safety model). Scope note: this PR implements tools only; approval enforcement follows `SAFETY-04` in the runner/approval layer.

---

## Prerequisites

| PR | What it creates | Why PR 6 needs it |
|----|----------------|-------------------|
| PR 3 | `clients` table, `update_updated_at_column()` trigger | All CRM tables FK to `clients.client_id` |
| PR 4 | `src/lib/runner/run-agent.ts` with `streamText()` call | Tool registration point and step-limit config (`stopWhen`) |
| PR 5 | CRM migrations (`contacts`, `deals`, `interactions`, `crm_tasks`, `crm_config`) + `src/lib/crm/schemas.ts` with Zod schemas + regenerated `database.ts` | Tables must exist; tool params import enum values from schemas |

**Verify before starting:** `src/lib/crm/schemas.ts` exists and exports `contactTypeValues`, `dealStageValues`, `interactionTypeValues`, `crmTaskStatusValues`.

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task Overview

| Task | Component | Files Created | Tests | Depends On |
|------|-----------|---------------|-------|------------|
| 1 | Supabase test mock helper | 1 source + 1 test | 4 tests | — |
| 2 | Contact tools (search, create, update) | 1 source + 1 test | 8 tests | Task 1 |
| 3 | Deal tools (search, create, update) | 1 source + 1 test | 8 tests | Task 1 |
| 4 | Interaction tool (create) | 1 source + 1 test | 3 tests | Task 1 |
| 5 | CRM task tools (search, create, update) | 1 source + 1 test | 10 tests | Task 1 |
| 6 | Barrel export + runner registration | 2 source + 1 modify | — | Tasks 2-5 |
| 7 | Search filter hardening + contract tests | 1 source + 2 tests | 4+ tests | Tasks 2-3 |

**Total: at least 14 files changed, with expanded test coverage beyond the original 33-test baseline.**

---

## Relevant Files

**Create:**
- `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — Supabase query builder mock
- `src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts` — Mock helper tests
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts` — Contact tool tests
- `src/lib/runner/tools/crm/__tests__/deals.test.ts` — Deal tool tests
- `src/lib/runner/tools/crm/__tests__/filter-utils.test.ts` — Filter helper tests
- `src/lib/runner/tools/crm/__tests__/interactions.test.ts` — Interaction tool tests
- `src/lib/runner/tools/crm/__tests__/postgrest-query.test.ts` — Real Supabase query serialization contract tests
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts` — Task tool tests
- `src/lib/runner/tools/crm/contacts.ts` — search_contacts, create_contact, update_contact
- `src/lib/runner/tools/crm/deals.ts` — search_deals, create_deal, update_deal
- `src/lib/runner/tools/crm/filter-utils.ts` — shared PostgREST search filter escaping
- `src/lib/runner/tools/crm/interactions.ts` — create_interaction
- `src/lib/runner/tools/crm/tasks.ts` — search_tasks, create_task, update_task
- `src/lib/runner/tools/crm/index.ts` — CRM barrel export
- `src/lib/runner/tools/index.ts` — Top-level tools barrel export

**Modify:**
- `src/lib/runner/run-agent.ts` — Register CRM tools in `streamText()`, set `stopWhen: stepCountIs(8)`

**Reference (read-only):**
- `src/lib/crm/schemas.ts` — PR 5 Zod schemas with enum values
- `src/types/database.ts` — Supabase-generated types (must include CRM tables from PR 5)
- `src/lib/ai/gateway.ts` — AI Gateway config
- `vitest.config.ts` — Test config (alias `@` → `./src`)
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` — TOOL-01, TOOL-03

---

### Task 1: Supabase Test Mock Helper

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`
- Test: `src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts`

**Context:** All CRM tool tests need to mock the Supabase query builder's chainable API (`.from().select().eq().limit()`...). This helper creates a mock where every chainable method returns `this` and `await` resolves to a configurable `{ data, error }`. It also exposes per-table builder spies so tests can assert which methods were called with which arguments.

**Step 1: Write failing test for mock helper**

```typescript
// src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts
import { describe, expect, it } from "vitest";
import { createMockSupabase } from "./mock-supabase";

describe("createMockSupabase", () => {
  it("returns configured data when chain is awaited", async () => {
    const contacts = [{ contact_id: "1", first_name: "John" }];
    const { client } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });

    const { data, error } = await client
      .from("contacts")
      .select("*")
      .limit(20);

    expect(data).toEqual(contacts);
    expect(error).toBeNull();
  });

  it("returns empty array for unconfigured tables", async () => {
    const { client } = createMockSupabase();

    const { data, error } = await client
      .from("unknown_table")
      .select("*");

    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it("exposes chainable method spies per table", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });

    await client
      .from("contacts")
      .select("*")
      .eq("type", "buyer")
      .limit(10);

    expect(builders.contacts.select).toHaveBeenCalledWith("*");
    expect(builders.contacts.eq).toHaveBeenCalledWith("type", "buyer");
    expect(builders.contacts.limit).toHaveBeenCalledWith(10);
  });

  it("returns configured error", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "RLS violation" } },
    });

    const { data, error } = await client.from("contacts").select("*");

    expect(data).toBeNull();
    expect(error).toEqual({ message: "RLS violation" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts`
Expected: FAIL with `Cannot find module './mock-supabase'`

**Step 3: Implement the mock helper**

```typescript
// src/lib/runner/tools/crm/__tests__/mock-supabase.ts
/**
 * @fileoverview Test helper that mocks the Supabase PostgREST query builder.
 * Every chainable method (select, eq, or, insert, etc.) returns `this`.
 * `await` on the chain resolves to the configured `{ data, error }` result.
 */
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type QueryResult = { data: any; error: any };

/** All PostgREST builder methods that should be chainable in the mock. */
const CHAIN_METHODS = [
  "select", "insert", "update", "delete",
  "eq", "neq", "or", "ilike", "like", "is", "in", "not",
  "limit", "order", "single", "maybeSingle",
  "range", "filter", "match", "gte", "lte", "gt", "lt",
] as const;

/** Creates a chainable mock object that resolves to `result` when awaited. */
function createChainableBuilder(result: QueryResult) {
  const builder: Record<string, any> = {};

  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Make the builder thenable so `await` resolves to the configured result.
  builder.then = (
    resolve: (value: QueryResult) => void,
    reject?: (reason: any) => void,
  ) => Promise.resolve(result).then(resolve, reject);

  return builder;
}

/**
 * Creates a mock Supabase client for testing CRM tools.
 *
 * @param tableResults - Map of table name → { data, error } to return when that table is queried.
 *   Unconfigured tables return `{ data: [], error: null }`.
 * @returns `{ client, from, builders }` where:
 *   - `client` is the mock SupabaseClient (pass to tool factories)
 *   - `from` is the vi.fn() spy for `supabase.from()`
 *   - `builders` is a map of table name → chainable builder spies for assertions
 */
export function createMockSupabase(
  tableResults: Record<string, QueryResult> = {},
) {
  const builders: Record<string, ReturnType<typeof createChainableBuilder>> =
    {};

  const fromMock = vi.fn((table: string) => {
    if (!builders[table]) {
      const result = tableResults[table] ?? { data: [], error: null };
      builders[table] = createChainableBuilder(result);
    }
    return builders[table];
  });

  return {
    client: { from: fromMock } as unknown as SupabaseClient<Database>,
    from: fromMock,
    builders,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/__tests__/mock-supabase.ts src/lib/runner/tools/crm/__tests__/mock-supabase.test.ts
git commit -m "test: add Supabase query builder mock helper for CRM tool tests"
```

---

### Task 2: Contact Tools (search_contacts, create_contact, update_contact)

**Files:**
- Create: `src/lib/runner/tools/crm/contacts.ts`
- Test: `src/lib/runner/tools/crm/__tests__/contacts.test.ts`
- Reference: `src/lib/crm/schemas.ts` (PR 5 — imports `contactTypeValues`)

**Context:** Three AI SDK tools that let the agent search, create, and update contacts via Supabase. The factory `createContactTools(supabase, clientId)` returns all three. `client_id` is injected by the factory closure — never exposed to the LLM as a parameter. RLS automatically filters reads by the authenticated user; inserts require explicit `client_id`.

#### search_contacts

**Step 1: Write failing test for search_contacts**

```typescript
// src/lib/runner/tools/crm/__tests__/contacts.test.ts
import { describe, expect, it } from "vitest";
import { createContactTools } from "../contacts";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("search_contacts", () => {
  it("returns matching contacts for a query", async () => {
    const contacts = [
      {
        contact_id: "c1",
        first_name: "John",
        last_name: "Smith",
        email: "john@test.com",
        phone: "+65912",
        type: "buyer",
        notes: null,
      },
    ];
    const { client, builders } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.search_contacts.execute(
      { query: "John" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: true, contacts, count: 1 });
    expect(builders.contacts.or).toHaveBeenCalledWith(
      expect.stringContaining("John"),
    );
  });

  it("applies type filter when provided", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.search_contacts.execute(
      { query: "test", type: "buyer" },
      { toolCallId: "test", messages: [] },
    );

    expect(builders.contacts.eq).toHaveBeenCalledWith("type", "buyer");
  });

  it("defaults limit to 20", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [], error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    await tools.search_contacts.execute(
      { query: "test" },
      { toolCallId: "test", messages: [] },
    );

    expect(builders.contacts.limit).toHaveBeenCalledWith(20);
  });

  it("returns error when Supabase fails", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "connection timeout" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.search_contacts.execute(
      { query: "test" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: false, error: "connection timeout" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: FAIL with `Cannot find module '../contacts'`

**Step 3: Implement search_contacts**

```typescript
// src/lib/runner/tools/crm/contacts.ts
/**
 * @fileoverview AI agent tools for CRM contact operations.
 * Factory creates search_contacts, create_contact, update_contact.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { contactTypeValues } from "@/lib/crm/schemas";
import { buildContainsIlikeLiteral } from "./filter-utils";

/**
 * Creates the 3 contact CRM tools for the agent runner.
 *
 * @param supabase - Authenticated Supabase client (RLS-scoped to current user)
 * @param clientId - Client UUID injected into inserts (not exposed to LLM)
 */
export function createContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_contacts = tool({
    description:
      "Search for contacts in the CRM by name, email, or phone number. Returns matching contacts.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search term to match against name, email, or phone"),
      type: z
        .enum(contactTypeValues)
        .optional()
        .describe("Filter by contact type"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    }),
    execute: async ({ query, type, limit }) => {
      const maxResults = limit ?? 20;
      const ilikeLiteral = buildContainsIlikeLiteral(query);

      let qb = supabase
        .from("contacts")
        .select("*")
        .or(
          `first_name.ilike.${ilikeLiteral},last_name.ilike.${ilikeLiteral},email.ilike.${ilikeLiteral},phone.ilike.${ilikeLiteral}`,
        );

      if (type) qb = qb.eq("type", type);

      const { data, error } = await qb.limit(maxResults);

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, contacts: data, count: data?.length ?? 0 };
    },
  });

  return { search_contacts };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS (4 tests)

#### create_contact

**Step 5: Write failing test for create_contact**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/contacts.test.ts`:

```typescript
describe("create_contact", () => {
  it("creates a contact and returns it", async () => {
    const created = {
      contact_id: "new-id",
      client_id: CLIENT_ID,
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@test.com",
      phone: null,
      type: "seller",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      contacts: { data: created, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe", email: "jane@test.com" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: true, contact: created });
    expect(builders.contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@test.com",
      }),
    );
    expect(builders.contacts.single).toHaveBeenCalled();
  });

  it("returns error when insert fails", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "duplicate email" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: false, error: "duplicate email" });
  });
});
```

**Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: FAIL — `tools.create_contact` is `undefined`

**Step 7: Implement create_contact**

Add inside `createContactTools()`, before the `return` statement:

```typescript
  const create_contact = tool({
    description:
      "Create a new contact in the CRM. Use when the user mentions meeting someone new.",
    inputSchema: z.object({
      first_name: z.string().describe("Contact first name"),
      last_name: z.string().describe("Contact last name"),
      email: z
        .string()
        .email()
        .optional()
        .describe("Contact email address"),
      phone: z.string().optional().describe("Contact phone number"),
      type: z
        .enum(contactTypeValues)
        .optional()
        .describe("Contact type classification"),
      notes: z
        .string()
        .optional()
        .describe("Additional notes about the contact"),
    }),
    execute: async ({ first_name, last_name, email, phone, type, notes }) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          client_id: clientId,
          first_name,
          last_name,
          type: type ?? "other",
          email: email ?? null,
          phone: phone ?? null,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, contact: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_contacts, create_contact };
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS (6 tests)

#### update_contact

**Step 9: Write failing test for update_contact**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/contacts.test.ts`:

```typescript
describe("update_contact", () => {
  it("updates a contact and returns it", async () => {
    const updated = {
      contact_id: "c1",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Updated",
      email: "john@test.com",
      phone: null,
      type: "buyer",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T12:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      contacts: { data: updated, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      { contact_id: "c1", last_name: "Updated" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: true, contact: updated });
    expect(builders.contacts.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_name: "Updated" }),
    );
    expect(builders.contacts.eq).toHaveBeenCalledWith("contact_id", "c1");
    expect(builders.contacts.single).toHaveBeenCalled();
  });

  it("returns error when no fields provided", async () => {
    const { client } = createMockSupabase();
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      { contact_id: "c1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("returns error when contact not found", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "Row not found" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.update_contact.execute(
      { contact_id: "nonexistent", first_name: "Ghost" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
```

**Step 10: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: FAIL — `tools.update_contact` is `undefined`

**Step 11: Implement update_contact**

Add inside `createContactTools()`, before the `return` statement:

```typescript
  const update_contact = tool({
    description:
      "Update an existing contact. Requires the contact_id from a prior search.",
    inputSchema: z.object({
      contact_id: z
        .string()
        .uuid()
        .describe("The UUID of the contact to update"),
      first_name: z.string().optional().describe("Updated first name"),
      last_name: z.string().optional().describe("Updated last name"),
      email: z.string().email().optional().describe("Updated email"),
      phone: z.string().optional().describe("Updated phone"),
      type: z
        .enum(contactTypeValues)
        .optional()
        .describe("Updated contact type"),
      notes: z.string().optional().describe("Updated notes"),
    }),
    execute: async ({ contact_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, contact: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_contacts, create_contact, update_contact };
```

**Step 12: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS (9 tests)

**Step 13: Commit**

```bash
git add src/lib/runner/tools/crm/contacts.ts src/lib/runner/tools/crm/__tests__/contacts.test.ts
git commit -m "feat(tools): add contact CRM tools (search, create, update)"
```

---

### Task 3: Deal Tools (search_deals, create_deal, update_deal)

**Files:**
- Create: `src/lib/runner/tools/crm/deals.ts`
- Test: `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- Reference: `src/lib/crm/schemas.ts` (PR 5 — imports `dealStageValues`)

**Context:** Same factory pattern as contacts. `search_deals` supports optional `query` (matches address/notes), optional `stage` filter, and optional `contact_id` filter. `create_deal` requires `address`, everything else optional. `update_deal` requires `deal_id`.

#### search_deals

**Step 1: Write failing test for search_deals**

```typescript
// src/lib/runner/tools/crm/__tests__/deals.test.ts
import { describe, expect, it } from "vitest";
import { createDealTools } from "../deals";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTS = { toolCallId: "test", messages: [] } as const;

describe("search_deals", () => {
  it("returns matching deals for a query", async () => {
    const deals = [
      {
        deal_id: "d1",
        address: "123 Orchard Rd",
        stage: "leads",
        price: 1500000,
        contact_id: "c1",
        notes: null,
      },
    ];
    const { client, builders } = createMockSupabase({
      deals: { data: deals, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.search_deals.execute(
      { query: "Orchard" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, deals, count: 1 });
    expect(builders.deals.or).toHaveBeenCalledWith(
      expect.stringContaining("Orchard"),
    );
  });

  it("filters by stage when provided", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    await tools.search_deals.execute({ stage: "offer" }, EXEC_OPTS);

    expect(builders.deals.eq).toHaveBeenCalledWith("stage", "offer");
  });

  it("filters by contact_id when provided", async () => {
    const { client, builders } = createMockSupabase({
      deals: { data: [], error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    await tools.search_deals.execute({ contact_id: "c1" }, EXEC_OPTS);

    expect(builders.deals.eq).toHaveBeenCalledWith("contact_id", "c1");
  });

  it("returns error when Supabase fails", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "timeout" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.search_deals.execute({}, EXEC_OPTS);

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: FAIL with `Cannot find module '../deals'`

**Step 3: Implement search_deals**

```typescript
// src/lib/runner/tools/crm/deals.ts
/**
 * @fileoverview AI agent tools for CRM deal/listing operations.
 * Factory creates search_deals, create_deal, update_deal.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { dealStageValues } from "@/lib/crm/schemas";
import { buildContainsIlikeLiteral } from "./filter-utils";

/**
 * Creates the 3 deal CRM tools for the agent runner.
 *
 * @param supabase - Authenticated Supabase client (RLS-scoped)
 * @param clientId - Client UUID for inserts
 */
export function createDealTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_deals = tool({
    description:
      "Search for property deals in the CRM. Filter by address, stage, or associated contact.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search term to match against address or notes"),
      stage: z
        .enum(dealStageValues)
        .optional()
        .describe("Filter by deal stage"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by associated contact"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    }),
    execute: async ({ query, stage, contact_id, limit }) => {
      const maxResults = limit ?? 20;
      let qb = supabase.from("deals").select("*");

      if (query) {
        const ilikeLiteral = buildContainsIlikeLiteral(query);
        qb = qb.or(
          `address.ilike.${ilikeLiteral},notes.ilike.${ilikeLiteral}`,
        );
      }
      if (stage) qb = qb.eq("stage", stage);
      if (contact_id) qb = qb.eq("contact_id", contact_id);

      const { data, error } = await qb.limit(maxResults);

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, deals: data, count: data?.length ?? 0 };
    },
  });

  return { search_deals };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: PASS (4 tests)

#### create_deal

**Step 5: Write failing test for create_deal**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/deals.test.ts`:

```typescript
describe("create_deal", () => {
  it("creates a deal and returns it", async () => {
    const created = {
      deal_id: "new-deal",
      client_id: CLIENT_ID,
      address: "456 Marina Bay",
      stage: "leads",
      price: 2000000,
      contact_id: "c1",
      notes: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deals: { data: created, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.create_deal.execute(
      { address: "456 Marina Bay", price: 2000000, contact_id: "c1" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, deal: created });
    expect(builders.deals.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        address: "456 Marina Bay",
        price: 2000000,
        contact_id: "c1",
      }),
    );
  });

  it("returns error when insert fails", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "invalid address" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.create_deal.execute(
      { address: "" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: false, error: "invalid address" });
  });
});
```

**Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: FAIL — `tools.create_deal` is `undefined`

**Step 7: Implement create_deal**

Add inside `createDealTools()`, before the `return` statement:

```typescript
  const create_deal = tool({
    description:
      "Create a new property deal/listing in the CRM. Use when the user mentions a new property.",
    inputSchema: z.object({
      address: z.string().describe("Property address"),
      stage: z
        .enum(dealStageValues)
        .optional()
        .describe("Deal stage (defaults to leads)"),
      price: z.number().optional().describe("Property price"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Associated contact UUID"),
      notes: z.string().optional().describe("Deal notes"),
    }),
    execute: async ({ address, stage, price, contact_id, notes }) => {
      const { data, error } = await supabase
        .from("deals")
        .insert({
          client_id: clientId,
          address,
          ...(stage && { stage }),
          ...(price !== undefined && { price }),
          ...(contact_id && { contact_id }),
          ...(notes && { notes }),
        })
        .select()
        .single();

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, deal: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_deals, create_deal };
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: PASS (6 tests)

#### update_deal

**Step 9: Write failing test for update_deal**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/deals.test.ts`:

```typescript
describe("update_deal", () => {
  it("updates a deal and returns it", async () => {
    const updated = {
      deal_id: "d1",
      client_id: CLIENT_ID,
      address: "123 Orchard Rd",
      stage: "offer",
      price: 1600000,
      contact_id: "c1",
      notes: "Price negotiated down",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T12:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deals: { data: updated, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.update_deal.execute(
      {
        deal_id: "d1",
        stage: "offer",
        price: 1600000,
        notes: "Price negotiated down",
      },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, deal: updated });
    expect(builders.deals.eq).toHaveBeenCalledWith("deal_id", "d1");
  });

  it("returns error when no fields provided", async () => {
    const { client } = createMockSupabase();
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.update_deal.execute(
      { deal_id: "d1" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });
});
```

**Step 10: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: FAIL — `tools.update_deal` is `undefined`

**Step 11: Implement update_deal**

Add inside `createDealTools()`, before the `return` statement:

```typescript
  const update_deal = tool({
    description:
      "Update an existing deal. Requires the deal_id from a prior search.",
    inputSchema: z.object({
      deal_id: z
        .string()
        .uuid()
        .describe("The UUID of the deal to update"),
      address: z.string().optional().describe("Updated address"),
      stage: z
        .enum(dealStageValues)
        .optional()
        .describe("Updated deal stage"),
      price: z.number().optional().describe("Updated price"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Updated associated contact"),
      notes: z.string().optional().describe("Updated notes"),
    }),
    execute: async ({ deal_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      const { data, error } = await supabase
        .from("deals")
        .update(updates)
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) return { success: false as const, error: error.message };
      return { success: true as const, deal: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_deals, create_deal, update_deal };
```

**Step 12: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts`
Expected: PASS (8 tests)

**Step 13: Commit**

```bash
git add src/lib/runner/tools/crm/deals.ts src/lib/runner/tools/crm/__tests__/deals.test.ts
git commit -m "feat(tools): add deal CRM tools (search, create, update)"
```

---

### Task 4: Interaction Tool (create_interaction)

**Files:**
- Create: `src/lib/runner/tools/crm/interactions.ts`
- Test: `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- Reference: `src/lib/crm/schemas.ts` (PR 5 — imports `interactionTypeValues`)

**Context:** Single tool — interactions are append-only logs, so only `create` is needed. No search or update tools in v1 (the agent finds interactions via `run_agent_memory_sql` if needed, per `TOOL-03`). Each interaction requires a `contact_id` and `type`, with an optional `deal_id` link.

**Step 1: Write failing test for create_interaction**

```typescript
// src/lib/runner/tools/crm/__tests__/interactions.test.ts
import { describe, expect, it } from "vitest";
import { createInteractionTools } from "../interactions";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTS = { toolCallId: "test", messages: [] } as const;

describe("create_interaction", () => {
  it("creates an interaction and returns it", async () => {
    const created = {
      interaction_id: "int-1",
      client_id: CLIENT_ID,
      contact_id: "c1",
      deal_id: null,
      type: "call",
      summary: "Discussed pricing for 123 Orchard",
      occurred_at: "2026-03-01T10:00:00Z",
      created_at: "2026-03-01T10:05:00Z",
    };
    const { client, builders } = createMockSupabase({
      interactions: { data: created, error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.create_interaction.execute(
      {
        contact_id: "c1",
        type: "call",
        summary: "Discussed pricing for 123 Orchard",
        occurred_at: "2026-03-01T10:00:00Z",
      },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, interaction: created });
    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        contact_id: "c1",
        type: "call",
        summary: "Discussed pricing for 123 Orchard",
      }),
    );
  });

  it("links interaction to a deal when deal_id provided", async () => {
    const created = {
      interaction_id: "int-2",
      client_id: CLIENT_ID,
      contact_id: "c1",
      deal_id: "d1",
      type: "viewing",
      summary: "Property viewing at 456 Marina",
      occurred_at: "2026-03-01T14:00:00Z",
      created_at: "2026-03-01T14:30:00Z",
    };
    const { client, builders } = createMockSupabase({
      interactions: { data: created, error: null },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.create_interaction.execute(
      {
        contact_id: "c1",
        deal_id: "d1",
        type: "viewing",
        summary: "Property viewing at 456 Marina",
      },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, interaction: created });
    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ deal_id: "d1" }),
    );
  });

  it("returns error when insert fails", async () => {
    const { client } = createMockSupabase({
      interactions: {
        data: null,
        error: { message: "invalid contact_id" },
      },
    });
    const tools = createInteractionTools(client, CLIENT_ID);

    const result = await tools.create_interaction.execute(
      { contact_id: "bad-id", type: "note", summary: "test" },
      EXEC_OPTS,
    );

    expect(result).toEqual({
      success: false,
      error: "invalid contact_id",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/interactions.test.ts`
Expected: FAIL with `Cannot find module '../interactions'`

**Step 3: Implement create_interaction**

```typescript
// src/lib/runner/tools/crm/interactions.ts
/**
 * @fileoverview AI agent tool for recording CRM interactions.
 * Interactions are append-only — create only, no search/update in v1.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { interactionTypeValues } from "@/lib/crm/schemas";

/**
 * Creates the interaction CRM tool for the agent runner.
 *
 * @param supabase - Authenticated Supabase client (RLS-scoped)
 * @param clientId - Client UUID for inserts
 */
export function createInteractionTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const create_interaction = tool({
    description:
      "Record a client interaction (call, meeting, email, note, viewing). Always log important interactions.",
    inputSchema: z.object({
      contact_id: z
        .string()
        .uuid()
        .describe("The contact this interaction is with"),
      type: z.enum(interactionTypeValues).describe("Interaction type"),
      summary: z.string().describe("Summary of what happened"),
      deal_id: z
        .string()
        .uuid()
        .optional()
        .describe("Associated deal, if any"),
      occurred_at: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe(
          "When it happened (ISO 8601). Defaults to now.",
        ),
    }),
    execute: async ({
      contact_id,
      type,
      summary,
      deal_id,
      occurred_at,
    }) => {
      const { data, error } = await supabase
        .from("interactions")
        .insert({
          client_id: clientId,
          contact_id,
          type,
          summary,
          ...(deal_id && { deal_id }),
          occurred_at: occurred_at ?? new Date().toISOString(),
        })
        .select()
        .single();

      if (error)
        return { success: false as const, error: error.message };
      return { success: true as const, interaction: data };
    },
  });

  return { create_interaction };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/interactions.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/interactions.ts src/lib/runner/tools/crm/__tests__/interactions.test.ts
git commit -m "feat(tools): add interaction CRM tool (create)"
```

---

### Task 5: CRM Task Tools (search_tasks, create_task, update_task)

**Files:**
- Create: `src/lib/runner/tools/crm/tasks.ts`
- Test: `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- Reference: `src/lib/crm/schemas.ts` (PR 5 — imports `crmTaskStatusValues`)

**Context:** CRM tasks are simple follow-up items with binary `open | completed` status. These are NOT the same as agent tasks (`agent_tasks` table, added in a later PR). The DB table is `crm_tasks` to avoid collision. `search_tasks` orders by `due_date` ascending (soonest first). All filters are optional.

#### search_tasks

**Step 1: Write failing test for search_tasks**

```typescript
// src/lib/runner/tools/crm/__tests__/tasks.test.ts
import { describe, expect, it } from "vitest";
import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXEC_OPTS = { toolCallId: "test", messages: [] } as const;

describe("search_tasks", () => {
  it("returns tasks", async () => {
    const tasks = [
      {
        task_id: "t1",
        title: "Follow up with John",
        description: null,
        status: "open",
        due_date: "2026-03-05",
        contact_id: "c1",
        deal_id: null,
      },
    ];
    const { client } = createMockSupabase({
      crm_tasks: { data: tasks, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.search_tasks.execute({}, EXEC_OPTS);

    expect(result).toEqual({ success: true, tasks, count: 1 });
  });

  it("filters by status", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({ status: "open" }, EXEC_OPTS);

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by contact_id", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({ contact_id: "c1" }, EXEC_OPTS);

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith(
      "contact_id",
      "c1",
    );
  });

  it("filters by deal_id", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({ deal_id: "d1" }, EXEC_OPTS);

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("deal_id", "d1");
  });

  it("returns error when Supabase fails", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "timeout" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.search_tasks.execute({}, EXEC_OPTS);

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: FAIL with `Cannot find module '../tasks'`

**Step 3: Implement search_tasks**

```typescript
// src/lib/runner/tools/crm/tasks.ts
/**
 * @fileoverview AI agent tools for CRM task operations (follow-ups, reminders).
 * CRM tasks use binary open/completed status — not the agent task lifecycle.
 * DB table: `crm_tasks` (not `tasks`, to avoid collision with agent_tasks).
 */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { crmTaskStatusValues } from "@/lib/crm/schemas";

/**
 * Creates the 3 CRM task tools for the agent runner.
 *
 * @param supabase - Authenticated Supabase client (RLS-scoped)
 * @param clientId - Client UUID for inserts
 */
export function createTaskTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_tasks = tool({
    description:
      "Search for CRM tasks (follow-ups, reminders, to-dos). Filter by status, contact, or deal.",
    inputSchema: z.object({
      status: z
        .enum(crmTaskStatusValues)
        .optional()
        .describe("Filter by status (open or completed)"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by associated contact"),
      deal_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by associated deal"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    }),
    execute: async ({ status, contact_id, deal_id, limit }) => {
      const maxResults = limit ?? 20;
      let qb = supabase.from("crm_tasks").select("*");

      if (status) qb = qb.eq("status", status);
      if (contact_id) qb = qb.eq("contact_id", contact_id);
      if (deal_id) qb = qb.eq("deal_id", deal_id);

      const { data, error } = await qb
        .order("due_date", { ascending: true })
        .limit(maxResults);

      if (error)
        return { success: false as const, error: error.message };
      return {
        success: true as const,
        tasks: data,
        count: data?.length ?? 0,
      };
    },
  });

  return { search_tasks };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: PASS (5 tests)

#### create_task

**Step 5: Write failing test for create_task**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/tasks.test.ts`:

```typescript
describe("create_task", () => {
  it("creates a task and returns it", async () => {
    const created = {
      task_id: "new-task",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: "Call about pricing",
      status: "open",
      due_date: "2026-03-05",
      contact_id: "c1",
      deal_id: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: created, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.create_task.execute(
      {
        title: "Follow up with John",
        description: "Call about pricing",
        due_date: "2026-03-05",
        contact_id: "c1",
      },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, task: created });
    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        title: "Follow up with John",
      }),
    );
  });

  it("returns error when insert fails", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "missing title" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.create_task.execute(
      { title: "" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: false, error: "missing title" });
  });
});
```

**Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: FAIL — `tools.create_task` is `undefined`

**Step 7: Implement create_task**

Add inside `createTaskTools()`, before the `return` statement:

```typescript
  const create_task = tool({
    description:
      "Create a new CRM task for follow-ups, reminders, or to-dos.",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      description: z
        .string()
        .optional()
        .describe("Task description/details"),
      due_date: z
        .string()
        .optional()
        .describe("Due date (YYYY-MM-DD format)"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Associated contact"),
      deal_id: z
        .string()
        .uuid()
        .optional()
        .describe("Associated deal"),
    }),
    execute: async ({
      title,
      description,
      due_date,
      contact_id,
      deal_id,
    }) => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .insert({
          client_id: clientId,
          title,
          ...(description && { description }),
          ...(due_date && { due_date }),
          ...(contact_id && { contact_id }),
          ...(deal_id && { deal_id }),
        })
        .select()
        .single();

      if (error)
        return { success: false as const, error: error.message };
      return { success: true as const, task: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_tasks, create_task };
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: PASS (7 tests)

#### update_task

**Step 9: Write failing test for update_task**

Add to the bottom of `src/lib/runner/tools/crm/__tests__/tasks.test.ts`:

```typescript
describe("update_task", () => {
  it("updates a task and returns it", async () => {
    const updated = {
      task_id: "t1",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: null,
      status: "completed",
      due_date: "2026-03-05",
      contact_id: "c1",
      deal_id: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: updated, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      { task_id: "t1", status: "completed" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: true, task: updated });
    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("task_id", "t1");
  });

  it("returns error when no fields provided", async () => {
    const { client } = createMockSupabase();
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      { task_id: "t1" },
      EXEC_OPTS,
    );

    expect(result).toEqual({
      success: false,
      error: "No fields to update",
    });
  });

  it("returns error when task not found", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "Row not found" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      { task_id: "nonexistent", status: "completed" },
      EXEC_OPTS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
```

**Step 10: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: FAIL — `tools.update_task` is `undefined`

**Step 11: Implement update_task**

Add inside `createTaskTools()`, before the `return` statement:

```typescript
  const update_task = tool({
    description:
      "Update an existing CRM task. Use to mark tasks complete or change details.",
    inputSchema: z.object({
      task_id: z
        .string()
        .uuid()
        .describe("The UUID of the task to update"),
      title: z.string().optional().describe("Updated title"),
      description: z
        .string()
        .optional()
        .describe("Updated description"),
      status: z
        .enum(crmTaskStatusValues)
        .optional()
        .describe("Updated status"),
      due_date: z
        .string()
        .optional()
        .describe("Updated due date (YYYY-MM-DD)"),
      contact_id: z
        .string()
        .uuid()
        .optional()
        .describe("Updated associated contact"),
      deal_id: z
        .string()
        .uuid()
        .optional()
        .describe("Updated associated deal"),
    }),
    execute: async ({ task_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return {
          success: false as const,
          error: "No fields to update",
        };
      }

      const { data, error } = await supabase
        .from("crm_tasks")
        .update(updates)
        .eq("task_id", task_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error)
        return { success: false as const, error: error.message };
      return { success: true as const, task: data };
    },
  });
```

Update the return statement:

```typescript
  return { search_tasks, create_task, update_task };
```

**Step 12: Run test to verify it passes**

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/tasks.test.ts`
Expected: PASS (10 tests)

**Step 13: Commit**

```bash
git add src/lib/runner/tools/crm/tasks.ts src/lib/runner/tools/crm/__tests__/tasks.test.ts
git commit -m "feat(tools): add CRM task tools (search, create, update)"
```

---

### Task 6: CRM Tools Barrel Export + Runner Registration

**Files:**
- Create: `src/lib/runner/tools/crm/index.ts`
- Create: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/run-agent.ts` (created in PR 4)
- Reference: `app/api/chat/route.ts` (existing `streamText` call for comparison)

**Context:** This task wires everything together. The CRM barrel export aggregates all 4 tool factories into a single `createCrmTools()` function. The top-level tools barrel exists for future tool categories (file, web, etc.). The runner imports `createCrmTools`, passes the authenticated Supabase client and `clientId`, and spreads the result into `streamText({ tools })`. Step limit is set with `stopWhen: stepCountIs(8)` (PR 4 used `stepCountIs(4)`).

**Step 1: Create CRM tools barrel export**

```typescript
// src/lib/runner/tools/crm/index.ts
/**
 * @fileoverview Barrel export for all CRM agent tools.
 * Call `createCrmTools(supabase, clientId)` to get the full 10-tool set
 * for registration in the runner's `streamText()` call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createContactTools } from "./contacts";
import { createDealTools } from "./deals";
import { createInteractionTools } from "./interactions";
import { createTaskTools } from "./tasks";

/**
 * Creates all 10 CRM tools for the agent runner.
 *
 * @param supabase - Authenticated Supabase client (RLS-scoped to current user)
 * @param clientId - The client UUID, injected into all insert operations
 * @returns Object with all CRM tool definitions, keyed by snake_case tool name
 */
export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    ...createContactTools(supabase, clientId),
    ...createDealTools(supabase, clientId),
    ...createInteractionTools(supabase, clientId),
    ...createTaskTools(supabase, clientId),
  };
}
```

**Step 2: Create top-level tools barrel export**

```typescript
// src/lib/runner/tools/index.ts
/**
 * @fileoverview Barrel export for all agent tool categories.
 * New categories (file, web, workflow, etc.) will be added here in future PRs.
 */
export { createCrmTools } from "./crm";
```

**Step 3: Register CRM tools in the runner**

Open `src/lib/runner/run-agent.ts` (created in PR 4). Make these changes:

1. Add import at the top of the file:

```typescript
import { createCrmTools } from "@/lib/runner/tools";
```

2. Inside `runAgent()`, before the `streamText()` call, add:

```typescript
const tools = {
  ...createCrmTools(supabase, clientId),
};
```

3. Update the `streamText()` call to include `tools` and change `stopWhen` from `stepCountIs(4)` to `stepCountIs(8)`:

```typescript
const result = streamText({
  model: gateway(modelId),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(8),
});
```

**Step 4: Run all CRM tool tests to verify nothing broke**

Run: `npx vitest run src/lib/runner/tools/crm/`
Expected: PASS (expanded suite; baseline was 33 tests across 5 files)

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tools/index.ts src/lib/runner/run-agent.ts
git commit -m "feat(tools): register CRM tools in runner, bump stepCountIs to 8"
```

---

## Verification Checklist

Before marking PR 6 complete:

- [ ] Expanded CRM tool suite passes: `npx vitest run src/lib/runner/tools/crm/`
- [ ] Each test was watched failing before implementation (TDD red step)
- [ ] No production code without a failing test first
- [ ] Tool input Zod schemas use enums from `src/lib/crm/schemas.ts` (not hardcoded)
- [ ] `client_id` is injected via factory closure, never exposed as a tool parameter
- [ ] All tools return `{ success: true, <entity> }` or `{ success: false, error }` consistently
- [ ] `stopWhen: stepCountIs(8)` is set in the runner
- [ ] Contact/deal search tools escape user query text before building PostgREST `.or(...)`
- [ ] Update tools include explicit `.eq("client_id", clientId)` in addition to RLS
- [ ] All 10 tools registered in `streamText({ tools })`: search_contacts, create_contact, update_contact, search_deals, create_deal, update_deal, create_interaction, search_tasks, create_task, update_task
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Test acceptance: "Ask agent 'create a contact for John Smith, phone 555-1234' → contact appears in DB" (manual E2E after deployment)

---

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-03-01-pr6-crm-tools-tasklist.md`.

**To execute:** Open a new session and use the `@1-executing-plans` skill with batch execution and checkpoint:

```
Execute docs/tasks/2026-03-01-pr6-crm-tools-tasklist.md
```

**Important notes for the executing engineer:**
- PRs 3, 4, and 5 must be merged first — this PR depends on the `clients` table, runner engine, and CRM migrations.
- Verify `src/lib/crm/schemas.ts` exists and exports `contactTypeValues`, `dealStageValues`, `interactionTypeValues`, `crmTaskStatusValues` before starting.
- If the `tool()` execute function requires a second `options` argument at runtime, pass `{ toolCallId: "test", messages: [] }` in all test `execute()` calls (already included in this plan).
- The `createMockSupabase` helper is reusable for all future tool PRs (file, web, etc.).
