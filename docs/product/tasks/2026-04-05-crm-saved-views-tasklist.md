# CRM Saved Views Implementation Plan

**PR:** Out-of-plan (saved views were explicitly excluded from PR 42a and PR 46; now reversed)
**Decisions:** See `docs/product/plans/2026-04-05-001-feat-crm-saved-views-plan.md` + adversarial review fixes
**Goal:** Add saved filter+sort views to CRM list pages, managed by the agent via `manage_views` tool, with pill tab view picker and seeded defaults

**Architecture:** Shared filter contract (`view-filters.ts`) defines supported operators. Agent creates views → stored in `crm_views` table → realtime-synced to pill tabs on CRM pages. Active view is authoritative (replaces local filter state). Seed defaults are config-driven, not hardcoded. RLS uses `public.get_my_client_id()`.

**Tech Stack:** Supabase (Postgres + RLS + Realtime), Vercel AI SDK `tool()`, TanStack Query, Zod, React

---

## Task 1: Shared Filter Contract

**Files:**
- Create: `src/lib/crm/view-filters.ts`
- Test: `src/lib/crm/__tests__/view-filters.test.ts`

### Step 1: Write the failing test for `resolveSymbolicDates`

```typescript
// src/lib/crm/__tests__/view-filters.test.ts
import { describe, expect, it, vi } from "vitest";

import { resolveSymbolicDates } from "../view-filters";

describe("resolveSymbolicDates", () => {
  it("resolves $today to current date", () => {
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    const result = resolveSymbolicDates({ due_date_before: "$today" });
    expect(result.due_date_before).toBe("2026-04-05");
    vi.useRealTimers();
  });

  it("resolves $week_start and $week_end", () => {
    // 2026-04-05 is a Sunday
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    const result = resolveSymbolicDates({
      due_date_after: "$week_start",
      due_date_before: "$week_end",
    });
    // Week starts Monday
    expect(result.due_date_after).toBe("2026-04-06");
    expect(result.due_date_before).toBe("2026-04-12");
    vi.useRealTimers();
  });

  it("resolves $month_start and $month_end", () => {
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
    const result = resolveSymbolicDates({
      close_date_after: "$month_start",
      close_date_before: "$month_end",
    });
    expect(result.close_date_after).toBe("2026-04-01");
    expect(result.close_date_before).toBe("2026-04-30");
    vi.useRealTimers();
  });

  it("passes through non-symbolic values unchanged", () => {
    const result = resolveSymbolicDates({ status: "todo", stage: "leads" });
    expect(result).toEqual({ status: "todo", stage: "leads" });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/crm/__tests__/view-filters.test.ts`
Expected: FAIL with "module not found" or similar

### Step 3: Write `resolveSymbolicDates` implementation

```typescript
// src/lib/crm/view-filters.ts
/**
 * Shared filter contract for CRM saved views.
 *
 * Defines supported filter operators, symbolic date tokens, and utilities
 * for resolving and applying view filters. Used by:
 * - `manage_views` agent tool (validates filters on write)
 * - Frontend data hooks (applies filters on read)
 *
 * @module lib/crm/view-filters
 */
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns";
import { z } from "zod";

/** Symbolic date tokens that are resolved at query time. */
export const SYMBOLIC_DATE_TOKENS = [
  "$today",
  "$week_start",
  "$week_end",
  "$month_start",
  "$month_end",
] as const;

type SymbolicToken = (typeof SYMBOLIC_DATE_TOKENS)[number];

const TOKEN_SET = new Set<string>(SYMBOLIC_DATE_TOKENS);

function isSymbolicToken(value: unknown): value is SymbolicToken {
  return typeof value === "string" && TOKEN_SET.has(value);
}

/** Resolves symbolic date tokens to ISO date strings (YYYY-MM-DD). */
export function resolveSymbolicDates(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const now = new Date();
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (!isSymbolicToken(value)) {
      resolved[key] = value;
      continue;
    }

    switch (value) {
      case "$today":
        resolved[key] = format(now, "yyyy-MM-dd");
        break;
      case "$week_start":
        resolved[key] = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        break;
      case "$week_end":
        resolved[key] = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        break;
      case "$month_start":
        resolved[key] = format(startOfMonth(now), "yyyy-MM-dd");
        break;
      case "$month_end":
        resolved[key] = format(endOfMonth(now), "yyyy-MM-dd");
        break;
    }
  }

  return resolved;
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/crm/__tests__/view-filters.test.ts`
Expected: PASS

### Step 5: Write the failing test for `applyViewFilters`

Add to the same test file:

```typescript
import { applyViewFilters, resolveSymbolicDates } from "../view-filters";

describe("applyViewFilters", () => {
  /** Spy query builder that records chained method calls. */
  function createMockQuery() {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy: Record<string, (...args: unknown[]) => typeof proxy> = {};
    for (const method of ["eq", "in", "gte", "lte", "neq"]) {
      proxy[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return proxy;
      };
    }
    return { proxy, calls };
  }

  it("applies equality filters", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { status: "todo", type: "buyer" });
    expect(calls).toEqual([
      { method: "eq", args: ["status", "todo"] },
      { method: "eq", args: ["type", "buyer"] },
    ]);
  });

  it("applies array inclusion via .in()", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { stage: ["leads", "offer"] });
    expect(calls).toEqual([
      { method: "in", args: ["stage", ["leads", "offer"]] },
    ]);
  });

  it("applies date range _after → .gte() and _before → .lte()", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, {
      due_date_after: "2026-04-01",
      due_date_before: "2026-04-30",
    });
    expect(calls).toEqual([
      { method: "gte", args: ["due_date", "2026-04-01"] },
      { method: "lte", args: ["due_date", "2026-04-30"] },
    ]);
  });

  it("skips null values", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { status: null, type: "buyer" });
    expect(calls).toEqual([
      { method: "eq", args: ["type", "buyer"] },
    ]);
  });
});
```

### Step 6: Run test to verify it fails

Run: `npx vitest run src/lib/crm/__tests__/view-filters.test.ts`
Expected: FAIL — `applyViewFilters` not exported yet

### Step 7: Write `applyViewFilters` + `viewFiltersSchema`

Add to `src/lib/crm/view-filters.ts`:

```typescript
/**
 * Zod schema for validating view filter objects.
 * Accepts equality values, arrays (for IN filters), symbolic tokens, and null.
 */
export const viewFiltersSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
  ]),
);

export type ViewFilters = z.infer<typeof viewFiltersSchema>;

/**
 * Applies resolved view filters to a Supabase query builder.
 *
 * Filter key conventions:
 * - `column_after` → `.gte(column, value)`
 * - `column_before` → `.lte(column, value)`
 * - Array value → `.in(column, values)`
 * - Scalar value → `.eq(column, value)`
 * - Null → skipped
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyViewFilters<Q extends Record<string, (...args: any[]) => Q>>(
  query: Q,
  filters: Record<string, unknown>,
): Q {
  let q = query;

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) continue;

    if (key.endsWith("_before")) {
      const column = key.slice(0, -"_before".length);
      q = q.lte(column, value);
    } else if (key.endsWith("_after")) {
      const column = key.slice(0, -"_after".length);
      q = q.gte(column, value);
    } else if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }

  return q;
}
```

### Step 8: Run tests to verify all pass

Run: `npx vitest run src/lib/crm/__tests__/view-filters.test.ts`
Expected: ALL PASS

### Step 9: Commit

```bash
git add src/lib/crm/view-filters.ts src/lib/crm/__tests__/view-filters.test.ts
git commit -m "feat(saved-views): shared filter contract with symbolic date resolution"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260405000001_create_crm_views.sql`

### Step 1: Write the migration

```sql
-- supabase/migrations/20260405000001_create_crm_views.sql

-- CRM saved views: named filter+sort presets for CRM list pages.
CREATE TABLE public.crm_views (
  view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contacts', 'companies', 'deals', 'tasks')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort JSONB,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_seeded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: use get_my_client_id() matching all other CRM tables
ALTER TABLE public.crm_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_views_select" ON public.crm_views FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_insert" ON public.crm_views FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_update" ON public.crm_views FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_delete" ON public.crm_views FOR DELETE
  USING (client_id = public.get_my_client_id());

-- Enable realtime for crm_views
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_views;

-- Fast lookup by client + entity
CREATE INDEX idx_crm_views_client_entity ON public.crm_views(client_id, entity_type);

-- Unique name per client per entity
CREATE UNIQUE INDEX idx_crm_views_unique_name ON public.crm_views(client_id, entity_type, name);
```

### Step 2: Apply migration locally

Run: `npx supabase db reset`
Expected: Migration applies without errors

### Step 3: Regenerate database types

Run: `npx supabase gen types typescript --local > src/types/database.ts`
Expected: `database.ts` now includes `crm_views` table type

### Step 4: Commit

```bash
git add supabase/migrations/20260405000001_create_crm_views.sql src/types/database.ts
git commit -m "feat(saved-views): create crm_views table with RLS and realtime"
```

---

## Task 3: Zod Schema for CRM Views

**Files:**
- Modify: `src/lib/crm/schemas.ts`
- Modify: `src/lib/crm/__tests__/schemas.test.ts`

### Step 1: Write the failing test

Add to `src/lib/crm/__tests__/schemas.test.ts`:

```typescript
describe("crmViewSchema", () => {
  it("validates a complete view row", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-7890-cdef-123456789abc",
      name: "Active pipeline",
      entity_type: "deals",
      filters: { stage: ["leads", "offer"] },
      sort: { column: "created_at", ascending: false },
      is_default: false,
      is_seeded: true,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null sort", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-7890-cdef-123456789abc",
      name: "Overdue",
      entity_type: "tasks",
      filters: { status: "todo", due_date_before: "$today" },
      sort: null,
      is_default: false,
      is_seeded: true,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entity_type", () => {
    const result = crmViewSchema.safeParse({
      view_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      client_id: "c1d2e3f4-a5b6-7890-cdef-123456789abc",
      name: "Test",
      entity_type: "widgets",
      filters: {},
      sort: null,
      is_default: false,
      is_seeded: false,
      created_at: "2026-04-05T00:00:00+00:00",
      updated_at: "2026-04-05T00:00:00+00:00",
    });
    expect(result.success).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
Expected: FAIL — `crmViewSchema` not exported

### Step 3: Add schema to `src/lib/crm/schemas.ts`

Add before the `crmConfigSchema` block (after the `CrmTaskInsert` type export):

```typescript
/** Entity types that support saved views. */
export const crmViewEntityTypes = [
  "contacts",
  "companies",
  "deals",
  "tasks",
] as const;

/** Full `crm_views` row validator. */
export const crmViewSchema = z.object({
  view_id: z.string().uuid(),
  client_id: z.string().uuid(),
  name: z.string().min(1),
  entity_type: z.enum(crmViewEntityTypes),
  filters: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
  ),
  sort: z
    .object({
      column: z.string(),
      ascending: z.boolean(),
    })
    .nullable(),
  is_default: z.boolean(),
  is_seeded: z.boolean(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type CrmView = z.infer<typeof crmViewSchema>;
export type CrmViewEntityType = (typeof crmViewEntityTypes)[number];
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/lib/crm/schemas.ts src/lib/crm/__tests__/schemas.test.ts
git commit -m "feat(saved-views): add crmViewSchema and entity type enum"
```

---

## Task 4: Agent Tool — `manage_views`

**Files:**
- Create: `src/lib/runner/tools/crm/views.ts`
- Create: `src/lib/runner/tools/crm/__tests__/views.test.ts`
- Modify: `src/lib/runner/tools/crm/index.ts`

### Step 1: Write the failing test for create operation

```typescript
// src/lib/runner/tools/crm/__tests__/views.test.ts
import { describe, expect, it, vi } from "vitest";

import { createViewTools } from "../views";

// Mock Supabase — follow the pattern in tasks.test.ts
function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultResult = { data: null, error: null };

  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            overrides.insertResult ?? {
              data: {
                view_id: "view-1",
                client_id: "client-1",
                name: "Active pipeline",
                entity_type: "deals",
                filters: { stage: ["leads", "offer"] },
                sort: null,
                is_default: false,
                is_seeded: false,
                created_at: "2026-04-05T00:00:00Z",
                updated_at: "2026-04-05T00:00:00Z",
              },
              error: null,
            },
          ),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(
              overrides.selectResult ?? { data: [], error: null },
            ),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                overrides.updateResult ?? defaultResult,
              ),
            }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(
            overrides.deleteResult ?? defaultResult,
          ),
        }),
      }),
    }),
  };
}

// Mock analytics
vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

