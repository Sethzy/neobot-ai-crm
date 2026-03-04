# CRM Deal-Contacts Join Table + Tool Description Improvements

**PR:** PR 6b: deal_contacts join table + CRM tool description quality
**Decisions:** DATA-03, DATA-09
**Goal:** Replace `deals.contact_id` FK with `deal_contacts` many-to-many join table (supporting couples, co-broking). Improve all CRM tool descriptions to match Tasklet HubSpot quality (P0/P1 fixes).

**Architecture:** The current `deals.contact_id` single FK limits deals to one contact. SG real estate commonly involves couples buying together and co-broking agents. A `deal_contacts` join table with `role` column (buyer, seller, agent, other) and `is_primary` boolean enables many-to-many while preserving "who is the main contact" for display purposes. RLS uses `client_id` + `get_my_client_id()` matching the existing pattern.

**Scope cuts:**
- **Contact-to-contact relationships** (e.g., married couples): Deferred. Additive table later.
- **Property as separate entity:** Deferred. `deals.address` stays as text.
- **Batch tool variants:** Deferred to v1.1. Single-record tools only.
- **Delete tools:** Intentional v1 omission — documented.
- **Cursor pagination:** Not needed until agents have 50+ contacts/deals.

**Tech Stack:** Supabase (Postgres + RLS), Zod, Vercel AI SDK v6, Vitest

---

## Prerequisites

| PR | What it creates | Why this PR needs it |
|----|----------------|---------------------|
| PR 5 | CRM schema, `update_updated_at_column()` trigger function | Shared trigger, existing tables |
| PR 6 | CRM tools (`src/lib/runner/tools/crm/*`) | Tools we're modifying |
| PR 11 | CRM pages (deals list, deal detail, tasks) | UI that references `contact_id` on deals |

**Verify before starting:**
- `supabase/migrations/20260301110001_create_crm_deals.sql` has `contact_id UUID REFERENCES public.contacts`
- `src/lib/runner/tools/crm/deals.ts` exports `createDealTools`
- `src/lib/runner/tools/crm/__tests__/deals.test.ts` has 8 tests passing
- `src/hooks/use-deals.ts` uses `contacts!deals_contact_id_fkey` join
- `src/hooks/use-contact-relations.ts` queries `deals.eq("contact_id", contactId)`

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

| Task | Component | Files | Tests | Depends On |
|------|-----------|-------|-------|------------|
| 1 | Migration: `deal_contacts` join table | 1 SQL create | — | — |
| 2 | Migration: drop `deals.contact_id` + update hardened FKs | 1 SQL create | — | Task 1 |
| 3 | RLS policies for `deal_contacts` | 1 SQL create | — | Task 1 |
| 4 | Regenerate types + Zod schemas | 2 modify/create + 1 test | 3 tests | Task 1-3 |
| 5 | Deal tools: remove `contact_id`, add `link_contact_to_deal` / `unlink_contact_from_deal` / `get_deal_contacts` | 2 modify + 1 create | ~12 tests | Task 4 |
| 6 | Update barrel `index.ts` + barrel tests | 1 modify + 1 test modify | 3 tests (update existing) | Task 5 |
| 7 | Tool description improvements (P0 + P1) | 4 modify | ~8 tests (description assertions) | Task 5 |
| 8 | UI hooks: update `use-deals` + `use-contact-relations` | 2 modify + 2 test modify | ~6 tests | Task 4 |
| 9 | UI pages: update deal detail + deal list tests | 2 modify + 2 test modify | ~4 tests | Task 8 |
| 10 | Final verification + plan update | — | — | All |

**Total: ~15 files changed/created, ~36 new/modified tests.**

---

## Relevant Files

**Create:**
- `supabase/migrations/20260304100000_create_deal_contacts.sql` — Join table + indexes
- `supabase/migrations/20260304100001_drop_deals_contact_id.sql` — Drop column + update hardened FKs
- `supabase/migrations/20260304100002_deal_contacts_rls.sql` — RLS policies
- `src/lib/crm/__tests__/schemas.test.ts` — Schema tests (if not existing)
- `src/lib/runner/tools/crm/deal-contacts.ts` — Link/unlink/get tools