describe("manage_views tool", () => {
  it("creates a view and returns it", async () => {
    const supabase = createMockSupabase();
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      {
        operation: "create",
        name: "Active pipeline",
        entity_type: "deals",
        filters: { stage: ["leads", "offer"] },
      },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.view.name).toBe("Active pipeline");
    }
  });

  it("lists views for an entity type", async () => {
    const supabase = createMockSupabase({
      selectResult: {
        data: [{ view_id: "v1", name: "Active pipeline", entity_type: "deals" }],
        error: null,
      },
    });
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      { operation: "list", entity_type: "deals" },
      { toolCallId: "tc-2", messages: [] },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.views).toHaveLength(1);
    }
  });

  it("deletes a view", async () => {
    const supabase = createMockSupabase({
      deleteResult: { data: null, error: null, count: 1 },
    });
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      { operation: "delete", view_id: "view-1" },
      { toolCallId: "tc-3", messages: [] },
    );
    expect(result.success).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/views.test.ts`
Expected: FAIL — module not found

### Step 3: Write the `manage_views` tool

```typescript
// src/lib/runner/tools/crm/views.ts
/**
 * CRM view management tool for the runner.
 * @module lib/runner/tools/crm/views
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { crmViewEntityTypes } from "@/lib/crm/schemas";
import { viewFiltersSchema } from "@/lib/crm/view-filters";
import type { Database } from "@/types/database";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

const sortSchema = z.object({
  column: z.string().min(1),
  ascending: z.boolean(),
});

const createInput = z.object({
  operation: z.literal("create"),
  name: z.string().min(1).describe("Display name for the view."),
  entity_type: z
    .enum(crmViewEntityTypes)
    .describe("CRM entity this view filters (contacts, companies, deals, tasks)."),
  filters: viewFiltersSchema.describe(
    "Filter object — keys are column names or column_after/column_before for date ranges. " +
      "Values: strings, numbers, booleans, string arrays (for IN filters), or symbolic tokens ($today, $week_start, $week_end, $month_start, $month_end).",
  ),
  sort: sortSchema.optional().describe("Optional sort column and direction."),
});

const listInput = z.object({
  operation: z.literal("list"),
  entity_type: z
    .enum(crmViewEntityTypes)
    .optional()
    .describe("Filter list by entity type. Omit to list all views."),
});

const updateInput = z.object({
  operation: z.literal("update"),
  view_id: z.string().uuid().describe("UUID of the view to update."),
  name: z.string().min(1).optional().describe("Updated display name."),
  filters: viewFiltersSchema.optional().describe("Updated filters (replaces existing)."),
  sort: sortSchema.nullable().optional().describe("Updated sort or null to clear."),
});

const deleteInput = z.object({
  operation: z.literal("delete"),
  view_id: z.string().uuid().describe("UUID of the view to delete."),
});

/**
 * Creates the manage_views tool for CRM saved views.
 */
export function createViewTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const manage_views = tool({
    description:
      "Create, list, update, or delete saved CRM views. " +
      "A view is a named filter+sort preset that appears as a pill tab on the CRM page. " +
      "Only create views when the user explicitly asks. " +
      "Filter keys match CRM columns: stage, status, type, industry, company_id, contact_id, deal_id. " +
      "For date ranges use column_after/column_before (e.g. due_date_before, close_date_after). " +
      "Use symbolic tokens for dynamic dates: $today, $week_start, $week_end, $month_start, $month_end.",
    inputSchema: z.discriminatedUnion("operation", [
      createInput,
      listInput,
      updateInput,
      deleteInput,
    ]),
    execute: async (input) => {
      switch (input.operation) {
        case "create": {
          const { data, error } = await supabase
            .from("crm_views")
            .insert({
              client_id: clientId,
              name: input.name,
              entity_type: input.entity_type,
              filters: input.filters,
              sort: input.sort ?? null,
            })
            .select()
            .single();

          if (error) {
            return { success: false as const, error: error.message };
          }

          await captureServerEvent({
            distinctId: clientId,
            event: "crm_view_created",
            properties: { entity_type: input.entity_type, source: "agent" },
          });

          return { success: true as const, view: data };
        }

        case "list": {
          let query = supabase
            .from("crm_views")
            .select("*")
            .eq("client_id", clientId)
            .order("is_seeded", { ascending: false })
            .order("created_at", { ascending: true });

          if (input.entity_type) {
            query = query.eq("entity_type", input.entity_type);
          }

          const { data, error } = await query;

          if (error) {
            return { success: false as const, error: error.message };
          }

          return { success: true as const, views: data ?? [], count: (data ?? []).length };
        }

        case "update": {
          const updates: Record<string, unknown> = {};
          if (input.name !== undefined) updates.name = input.name;
          if (input.filters !== undefined) updates.filters = input.filters;
          if (input.sort !== undefined) updates.sort = input.sort;

          if (Object.keys(updates).length === 0) {
            return { success: false as const, error: "No fields to update." };
          }

          const { data, error } = await supabase
            .from("crm_views")
            .update(updates)
            .eq("view_id", input.view_id)
            .eq("client_id", clientId)
            .select()
            .single();

          if (error) {
            return { success: false as const, error: error.message };
          }

          return { success: true as const, view: data };
        }

        case "delete": {
          const { error } = await supabase
            .from("crm_views")
            .delete()
            .eq("view_id", input.view_id)
            .eq("client_id", clientId);

          if (error) {
            return { success: false as const, error: error.message };
          }

          await captureServerEvent({
            distinctId: clientId,
            event: "crm_view_deleted",
            properties: { source: "agent" },
          });

          return { success: true as const, deleted: true };
        }
      }
    },
  });

  return { manage_views };
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/views.test.ts`
Expected: PASS

### Step 5: Register tool in CRM barrel

Modify `src/lib/runner/tools/crm/index.ts`:

1. Add import: `import { createViewTools } from "./views";`
2. In `createCrmTools()`, after `const taskTools = ...`:
   ```typescript
   const viewTools = createViewTools(supabase, clientId);
   ```
3. In the return object (write-tools block), add:
   ```typescript
   manage_views: viewTools.manage_views,
   ```

### Step 6: Run existing CRM tool tests to verify no regressions

Run: `npx vitest run src/lib/runner/tools/crm/__tests__/`
Expected: ALL PASS

### Step 7: Commit

```bash
git add src/lib/runner/tools/crm/views.ts src/lib/runner/tools/crm/__tests__/views.test.ts src/lib/runner/tools/crm/index.ts
git commit -m "feat(saved-views): manage_views agent tool with CRUD operations"
```

---

## Task 5: System Prompt Update

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

### Step 1: Add views guidance to system prompt

In `src/lib/ai/system-prompt.ts`, after the `</crm>` closing tag (line 205), add a new CRM views section. Actually — add it INSIDE the `<crm>` block, before `</crm>`:

```
CRM — Views:
- Use manage_views to create, update, delete, or list saved CRM views.
- A view is a named filter+sort preset for contacts, companies, deals, or tasks.
- Views appear as pill tabs on CRM pages — users click to filter instantly.
- Only create views when the user explicitly asks. Don't create views speculatively.
- Supported filter operators: equality (stage, status, type), array inclusion (stage in [...]), date ranges (due_date_after, due_date_before, close_date_after, close_date_before, created_at_after, created_at_before).
- Use symbolic date tokens for dynamic views: $today, $week_start, $week_end, $month_start, $month_end.
```

### Step 2: Verify prompt compiles

Run: `npx vitest run src/lib/ai/` (or whichever test covers system prompt assembly)
Expected: PASS

### Step 3: Commit

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(saved-views): add manage_views guidance to system prompt"
```

---

## Task 6: `useCrmViews` Hook with Realtime

**Files:**
- Modify: `src/hooks/use-realtime.ts` (add `"crm_views"` to union)
- Create: `src/hooks/use-crm-views.ts`
- Create: `src/hooks/__tests__/use-crm-views.test.tsx`

### Step 1: Add `crm_views` to `RealtimeTableName`

In `src/hooks/use-realtime.ts`, add `"crm_views"` to the `RealtimeTableName` union (after `"agent_triggers"` on line 22):

```typescript
export type RealtimeTableName =
  | "conversation_threads"
  | "conversation_messages"
  | "companies"
  | "contacts"
  | "deals"
  | "deal_contacts"
  | "interactions"
  | "crm_tasks"
  | "record_notes"
  | "agent_triggers"
  | "crm_views";
```

### Step 2: Write the failing test

```typescript
// src/hooks/__tests__/use-crm-views.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCrmViews } from "../use-crm-views";

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { view_id: "v1", name: "Active pipeline", entity_type: "deals", is_seeded: true },
                { view_id: "v2", name: "Custom view", entity_type: "deals", is_seeded: false },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1" }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: vi.fn(),
}));

// TanStack Query wrapper — follow existing test pattern
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCrmViews", () => {
  it("fetches views for an entity type", async () => {
    const { result } = renderHook(() => useCrmViews("deals"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe("Active pipeline");
  });
});
```

### Step 3: Run test to verify it fails

Run: `npx vitest run src/hooks/__tests__/use-crm-views.test.tsx`
Expected: FAIL — module not found

### Step 4: Write the hook

```typescript
// src/hooks/use-crm-views.ts
/**
 * TanStack Query hook for CRM saved views with realtime invalidation.
 * @module hooks/use-crm-views
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { CrmViewEntityType } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

/** Query key factory for CRM views. */
export const crmViewKeys = {
  all: ["crm-views"] as const,
  byEntity: (entityType: CrmViewEntityType) =>
    [...crmViewKeys.all, entityType] as const,
};

/**
 * Fetches saved CRM views for an entity type.
 * Subscribes to Supabase realtime so pill tabs update when the agent creates/deletes views.
 */
export function useCrmViews(entityType: CrmViewEntityType) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "crm_views",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [crmViewKeys.byEntity(entityType)],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: crmViewKeys.byEntity(entityType),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_views")
        .select("*")
        .eq("entity_type", entityType)
        .order("is_seeded", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(clientId),
  });
}
```

### Step 5: Run test to verify it passes

Run: `npx vitest run src/hooks/__tests__/use-crm-views.test.tsx`
Expected: PASS

### Step 6: Commit

```bash
git add src/hooks/use-realtime.ts src/hooks/use-crm-views.ts src/hooks/__tests__/use-crm-views.test.tsx
git commit -m "feat(saved-views): useCrmViews hook with realtime invalidation"
```

---

## Task 7: Extend Data Hooks with View Filters

**Files:**
- Modify: `src/hooks/use-crm-tasks.ts`
- Modify: `src/hooks/use-deals.ts`
- Modify: `src/hooks/use-contacts.ts`
- Modify: `src/hooks/use-companies.ts`

### Step 1: Extend `useCrmTasks` with `viewFilters` and `viewSort`

In `src/hooks/use-crm-tasks.ts`:

1. Update `CrmTaskFilters` interface:
   ```typescript
   export interface CrmTaskFilters {
     status?: CrmTask["status"];
     search?: string;
     viewFilters?: Record<string, unknown>;
     viewSort?: { column: string; ascending: boolean };
   }
   ```

2. In `fetchCrmTasks`, after the existing search filter, add:
   ```typescript
   import { applyViewFilters, resolveSymbolicDates } from "@/lib/crm/view-filters";

   // In fetchCrmTasks:
   if (filters.viewFilters && Object.keys(filters.viewFilters).length > 0) {
     const resolved = resolveSymbolicDates(filters.viewFilters);
     query = applyViewFilters(query, resolved);
   }
   ```

3. For sort, replace the hardcoded `.order("due_date", ...)` with:
   ```typescript
   if (filters.viewSort) {
     query = query.order(filters.viewSort.column, { ascending: filters.viewSort.ascending });
   } else {
     query = query.order("due_date", { ascending: true, nullsFirst: false });
   }
   ```

### Step 2: Extend `usePaginatedDeals` with `viewFilters` and `viewSort`

In `src/hooks/use-deals.ts`:

1. Add `viewFilters?: Record<string, unknown>` and `viewSort?: { column: string; ascending: boolean }` to `DealFilters`
2. In `applyDealFilters()` (or equivalent query builder), apply view filters after existing filters:
   ```typescript
   if (filters.viewFilters && Object.keys(filters.viewFilters).length > 0) {
     const resolved = resolveSymbolicDates(filters.viewFilters);
     query = applyViewFilters(query, resolved);
   }
   ```
3. Thread `viewSort` through to override default ordering when present

### Step 3: Extend `usePaginatedContacts` and `usePaginatedCompanies`

Same pattern — add `viewFilters` and `viewSort` to filter interfaces, apply in query builder.

### Step 4: Run existing hook tests to verify no regressions

Run: `npx vitest run src/hooks/__tests__/`
Expected: ALL PASS (existing tests don't pass viewFilters, so existing behavior unchanged)

### Step 5: Commit

```bash
git add src/hooks/use-crm-tasks.ts src/hooks/use-deals.ts src/hooks/use-contacts.ts src/hooks/use-companies.ts
git commit -m "feat(saved-views): extend CRM data hooks with viewFilters and viewSort params"
```

---

## Task 8: ViewPicker Component

**Files:**
- Create: `src/components/crm/view-picker.tsx`
- Create: `src/components/crm/__tests__/view-picker.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/crm/__tests__/view-picker.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ViewPicker } from "../view-picker";

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: () => ({
    data: [
      { view_id: "v1", name: "Active pipeline", entity_type: "deals", is_seeded: true },
      { view_id: "v2", name: "Closing this month", entity_type: "deals", is_seeded: false },
    ],
    isLoading: false,
  }),
}));

describe("ViewPicker", () => {
  it("renders All pill plus saved views", () => {
    render(
      <ViewPicker entityType="deals" activeViewId={null} onViewChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Closing this month" })).toBeInTheDocument();
  });

  it("highlights the active view", () => {
    render(
      <ViewPicker entityType="deals" activeViewId="v1" onViewChange={vi.fn()} />,
    );
    const activeBtn = screen.getByRole("button", { name: "Active pipeline" });
    expect(activeBtn).toHaveAttribute("data-active", "true");
  });

  it("calls onViewChange with null when All is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <ViewPicker entityType="deals" activeViewId="v1" onViewChange={onViewChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onViewChange).toHaveBeenCalledWith(null);
  });

  it("calls onViewChange with view_id when a view pill is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <ViewPicker entityType="deals" activeViewId={null} onViewChange={onViewChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Active pipeline" }));
    expect(onViewChange).toHaveBeenCalledWith("v1");
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/components/crm/__tests__/view-picker.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the component

```typescript
// src/components/crm/view-picker.tsx
/**
 * Horizontal pill tab bar for switching between saved CRM views.
 * @module components/crm/view-picker
 */
"use client";

import { useCrmViews } from "@/hooks/use-crm-views";
import type { CrmViewEntityType } from "@/lib/crm/schemas";
import { cn } from "@/lib/utils";

interface ViewPickerProps {
  entityType: CrmViewEntityType;
  activeViewId: string | null;
  onViewChange: (viewId: string | null) => void;
}

export function ViewPicker({ entityType, activeViewId, onViewChange }: ViewPickerProps) {
  const { data: views, isLoading } = useCrmViews(entityType);

  if (isLoading || !views?.length) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
      <PillButton
        label="All"
        isActive={activeViewId === null}
        onClick={() => onViewChange(null)}
      />
      {views.map((view) => (
        <PillButton
          key={view.view_id}
          label={view.name}
          isActive={activeViewId === view.view_id}
          onClick={() => onViewChange(view.view_id)}
        />
      ))}
    </div>
  );
}

function PillButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      data-active={isActive}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
        "border border-transparent",
        isActive
          ? "bg-tx-2/10 text-tx border-bd"
          : "text-tx-2 hover:bg-ui-2 hover:text-tx",
      )}
    >
      {label}
    </button>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/components/crm/__tests__/view-picker.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add src/components/crm/view-picker.tsx src/components/crm/__tests__/view-picker.test.tsx
git commit -m "feat(saved-views): ViewPicker pill tab component"
```

---

## Task 9: Wire Up CRM Pages

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`

### Step 1: Wire up Tasks page

In `app/(dashboard)/tasks/page.tsx`:

1. Import `ViewPicker` and `useCrmViews`
2. Read URL param: `const savedViewId = searchParams?.get("savedView") ?? null`
3. Look up active view: `const { data: views } = useCrmViews("tasks"); const activeView = views?.find(v => v.view_id === savedViewId);`
4. When view is active, pass view filters to `useCrmTasks`:
   ```typescript
   const filters: CrmTaskFilters = activeView
     ? { viewFilters: activeView.filters, viewSort: activeView.sort ?? undefined }
     : { search, status: localStatusFilter };
   ```
5. Add view change handler that updates URL:
   ```typescript
   function handleViewChange(viewId: string | null) {
     const params = new URLSearchParams(searchParams?.toString());
     if (viewId) {
       params.set("savedView", viewId);
     } else {
       params.delete("savedView");
     }
     router.replace(`?${params.toString()}`);
   }
   ```
6. Render `<ViewPicker>` above the table area
7. When a view is active, hide/disable the search bar and filter controls

### Step 2: Wire up Deals page

Same pattern as Tasks. Key difference: Deals has both table and kanban views. The saved view filters apply to whichever layout is active.