**Modify:**
- `src/lib/crm/schemas.ts` — Add `dealContactSchema`, `dealContactInsertSchema`, role enum
- `src/types/database.ts` — Regenerate after migration
- `src/lib/runner/tools/crm/deals.ts` — Remove `contact_id` param from create/update/search
- `src/lib/runner/tools/crm/contacts.ts` — Improve descriptions (P0/P1)
- `src/lib/runner/tools/crm/interactions.ts` — Improve descriptions (P0/P1)
- `src/lib/runner/tools/crm/tasks.ts` — Improve descriptions (P0/P1)
- `src/lib/runner/tools/crm/index.ts` — Register new tools, update counts
- `src/lib/runner/tools/crm/__tests__/deals.test.ts` — Update for removed `contact_id`
- `src/lib/runner/tools/crm/__tests__/index.test.ts` — Update tool counts
- `src/hooks/use-deals.ts` — Change FK join to `deal_contacts` subquery
- `src/hooks/use-contact-relations.ts` — Query via `deal_contacts` instead of `deals.contact_id`
- `src/hooks/__tests__/use-deals.test.tsx` — Update mocks
- `src/hooks/__tests__/use-contact-relations.test.tsx` — Update mocks

**Reference (read-only):**
- `supabase/migrations/20260301110001_create_crm_deals.sql` — Current deals schema
- `supabase/migrations/20260301110006_harden_crm_tenant_foreign_keys.sql` — Existing composite FKs
- `supabase/migrations/20260301110005_crm_rls_policies.sql` — RLS pattern
- `roadmap docs/.../03-sunder-crm-vs-hubspot-tool-comparison.md` — Prioritized fix list
- `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — Mock helper pattern

---

## Task 1: Migration — `deal_contacts` Join Table

**Files:**
- Create: `supabase/migrations/20260304100000_create_deal_contacts.sql`

### Step 1: Write the migration

```sql
-- PR6b: deal_contacts many-to-many join table.
-- Replaces deals.contact_id FK. Supports couples, co-broking, multiple stakeholders.
-- Decision refs: DATA-03, DATA-09.