### Step 3: Wire up People page

Same pattern. Contacts entity type.

### Step 4: Wire up Companies page

Same pattern. Companies entity type. Note: no seeded defaults for companies, but the picker still renders if the agent creates views.

### Step 5: Test manually

1. Navigate to `/tasks` — should show "All" pill only (until seeds are added in Task 10)
2. Add `?savedView=nonexistent` — should fallback to "All"
3. Verify table data changes when switching views

### Step 6: Commit

```bash
git add app/(dashboard)/tasks/page.tsx app/(dashboard)/customers/deals/page.tsx app/(dashboard)/customers/people/page.tsx app/(dashboard)/customers/companies/page.tsx
git commit -m "feat(saved-views): wire ViewPicker into all four CRM list pages"
```

---

## Task 10: Seed Default Views

**Files:**
- Create: `supabase/migrations/20260405000002_bootstrap_crm_views.sql`

### Step 1: Write the seeding migration

Follow the `bootstrap_autopilot_on_signup.sql` pattern:

```sql
-- supabase/migrations/20260405000002_bootstrap_crm_views.sql

-- Idempotent function to seed default CRM views for a client.
-- Reads crm_config to determine non-terminal deal stages (config-driven, not hardcoded).
CREATE OR REPLACE FUNCTION public.ensure_crm_views_for_client(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deal_stages JSONB;
  v_active_stages JSONB;
BEGIN
  -- Read configured deal stages (fall back to defaults if no config)
  SELECT COALESCE(deal_stages, '["leads","negotiation","offer","closing","lost"]'::jsonb)
    INTO v_deal_stages
    FROM public.crm_config
   WHERE client_id = p_client_id;

  -- If no crm_config row, use defaults
  IF v_deal_stages IS NULL THEN
    v_deal_stages := '["leads","negotiation","offer","closing","lost"]'::jsonb;
  END IF;

  -- Active stages = all except "lost"
  SELECT jsonb_agg(stage)
    INTO v_active_stages
    FROM jsonb_array_elements_text(v_deal_stages) AS stage
   WHERE stage != 'lost';

  -- Seed views (ON CONFLICT → skip if already exists)
  INSERT INTO public.crm_views (client_id, name, entity_type, filters, is_seeded) VALUES
    -- Deals
    (p_client_id, 'Active pipeline', 'deals', jsonb_build_object('stage', COALESCE(v_active_stages, '[]'::jsonb)), TRUE),
    (p_client_id, 'Closing this month', 'deals', '{"close_date_after": "$month_start", "close_date_before": "$month_end"}'::jsonb, TRUE),
    -- Tasks
    (p_client_id, 'Overdue', 'tasks', '{"status": "todo", "due_date_before": "$today"}'::jsonb, TRUE),
    (p_client_id, 'Due this week', 'tasks', '{"due_date_after": "$today", "due_date_before": "$week_end"}'::jsonb, TRUE),
    (p_client_id, 'Done', 'tasks', '{"status": "done"}'::jsonb, TRUE),
    -- Contacts
    (p_client_id, 'Buyers', 'contacts', '{"type": "buyer"}'::jsonb, TRUE),
    (p_client_id, 'Sellers', 'contacts', '{"type": "seller"}'::jsonb, TRUE)
  ON CONFLICT (client_id, entity_type, name) DO NOTHING;
END;
$$;

-- Trigger: seed views for every new client
CREATE OR REPLACE FUNCTION public.bootstrap_crm_views()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ensure_crm_views_for_client(NEW.client_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created_bootstrap_crm_views
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_crm_views();

-- Backfill: seed for all existing clients that don't have views yet
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT client_id FROM public.clients LOOP
    PERFORM public.ensure_crm_views_for_client(r.client_id);
  END LOOP;
END;
$$;
```