CREATE TABLE public.deal_contacts (
  deal_contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(deal_id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(contact_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'agent', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate contact-deal pairs.
  CONSTRAINT deal_contacts_unique_pair UNIQUE (deal_id, contact_id)
);

-- Tenant isolation index.
CREATE INDEX idx_deal_contacts_client_id ON public.deal_contacts(client_id);

-- Lookup indexes for common queries.
CREATE INDEX idx_deal_contacts_deal_id ON public.deal_contacts(deal_id);
CREATE INDEX idx_deal_contacts_contact_id ON public.deal_contacts(contact_id);

-- Composite uniqueness for tenant-scoped FK safety.
ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_deal_unique UNIQUE (client_id, deal_id, contact_id);

COMMENT ON TABLE public.deal_contacts IS 'Many-to-many join: deals <-> contacts with role and primary flag.';
COMMENT ON COLUMN public.deal_contacts.role IS 'Role of contact in the deal (buyer, seller, agent, other).';
COMMENT ON COLUMN public.deal_contacts.is_primary IS 'Primary contact for display. At most one per deal (enforced by app layer).';
```

### Step 2: Apply the migration locally

```bash
Run: npx supabase db push
Expected: Migration applied. deal_contacts table created.
```

### Step 3: Commit

```bash
git add supabase/migrations/20260304100000_create_deal_contacts.sql
git commit -m "feat(db): create deal_contacts join table for many-to-many (DATA-03)"
```

---

## Task 2: Migration — Drop `deals.contact_id` + Update Hardened FKs

**Files:**
- Create: `supabase/migrations/20260304100001_drop_deals_contact_id.sql`

### Step 1: Write the migration

```sql
-- PR6b: remove deals.contact_id FK in favor of deal_contacts join table.
-- Also removes the composite FK and indexes from the hardening migration (110006).

-- 1. Drop the composite FK added by hardening migration.
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_client_contact_tenant_fkey;

-- 2. Drop the composite index for deal->contact tenant lookups.
DROP INDEX IF EXISTS idx_deals_client_contact_id;

-- 3. Drop the original single-column FK and index.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_contact_id_fkey;
DROP INDEX IF EXISTS idx_deals_contact_id;

-- 4. Drop the column.
ALTER TABLE public.deals DROP COLUMN contact_id;

-- 5. Add tenant-scoped composite FKs to deal_contacts for cross-tenant safety.
ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_deal_tenant_fkey
  FOREIGN KEY (client_id, deal_id)
  REFERENCES public.deals(client_id, deal_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;

ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_contact_tenant_fkey
  FOREIGN KEY (client_id, contact_id)
  REFERENCES public.contacts(client_id, contact_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;
```

### Step 2: Apply the migration locally

```bash
Run: npx supabase db push
Expected: Migration applied. deals.contact_id column removed.
```

### Step 3: Commit

```bash
git add supabase/migrations/20260304100001_drop_deals_contact_id.sql
git commit -m "feat(db): drop deals.contact_id, add tenant FKs to deal_contacts"
```

---

## Task 3: RLS Policies for `deal_contacts`

**Files:**
- Create: `supabase/migrations/20260304100002_deal_contacts_rls.sql`

### Step 1: Write the migration

```sql
-- PR6b: RLS for deal_contacts join table.
-- Follows existing CRM RLS pattern from 20260301110005.

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_contacts_select_own ON public.deal_contacts
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_insert_own ON public.deal_contacts
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_update_own ON public.deal_contacts
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_delete_own ON public.deal_contacts
  FOR DELETE USING (client_id = public.get_my_client_id());
```

### Step 2: Apply locally and commit

```bash
npx supabase db push
git add supabase/migrations/20260304100002_deal_contacts_rls.sql
git commit -m "feat(db): add RLS policies for deal_contacts"
```

---

## Task 4: Regenerate Types + Zod Schemas

**Files:**
- Modify: `src/types/database.ts` — Regenerate
- Modify: `src/lib/crm/schemas.ts` — Add `dealContactRoleValues`, `dealContactSchema`, `dealContactInsertSchema`; remove `contact_id` from `dealSchema`/`dealInsertSchema`

### Step 1: Regenerate database types

```bash
Run: npx supabase gen types typescript --local > src/types/database.ts
Expected: New file includes deal_contacts table type. deals table no longer has contact_id.
```

### Step 2: Write the failing test for new Zod schemas

Create `src/lib/crm/__tests__/schemas.test.ts` (or add to existing):

```typescript
import { describe, expect, it } from "vitest";
import {
  dealContactRoleValues,
  dealContactSchema,
  dealContactInsertSchema,
  dealSchema,
} from "../schemas";

describe("dealContactRoleValues", () => {
  it("contains expected roles", () => {
    expect(dealContactRoleValues).toEqual(["buyer", "seller", "agent", "other"]);
  });
});

describe("dealContactSchema", () => {
  it("validates a full deal_contacts row", () => {
    const result = dealContactSchema.safeParse({
      deal_contact_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "550e8400-e29b-41d4-a716-446655440010",
      contact_id: "550e8400-e29b-41d4-a716-446655440020",
      role: "buyer",
      is_primary: true,
      created_at: "2026-03-04T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });
});

describe("dealContactInsertSchema", () => {
  it("validates a minimal insert payload", () => {
    const result = dealContactInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      deal_id: "550e8400-e29b-41d4-a716-446655440010",
      contact_id: "550e8400-e29b-41d4-a716-446655440020",
    });
    expect(result.success).toBe(true);
  });
});

describe("dealSchema (updated)", () => {
  it("no longer has contact_id field", () => {
    expect(dealSchema.shape).not.toHaveProperty("contact_id");
  });
});
```

### Step 3: Run the tests — verify RED

```bash
Run: npx vitest run src/lib/crm/__tests__/schemas.test.ts
Expected: Fails — dealContactRoleValues, dealContactSchema, dealContactInsertSchema not exported. dealSchema still has contact_id.
```

### Step 4: Implement the schema changes

In `src/lib/crm/schemas.ts`:

1. Add `dealContactRoleValues`:
```typescript
export const dealContactRoleValues = ["buyer", "seller", "agent", "other"] as const;
const dealContactRoleSchema = z.enum(dealContactRoleValues);
```

2. Add `dealContactSchema` and `dealContactInsertSchema`:
```typescript
export const dealContactSchema = z.object({
  deal_contact_id: z.string().uuid(),
  client_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: dealContactRoleSchema,
  is_primary: z.boolean(),
  created_at: isoDateTimeSchema,
});

export const dealContactInsertSchema = z.object({
  client_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: dealContactRoleSchema.optional(),
  is_primary: z.boolean().optional(),
});

export type DealContact = z.infer<typeof dealContactSchema>;
export type DealContactInsert = z.infer<typeof dealContactInsertSchema>;
```

3. Remove `contact_id` from `dealSchema` and `dealInsertSchema`.

### Step 5: Run the tests — verify GREEN

```bash
Run: npx vitest run src/lib/crm/__tests__/schemas.test.ts
Expected: All 4 tests pass.
```

### Step 6: Commit

```bash
git add src/types/database.ts src/lib/crm/schemas.ts src/lib/crm/__tests__/schemas.test.ts
git commit -m "feat(pr6b): add deal_contacts Zod schemas, remove contact_id from deals"
```

---

## Task 5: Deal Tools — Remove `contact_id`, Add Link/Unlink/Get Tools

**Files:**
- Modify: `src/lib/runner/tools/crm/deals.ts` — Remove `contact_id` from search/create/update
- Create: `src/lib/runner/tools/crm/deal-contacts.ts` — `link_contact_to_deal`, `unlink_contact_from_deal`, `get_deal_contacts`
- Modify: `src/lib/runner/tools/crm/__tests__/deals.test.ts` — Update existing tests
- Create: `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts` — New tests

### Step 1: Update existing deal tool tests — verify RED

In `deals.test.ts`:

1. **Remove** the test "filters by contact_id when provided" — this filter no longer exists.
2. **Update** `create_deal` test to not pass `contact_id`.
3. **Update** `update_deal` test fixture to not have `contact_id`.

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts
Expected: Fails — deals.ts still has contact_id in schema, TypeScript errors.
```

### Step 2: Update `deals.ts` — verify GREEN

In `src/lib/runner/tools/crm/deals.ts`:

1. Remove `contact_id` from `search_deals` inputSchema and execute logic.
2. Remove `contact_id` from `create_deal` inputSchema and insert call.
3. Remove `contact_id` from `update_deal` inputSchema.

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts
Expected: All remaining deal tests pass.
```

### Step 3: Write failing tests for `deal-contacts.ts`

Create `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createDealContactTools } from "../deal-contacts";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("link_contact_to_deal", () => {
  it("links a contact to a deal with role", async () => {
    const linked = {
      deal_contact_id: "aaa",
      client_id: CLIENT_ID,
      deal_id: "d-1",
      contact_id: "c-1",
      role: "buyer",
      is_primary: true,
      created_at: "2026-03-04T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: linked, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_deal.execute(
      { deal_id: "d-1", contact_id: "c-1", role: "buyer", is_primary: true },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal_contact: linked });
    expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        deal_id: "d-1",
        contact_id: "c-1",
        role: "buyer",
        is_primary: true,
      }),
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "duplicate key" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "duplicate key" });
  });
});

describe("unlink_contact_from_deal", () => {
  it("removes a contact-deal link", async () => {
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: null, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.unlink_contact_from_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true });
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("deal_id", "d-1");
    expect(builders.deal_contacts.eq).toHaveBeenCalledWith("contact_id", "c-1");
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "not found" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.unlink_contact_from_deal.execute(
      { deal_id: "d-1", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "not found" });
  });
});

describe("get_deal_contacts", () => {
  it("returns contacts linked to a deal", async () => {
    const links = [
      { deal_contact_id: "dc-1", contact_id: "c-1", role: "buyer", is_primary: true },
      { deal_contact_id: "dc-2", contact_id: "c-2", role: "seller", is_primary: false },
    ];
    const { client } = createMockSupabase({
      deal_contacts: { data: links, error: null },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_deal_contacts.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      deal_contacts: links,
      count: 2,
    });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deal_contacts: { data: null, error: { message: "timeout" } },
    });
    const tools = createDealContactTools(client, CLIENT_ID);

    const result = await tools.get_deal_contacts.execute(
      { deal_id: "d-1" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "timeout" });
  });
});
```

### Step 4: Run the tests — verify RED

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts
Expected: Fails — deal-contacts.ts does not exist.
```

### Step 5: Implement `deal-contacts.ts`

Create `src/lib/runner/tools/crm/deal-contacts.ts`:

```typescript
/**
 * CRM deal-contact linking tools for the runner.
 * @module lib/runner/tools/crm/deal-contacts
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dealContactRoleValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

/**
 * Creates deal-contact linking tools.
 *
 * These tools manage the many-to-many relationship between deals and contacts
 * via the deal_contacts join table.
 */
export function createDealContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const link_contact_to_deal = tool({
    description:
      "Link a contact to a deal with a role. Use search_contacts and search_deals to find IDs first. " +
      "Data Modification Warning: Only link contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal. Use search_deals to find this."),
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_contacts to find this."),
      role: z.enum(dealContactRoleValues).optional()
        .describe("Contact's role in the deal (buyer, seller, agent, other). Defaults to 'buyer'."),
      is_primary: z.boolean().optional()
        .describe("Whether this is the primary contact for display. Defaults to false."),
    }),
    execute: async ({ deal_id, contact_id, role, is_primary }) => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .insert({
          client_id: clientId,
          deal_id,
          contact_id,
          role: role ?? "buyer",
          is_primary: is_primary ?? false,
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal_contact: data };
    },
  });

  const unlink_contact_from_deal = tool({
    description:
      "Remove a contact from a deal. Use get_deal_contacts to see current links first. " +
      "Data Modification Warning: Only unlink contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal."),
      contact_id: z.string().uuid().describe("UUID of the contact to unlink."),
    }),
    execute: async ({ deal_id, contact_id }) => {
      const { error } = await supabase
        .from("deal_contacts")
        .delete()
        .eq("deal_id", deal_id)
        .eq("contact_id", contact_id)
        .eq("client_id", clientId);

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const };
    },
  });

  const get_deal_contacts = tool({
    description:
      "Get all contacts linked to a deal, with their roles. " +
      "Use this to see who is involved in a deal before making changes.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal."),
    }),
    execute: async ({ deal_id }) => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .select("*")
        .eq("deal_id", deal_id);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const deal_contacts = data ?? [];

      return {
        success: true as const,
        deal_contacts,
        count: deal_contacts.length,
      };
    },
  });

  return {
    link_contact_to_deal,
    unlink_contact_from_deal,
    get_deal_contacts,
  };
}
```

### Step 6: Run the tests — verify GREEN

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts
Expected: All 6 tests pass.
```

### Step 7: Run all deal tests together

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/deals.test.ts src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts
Expected: All tests pass (existing deal tests + new deal-contacts tests).
```

### Step 8: Commit

```bash
git add src/lib/runner/tools/crm/deals.ts src/lib/runner/tools/crm/deal-contacts.ts \
  src/lib/runner/tools/crm/__tests__/deals.test.ts src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts
git commit -m "feat(pr6b): deal-contacts tools (link/unlink/get), remove contact_id from deals"
```

---

## Task 6: Update Barrel `index.ts` + Barrel Tests

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts`

### Step 1: Update the barrel test — verify RED

In `index.test.ts`:

1. Update "returns only read tools by default" to include `get_deal_contacts` (it's a read tool).
2. Update "returns all expected CRM tools when writes are enabled" — now 13 tools (was 10): add `get_deal_contacts`, `link_contact_to_deal`, `unlink_contact_from_deal`, remove `contact_id`-related tool changes are in the tool itself.

Expected sorted tool list with writes enabled:
```
create_contact, create_deal, create_interaction, create_task,
get_deal_contacts, link_contact_to_deal,
search_contacts, search_deals, search_tasks,
unlink_contact_from_deal,
update_contact, update_deal, update_task
```

That's 13 tools total (3 new, 10 existing).

Read-only tools: `get_deal_contacts`, `search_contacts`, `search_deals`, `search_tasks` (4 tools, was 3).

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
Expected: Fails — index.ts still exports old tool set.
```

### Step 2: Update `index.ts`

Add `createDealContactTools` import and registration:

```typescript
import { createDealContactTools } from "./deal-contacts";

// In createCrmTools():
const dealContactTools = createDealContactTools(supabase, clientId);

const readTools = {
  search_contacts: contactTools.search_contacts,
  search_deals: dealTools.search_deals,
  search_tasks: taskTools.search_tasks,
  get_deal_contacts: dealContactTools.get_deal_contacts,
};

// In write tools section, add:
link_contact_to_deal: dealContactTools.link_contact_to_deal,
unlink_contact_from_deal: dealContactTools.unlink_contact_from_deal,
```

### Step 3: Run the tests — verify GREEN

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
Expected: All 3 barrel tests pass with updated tool counts.
```

### Step 4: Commit

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tools/crm/__tests__/index.test.ts
git commit -m "feat(pr6b): register deal-contact tools in barrel (13 total)"
```