### Step 2: Apply migration locally

Run: `npx supabase db reset`
Expected: Migration applies without errors. Seed views appear for existing dev client.

### Step 3: Verify seeds exist

Run: `npx supabase db query "SELECT name, entity_type, filters FROM crm_views ORDER BY entity_type, name"`
Expected: 7 rows (2 deals, 2 contacts, 3 tasks)

### Step 4: Commit

```bash
git add supabase/migrations/20260405000002_bootstrap_crm_views.sql
git commit -m "feat(saved-views): bootstrap trigger seeds default views on signup + backfill"
```

---

## Task 11: End-to-End Verification

### Step 1: Start dev server

Run: `npm run dev`

### Step 2: Verify pill tabs appear

Navigate to `/tasks` — should see: `[All] [Overdue] [Due this week] [Done]`
Navigate to `/customers/deals` — should see: `[All] [Active pipeline] [Closing this month]`
Navigate to `/customers/people` — should see: `[All] [Buyers] [Sellers]`
Navigate to `/customers/companies` — should see: `[All]` only (no seeds)

### Step 3: Verify filtering works

1. Click "Overdue" on tasks — table should show only tasks with status=todo and due_date < today
2. Click "All" — table should show all tasks
3. Verify URL updates to `?savedView=<uuid>`