---

## Task 7: Tool Description Improvements (P0 + P1)

**Files:**
- Modify: `src/lib/runner/tools/crm/contacts.ts`
- Modify: `src/lib/runner/tools/crm/deals.ts`
- Modify: `src/lib/runner/tools/crm/interactions.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`

All changes are description string updates. No logic changes.

### Step 1: Write failing tests for description quality

Add description assertion tests to each test file (or create a shared `descriptions.test.ts`). Example approach — add to each existing test file:

**contacts.test.ts** — add:
```typescript
describe("tool descriptions", () => {
  it("create_contact has data modification warning", () => {
    const tools = createContactTools(client, CLIENT_ID);
    expect(tools.create_contact.description).toContain("Data Modification Warning");
  });

  it("update_contact has data modification warning", () => {
    const tools = createContactTools(client, CLIENT_ID);
    expect(tools.update_contact.description).toContain("Data Modification Warning");
  });
});
```

Similar assertions across all 4 files for P0 (warnings) and P1 (cross-refs, enum values).

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/
Expected: New description tests fail — current descriptions lack warnings.
```

### Step 2: Apply P0 fixes — data modification warnings

Add to ALL 7 write tool descriptions (4 create + 3 update):

```
"Data Modification Warning: Only create/update records when the user has explicitly asked to do so."
```

### Step 3: Apply P1 fixes — all description improvements

**P1-a: Cross-tool references on FK params.**
Every `contact_id` param description: `"UUID of the contact. Use search_contacts to find this."`
Every `deal_id` param description: `"UUID of the deal. Use search_deals to find this."`

**P1-b: Inline enum values in arg descriptions.**
- `type` on contacts: `"Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'."`
- `stage` on deals: `"Deal pipeline stage (leads, viewing, offer, negotiation, otp, completion, lost). Defaults to 'leads'."`
- `type` on interactions: `"Interaction type (call, meeting, email, message, viewing, note)."`
- `status` on tasks: `"Task status (open, completed). Defaults to 'open'."`

**P1-c: "When to use" guidance on search tools.**
- `search_contacts`: `"Search contacts by name, email, or phone. Use this before creating a new contact to avoid duplicates. Omit query to list all contacts. Searches across first_name, last_name, email, and phone using OR matching."`
- `search_deals`: `"Search deals by address or notes. Optionally filter by stage. Use get_deal_contacts to find contacts linked to a deal."`
- `search_tasks`: `"Search CRM tasks. Optionally filter by status, contact, or deal. Use this to find tasks before updating them."`

**P1-d: Make `search_contacts` query optional.**
Change `z.string().trim().min(1)` → `z.string().trim().min(1).optional()` and update execute logic:
```typescript
if (query) {
  queryBuilder = queryBuilder.or(buildSearchExpression(query));
}
```

**P1-e: Add cross-ref to `update_task` description.**
`"Update an existing CRM task by id. Use this after finding the task via search_tasks."`

**P1-f: Add partial-update note to all update tools.**
Append: `"Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field."`

### Step 4: Run ALL CRM tool tests — verify GREEN

```bash
Run: npx vitest run src/lib/runner/tools/crm/__tests__/
Expected: All tests pass, including new description assertions.
```

### Step 5: Commit

```bash
git add src/lib/runner/tools/crm/contacts.ts src/lib/runner/tools/crm/deals.ts \
  src/lib/runner/tools/crm/interactions.ts src/lib/runner/tools/crm/tasks.ts \
  src/lib/runner/tools/crm/__tests__/*.test.ts
git commit -m "feat(pr6b): improve all CRM tool descriptions (P0 warnings, P1 cross-refs/enums)"
```

---

## Task 8: UI Hooks — Update `use-deals` + `use-contact-relations`

**Files:**
- Modify: `src/hooks/use-deals.ts` — Replace FK join with `deal_contacts` subquery
- Modify: `src/hooks/use-contact-relations.ts` — Query via `deal_contacts`
- Modify: `src/hooks/__tests__/use-deals.test.tsx` — Update mocks
- Modify: `src/hooks/__tests__/use-contact-relations.test.tsx` — Update mocks

### Step 1: Update test mocks — verify RED

In `use-deals.test.tsx`: Update the select mock to expect the new join pattern (no longer `contacts!deals_contact_id_fkey`). Remove `contact_id` from deal fixtures.

In `use-contact-relations.test.tsx`: Update the `useContactDeals` mock — now queries `deal_contacts` table to find deals, not `deals.eq("contact_id")`.

```bash
Run: npx vitest run src/hooks/__tests__/use-deals.test.tsx src/hooks/__tests__/use-contact-relations.test.tsx
Expected: Fails — hooks still use old FK join pattern.
```

### Step 2: Update `use-deals.ts`

Change the select from:
```typescript
.select("*, contacts!deals_contact_id_fkey(first_name, last_name)")
```
to:
```typescript
.select("*, deal_contacts(contact_id, role, is_primary, contacts(first_name, last_name))")
```

Update the `DealWithContact` type to reflect the new shape (array of contacts instead of single contact).

### Step 3: Update `use-contact-relations.ts`

Change "find deals for a contact" from:
```typescript
supabase.from("deals").select("*").eq("contact_id", contactId)
```
to:
```typescript
supabase.from("deal_contacts").select("*, deals(*)").eq("contact_id", contactId)
```

### Step 4: Run the hook tests — verify GREEN

```bash
Run: npx vitest run src/hooks/__tests__/use-deals.test.tsx src/hooks/__tests__/use-contact-relations.test.tsx
Expected: All tests pass.
```

### Step 5: Commit

```bash
git add src/hooks/use-deals.ts src/hooks/use-contact-relations.ts \
  src/hooks/__tests__/use-deals.test.tsx src/hooks/__tests__/use-contact-relations.test.tsx
git commit -m "feat(pr6b): update deal hooks for deal_contacts join table"
```

---

## Task 9: UI Pages — Update Deal Detail + Tests

**Files:**
- Modify: `app/(dashboard)/crm/deals/[dealId]/__tests__/page.test.tsx` — Remove `contact_id` from fixtures
- Modify: `app/(dashboard)/crm/deals/__tests__/page.test.tsx` or `page.integration.test.tsx` — Update deal fixtures
- May modify: `app/(dashboard)/crm/deals/[dealId]/page.tsx` — If it renders contact info from the FK join

### Step 1: Update test fixtures — verify RED

Remove `contact_id` from `sampleDeal` fixtures. Update any assertions that reference the old FK join shape.

```bash
Run: npx vitest run app/(dashboard)/crm/deals/
Expected: Fails — fixtures don't match new type (no contact_id on Deal).
```

### Step 2: Update page components if needed

If `page.tsx` renders contact name from `deal.contacts`, update to render from `deal.deal_contacts[0]?.contacts` (primary contact).

### Step 3: Run the page tests — verify GREEN

```bash
Run: npx vitest run app/(dashboard)/crm/deals/
Expected: All tests pass.
```

### Step 4: Commit

```bash
git add app/(dashboard)/crm/deals/
git commit -m "feat(pr6b): update deal pages for deal_contacts join table"
```

---

## Task 10: Final Verification

### Step 1: Run full test suite

```bash
Run: npx vitest run
Expected: All tests pass. No regressions.
```

### Step 2: Type-check

```bash
Run: npx tsc --noEmit
Expected: No type errors.
```

### Step 3: Update comparison doc

Add a note to `roadmap docs/.../03-sunder-crm-vs-hubspot-tool-comparison.md`:
- Update the Associations section to reflect the new `deal_contacts` join table approach.
- Note that P0 and P1 fixes have been applied.

### Step 4: Final commit

```bash
git add .
git commit -m "feat(pr6b): final verification, update docs"
```

---

## Summary of Changes

| Category | Before | After |
|----------|--------|-------|
| **Data model** | `deals.contact_id` single FK | `deal_contacts` join table (many-to-many with roles) |
| **Tool count** | 10 tools | 13 tools (+`link_contact_to_deal`, `unlink_contact_from_deal`, `get_deal_contacts`) |
| **Read tools** | 3 (search_contacts, search_deals, search_tasks) | 4 (+get_deal_contacts) |
| **Write tools** | 7 | 9 (+link/unlink) |
| **Descriptions** | Terse, no warnings | P0 data modification warnings, P1 cross-refs/enums/guidance |
| **`search_contacts`** | query required | query optional (can list all) |
| **Enum values** | Not in descriptions | Inline in all arg descriptions |
| **FK guidance** | None | Every FK param says how to find the UUID |