### Step 4: Verify URL persistence

1. Click "Overdue" on tasks page
2. Copy URL with `?savedView=...`
3. Navigate away, paste URL back
4. Should restore "Overdue" view

### Step 5: Verify agent tool works

In chat, ask: "Create a view called 'High value' for deals with amount over..." — wait, we only support equality/in/date range, not greater-than. Instead ask: "Create a view called 'Leads' for deals in the leads stage."
Expected: Agent uses `manage_views` → view appears in pills (via realtime) without page refresh.

### Step 6: Final commit

```bash
git add -A
git commit -m "feat(saved-views): CRM saved views — agent tool, pill tabs, seeded defaults"
```

---

## Relevant Files

### New Files
- `src/lib/crm/view-filters.ts` — shared filter contract
- `src/lib/crm/__tests__/view-filters.test.ts`
- `supabase/migrations/20260405000001_create_crm_views.sql`
- `supabase/migrations/20260405000002_bootstrap_crm_views.sql`
- `src/lib/runner/tools/crm/views.ts` — manage_views agent tool
- `src/lib/runner/tools/crm/__tests__/views.test.ts`
- `src/hooks/use-crm-views.ts`
- `src/hooks/__tests__/use-crm-views.test.tsx`
- `src/components/crm/view-picker.tsx`
- `src/components/crm/__tests__/view-picker.test.tsx`

### Modified Files
- `src/lib/crm/schemas.ts` — add `crmViewSchema`, `crmViewEntityTypes`
- `src/lib/crm/__tests__/schemas.test.ts` — add view schema tests
- `src/lib/runner/tools/crm/index.ts` — register manage_views
- `src/lib/ai/system-prompt.ts` — add views guidance
- `src/hooks/use-realtime.ts` — add `"crm_views"` to RealtimeTableName
- `src/hooks/use-crm-tasks.ts` — add viewFilters/viewSort params
- `src/hooks/use-deals.ts` — add viewFilters/viewSort params
- `src/hooks/use-contacts.ts` — add viewFilters/viewSort params
- `src/hooks/use-companies.ts` — add viewFilters/viewSort params
- `app/(dashboard)/tasks/page.tsx` — wire ViewPicker + view filtering
- `app/(dashboard)/customers/deals/page.tsx` — wire ViewPicker + view filtering
- `app/(dashboard)/customers/people/page.tsx` — wire ViewPicker + view filtering
- `app/(dashboard)/customers/companies/page.tsx` — wire ViewPicker + view filtering
- `src/types/database.ts` — regenerated with crm_views table

### Notes
- `close_date` exists on deals table (added in migration `20260401130000`) but is **missing from `dealSchema` in schemas.ts**. This doesn't block saved views (the DB column exists and Supabase queries work regardless of Zod schema), but should be addressed separately.
- The `date-fns` library is already a project dependency (used in CRM table components).
