# PR 5: CRM Schema + Seed Data — Implementation Plan

**Goal:** Create the 5 CRM database tables (contacts, deals, interactions, crm_tasks, crm_config) with RLS policies scoped by `client_id`, plus Zod validation schemas, TypeScript types, and seed data for development.

**Architecture:** Five new Postgres tables all FK to `clients.client_id` (created in PR 3). RLS on every table uses `public.get_my_client_id()` for tenant isolation (same pattern used in existing PR3/PR4 migrations). The `crm_config` table stores per-client JSONB customizations (`deal_stages`, `task_types`, `interaction_types`) per phasing plan authority. CRM tasks use a binary `open | completed` status model (not the full agent task lifecycle). All schemas validated with Zod 4 using strict timestamp and insert-shape validation. Types added to `src/types/database.ts` to match the auto-generated Supabase pattern.

**Tech Stack:** Supabase (Postgres + RLS), Zod 4, TypeScript, Vitest

**Prerequisites:** PR 3 must be completed first — it creates the `clients` table and the `update_updated_at_column()` trigger function that CRM tables depend on. PR 4 is independent (runner engine) and not required.

## Approved Corrections (Supersedes Conflicting Steps Below)

These corrections were approved before execution and win over older snippets in this file:

- **Scope discipline:** PR5 is CRM schema/types/seed only. The PR4 queued-response transport issue is split to a separate follow-up (PR4b), not bundled into PR5.
- **Migration versioning:** Use a new collision-free sequence after existing migrations:
  - `20260301110000_create_crm_contacts.sql`
  - `20260301110001_create_crm_deals.sql`
  - `20260301110002_create_crm_interactions.sql`
  - `20260301110003_create_crm_tasks.sql`
  - `20260301110004_create_crm_config.sql`
  - `20260301110005_crm_rls_policies.sql`
- **Migration safety/style:** Prefer explicit `public.` schema-qualified table names and fail-fast `CREATE TABLE` (no `IF NOT EXISTS`) to avoid masking drift.
- **RLS DRY pattern:** Use `client_id = public.get_my_client_id()` in policies (consistent with existing migrations).
- **`crm_config` authority alignment:** Columns are `deal_stages`, `task_types`, `interaction_types` (phasing plan authority).
- **Seed strategy:** Do **not** create seed data as a versioned migration. Use local-only seed flow (`supabase/seed.sql`) for development fixtures.
- **Schema strictness:** Use strict datetime validation (`z.string().datetime({ offset: true })`) and `optional().nullable()` on insert fields where DB defaults/nullable columns apply.
- **Verification hardening:** Add at least one negative RLS check proving cross-tenant access is denied.

**Architecture Decisions:**
- `DATA-01` — Supabase Postgres as primary structured data store. All 25 v1 tables live here with RLS.
- `DATA-03` — Tenant isolation via RLS scoped by `client_id` (implemented with `public.get_my_client_id()` helper).
- `DATA-09` — 23 v1 tables total. This PR creates 5 of the 6 Core CRM tables (contacts, deals, crm_tasks, interactions, crm_config). The 6th (`clients`) was created in PR 3.

**App Spec Sections:** §10.1 (Supabase Tables), §14 (CRM Navigation — contact types, deal stages, task statuses), §7.2 (Autopilot Pulse — CRM follow-ups), §9 (Safety Model — CRM reads/writes auto-run)

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

| Task | Component | TDD? | Depends On |
|------|-----------|------|------------|
| 1 | CRM Zod Validation Schemas | Yes | — |
| 2 | SQL Migration: contacts table | Config (exception) | PR 3 (clients table) |
| 3 | SQL Migration: deals table | Config (exception) | Task 2 |
| 4 | SQL Migration: interactions table | Config (exception) | Task 2 |
| 5 | SQL Migration: crm_tasks table | Config (exception) | Task 2 |
| 6 | SQL Migration: crm_config table | Config (exception) | Task 2 |
| 7 | RLS Policies Migration (all 5 tables) | Config (exception) | Tasks 2-6 |
| 8 | TypeScript Database Types Update | Config (exception) | Tasks 2-6 |
| 9 | Local Seed Data (`supabase/seed.sql`) | Config (exception) | Tasks 2-7 |

---

### Task 1: CRM Zod Validation Schemas

**Files:**
- Create: `src/lib/crm/schemas.ts`
- Test: `src/lib/crm/__tests__/schemas.test.ts`
- Reference: `roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md` (§14 CRM entity definitions)

**Context:** These schemas validate data shape for all 5 CRM tables. They're pure logic — no Supabase dependency — making them ideal for strict TDD. The `contacts` table uses a `type` field for contact classification (buyer, seller, landlord, tenant, agent, other). The `deals` table uses a `stage` field for pipeline tracking. CRM tasks use binary `open | completed` status. The `crm_config` table stores flexible JSONB schemas for per-client field customization.

**Step 1: Write failing tests for contact schema**

```typescript
// src/lib/crm/__tests__/schemas.test.ts
import { describe, expect, test } from "vitest";
import {
  contactSchema,
  contactInsertSchema,
  contactTypeValues,
  type Contact,
  type ContactInsert,
} from "../schemas";

describe("contactSchema", () => {
  const validContact = {
    contact_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    first_name: "John",
    last_name: "Smith",
    email: "john@example.com",
    phone: "+6591234567",
    type: "buyer" as const,
    notes: "Met at property viewing",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  };

  test("validates a valid contact row", () => {
    expect(contactSchema.parse(validContact)).toEqual(validContact);
  });

  test("allows null email", () => {
    const withNullEmail = { ...validContact, email: null };
    expect(contactSchema.parse(withNullEmail)).toEqual(withNullEmail);
  });

  test("allows null phone", () => {
    const withNullPhone = { ...validContact, phone: null };
    expect(contactSchema.parse(withNullPhone)).toEqual(withNullPhone);
  });

  test("allows null notes", () => {
    const withNullNotes = { ...validContact, notes: null };
    expect(contactSchema.parse(withNullNotes)).toEqual(withNullNotes);
  });

  test("rejects invalid contact type", () => {
    const invalid = { ...validContact, type: "wizard" };
    expect(() => contactSchema.parse(invalid)).toThrow();
  });

  test("rejects missing first_name", () => {
    const { first_name, ...invalid } = validContact;
    expect(() => contactSchema.parse(invalid)).toThrow();
  });

  test("rejects missing client_id", () => {
    const { client_id, ...invalid } = validContact;
    expect(() => contactSchema.parse(invalid)).toThrow();
  });

  test("contactTypeValues contains all valid types", () => {
    expect(contactTypeValues).toEqual([
      "buyer",
      "seller",
      "landlord",
      "tenant",
      "agent",
      "other",
    ]);
  });
});

describe("contactInsertSchema", () => {
  test("validates insert without id or timestamps", () => {
    const insert = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      first_name: "Jane",
      last_name: "Doe",
      email: null,
      phone: null,
      type: "seller" as const,
      notes: null,
    };
    expect(contactInsertSchema.parse(insert)).toEqual(insert);
  });

  test("rejects insert without first_name", () => {
    const invalid = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      last_name: "Doe",
      type: "buyer" as const,
    };
    expect(() => contactInsertSchema.parse(invalid)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
Expected: FAIL with "Cannot find module '../schemas'"

**Step 3: Write failing tests for deal schema**

Add to the same test file:

```typescript
import {
  // ... existing imports ...
  dealSchema,
  dealInsertSchema,
  dealStageValues,
  type Deal,
  type DealInsert,
} from "../schemas";

describe("dealSchema", () => {
  const validDeal = {
    deal_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_id: "770e8400-e29b-41d4-a716-446655440000",
    address: "123 Orchard Road, #08-01",
    stage: "viewing" as const,
    price: 1500000,
    notes: "3BR condo, good condition",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  };

  test("validates a valid deal row", () => {
    expect(dealSchema.parse(validDeal)).toEqual(validDeal);
  });

  test("allows null contact_id", () => {
    const withNull = { ...validDeal, contact_id: null };
    expect(dealSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null price", () => {
    const withNull = { ...validDeal, price: null };
    expect(dealSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null notes", () => {
    const withNull = { ...validDeal, notes: null };
    expect(dealSchema.parse(withNull)).toEqual(withNull);
  });

  test("rejects invalid stage", () => {
    const invalid = { ...validDeal, stage: "magic" };
    expect(() => dealSchema.parse(invalid)).toThrow();
  });

  test("rejects missing address", () => {
    const { address, ...invalid } = validDeal;
    expect(() => dealSchema.parse(invalid)).toThrow();
  });

  test("dealStageValues contains all valid stages", () => {
    expect(dealStageValues).toEqual([
      "leads",
      "viewing",
      "offer",
      "negotiation",
      "otp",
      "completion",
      "lost",
    ]);
  });
});

describe("dealInsertSchema", () => {
  test("validates insert without id or timestamps", () => {
    const insert = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      address: "456 Bukit Timah Road",
      stage: "leads" as const,
      contact_id: null,
      price: null,
      notes: null,
    };
    expect(dealInsertSchema.parse(insert)).toEqual(insert);
  });
});
```

**Step 4: Write failing tests for interaction schema**

Add to the same test file:

```typescript
import {
  // ... existing imports ...
  interactionSchema,
  interactionInsertSchema,
  interactionTypeValues,
  type Interaction,
  type InteractionInsert,
} from "../schemas";

describe("interactionSchema", () => {
  const validInteraction = {
    interaction_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_id: "770e8400-e29b-41d4-a716-446655440000",
    deal_id: "880e8400-e29b-41d4-a716-446655440000",
    type: "call" as const,
    summary: "Discussed pricing for Orchard Road unit",
    occurred_at: "2026-03-01T10:30:00Z",
    created_at: "2026-03-01T10:35:00Z",
    updated_at: "2026-03-01T10:35:00Z",
  };

  test("validates a valid interaction row", () => {
    expect(interactionSchema.parse(validInteraction)).toEqual(validInteraction);
  });

  test("allows null deal_id", () => {
    const withNull = { ...validInteraction, deal_id: null };
    expect(interactionSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null summary", () => {
    const withNull = { ...validInteraction, summary: null };
    expect(interactionSchema.parse(withNull)).toEqual(withNull);
  });

  test("rejects invalid interaction type", () => {
    const invalid = { ...validInteraction, type: "telepathy" };
    expect(() => interactionSchema.parse(invalid)).toThrow();
  });

  test("rejects missing contact_id", () => {
    const { contact_id, ...invalid } = validInteraction;
    expect(() => interactionSchema.parse(invalid)).toThrow();
  });

  test("interactionTypeValues contains all valid types", () => {
    expect(interactionTypeValues).toEqual([
      "call",
      "meeting",
      "email",
      "message",
      "viewing",
      "note",
    ]);
  });
});

describe("interactionInsertSchema", () => {
  test("validates insert without id or timestamps", () => {
    const insert = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      contact_id: "770e8400-e29b-41d4-a716-446655440000",
      deal_id: null,
      type: "meeting" as const,
      summary: "Initial consultation",
      occurred_at: "2026-03-01T14:00:00Z",
    };
    expect(interactionInsertSchema.parse(insert)).toEqual(insert);
  });
});
```

**Step 5: Write failing tests for crm_task schema**

Add to the same test file:

```typescript
import {
  // ... existing imports ...
  crmTaskSchema,
  crmTaskInsertSchema,
  crmTaskStatusValues,
  type CrmTask,
  type CrmTaskInsert,
} from "../schemas";

describe("crmTaskSchema", () => {
  const validTask = {
    task_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_id: "770e8400-e29b-41d4-a716-446655440000",
    deal_id: "880e8400-e29b-41d4-a716-446655440000",
    title: "Follow up on viewing",
    description: "Call John about the Orchard Road unit",
    status: "open" as const,
    due_date: "2026-03-05T00:00:00Z",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  };

  test("validates a valid crm task row", () => {
    expect(crmTaskSchema.parse(validTask)).toEqual(validTask);
  });

  test("allows null contact_id", () => {
    const withNull = { ...validTask, contact_id: null };
    expect(crmTaskSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null deal_id", () => {
    const withNull = { ...validTask, deal_id: null };
    expect(crmTaskSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null description", () => {
    const withNull = { ...validTask, description: null };
    expect(crmTaskSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null due_date", () => {
    const withNull = { ...validTask, due_date: null };
    expect(crmTaskSchema.parse(withNull)).toEqual(withNull);
  });

  test("rejects invalid status", () => {
    const invalid = { ...validTask, status: "in_progress" };
    expect(() => crmTaskSchema.parse(invalid)).toThrow();
  });

  test("only allows binary status values", () => {
    expect(crmTaskStatusValues).toEqual(["open", "completed"]);
  });

  test("rejects missing title", () => {
    const { title, ...invalid } = validTask;
    expect(() => crmTaskSchema.parse(invalid)).toThrow();
  });
});

describe("crmTaskInsertSchema", () => {
  test("validates insert without id or timestamps, status defaults", () => {
    const insert = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      title: "Send market report",
      description: null,
      status: "open" as const,
      due_date: "2026-03-10T00:00:00Z",
      contact_id: null,
      deal_id: null,
    };
    expect(crmTaskInsertSchema.parse(insert)).toEqual(insert);
  });
});
```

**Step 6: Write failing tests for crm_config schema**

Add to the same test file:

```typescript
import {
  // ... existing imports ...
  crmConfigSchema,
  crmConfigInsertSchema,
  type CrmConfig,
  type CrmConfigInsert,
} from "../schemas";

describe("crmConfigSchema", () => {
  const validConfig = {
    config_id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    contact_fields: [
      { name: "budget", type: "currency", required: false },
      {
        name: "property_type",
        type: "select",
        options: ["HDB", "Condo", "Landed"],
      },
    ],
    deal_fields: [
      { name: "asking_price", type: "currency", required: true },
    ],
    deal_stages: [
      { id: "leads", name: "Leads", color: "#ff6b6b" },
      { id: "viewing", name: "Viewing Scheduled", color: "#4c6ef5" },
      { id: "completion", name: "Completed", color: "#51cf66" },
    ],
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  };

  test("validates a valid crm_config row", () => {
    expect(crmConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  test("allows null contact_fields", () => {
    const withNull = { ...validConfig, contact_fields: null };
    expect(crmConfigSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null deal_fields", () => {
    const withNull = { ...validConfig, deal_fields: null };
    expect(crmConfigSchema.parse(withNull)).toEqual(withNull);
  });

  test("allows null deal_stages", () => {
    const withNull = { ...validConfig, deal_stages: null };
    expect(crmConfigSchema.parse(withNull)).toEqual(withNull);
  });

  test("rejects missing client_id", () => {
    const { client_id, ...invalid } = validConfig;
    expect(() => crmConfigSchema.parse(invalid)).toThrow();
  });
});

describe("crmConfigInsertSchema", () => {
  test("validates insert with just client_id and nulls", () => {
    const insert = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      contact_fields: null,
      deal_fields: null,
      deal_stages: null,
    };
    expect(crmConfigInsertSchema.parse(insert)).toEqual(insert);
  });
});
```

**Step 7: Run all tests to verify they all fail**

Run: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
Expected: FAIL with "Cannot find module '../schemas'"

**Step 8: Implement all schemas (minimal code to pass)**

```typescript
// src/lib/crm/schemas.ts
/**
 * CRM Zod validation schemas for contacts, deals, interactions, crm_tasks, and crm_config.
 * Pure validation — no Supabase dependency. Used by data access layer and API routes.
 */
import { z } from "zod/v4";

// --- Contact ---

/** Valid contact type classifications for Singapore RE contacts. */
export const contactTypeValues = [
  "buyer",
  "seller",
  "landlord",
  "tenant",
  "agent",
  "other",
] as const;

const contactTypeSchema = z.enum(contactTypeValues);

/** Validates a full `contacts` row as returned from the database. */
export const contactSchema = z.object({
  contact_id: z.string().uuid(),
  client_id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  type: contactTypeSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates data for inserting a new contact (no id/timestamps). */
export const contactInsertSchema = z.object({
  client_id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  type: contactTypeSchema,
  notes: z.string().nullable(),
});

export type Contact = z.infer<typeof contactSchema>;
export type ContactInsert = z.infer<typeof contactInsertSchema>;

// --- Deal ---

/** Default pipeline stages for Singapore RE deals. */
export const dealStageValues = [
  "leads",
  "viewing",
  "offer",
  "negotiation",
  "otp",
  "completion",
  "lost",
] as const;

const dealStageSchema = z.enum(dealStageValues);

/** Validates a full `deals` row as returned from the database. */
export const dealSchema = z.object({
  deal_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  address: z.string(),
  stage: dealStageSchema,
  price: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates data for inserting a new deal (no id/timestamps). */
export const dealInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  address: z.string(),
  stage: dealStageSchema,
  price: z.number().nullable(),
  notes: z.string().nullable(),
});

export type Deal = z.infer<typeof dealSchema>;
export type DealInsert = z.infer<typeof dealInsertSchema>;

// --- Interaction ---

/** Valid interaction type classifications. */
export const interactionTypeValues = [
  "call",
  "meeting",
  "email",
  "message",
  "viewing",
  "note",
] as const;

const interactionTypeSchema = z.enum(interactionTypeValues);

/** Validates a full `interactions` row as returned from the database. */
export const interactionSchema = z.object({
  interaction_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: interactionTypeSchema,
  summary: z.string().nullable(),
  occurred_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates data for inserting a new interaction (no id/timestamps). */
export const interactionInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: interactionTypeSchema,
  summary: z.string().nullable(),
  occurred_at: z.string(),
});

export type Interaction = z.infer<typeof interactionSchema>;
export type InteractionInsert = z.infer<typeof interactionInsertSchema>;

// --- CRM Task ---

/** CRM tasks use binary status only (not the full agent task lifecycle). */
export const crmTaskStatusValues = ["open", "completed"] as const;

const crmTaskStatusSchema = z.enum(crmTaskStatusValues);

/** Validates a full `crm_tasks` row as returned from the database. */
export const crmTaskSchema = z.object({
  task_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  deal_id: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: crmTaskStatusSchema,
  due_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates data for inserting a new CRM task (no id/timestamps). */
export const crmTaskInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  deal_id: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: crmTaskStatusSchema,
  due_date: z.string().nullable(),
});

export type CrmTask = z.infer<typeof crmTaskSchema>;
export type CrmTaskInsert = z.infer<typeof crmTaskInsertSchema>;

// --- CRM Config ---

/** Validates a full `crm_config` row as returned from the database. JSONB fields are loosely typed. */
export const crmConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact_fields: z.any().nullable(),
  deal_fields: z.any().nullable(),
  deal_stages: z.any().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates data for inserting a new crm_config (no id/timestamps). */
export const crmConfigInsertSchema = z.object({
  client_id: z.string().uuid(),
  contact_fields: z.any().nullable(),
  deal_fields: z.any().nullable(),
  deal_stages: z.any().nullable(),
});

export type CrmConfig = z.infer<typeof crmConfigSchema>;
export type CrmConfigInsert = z.infer<typeof crmConfigInsertSchema>;
```

**Step 9: Run all tests to verify they pass**

Run: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
Expected: PASS (all tests green)

**Step 10: Commit**

```bash
git add src/lib/crm/schemas.ts src/lib/crm/__tests__/schemas.test.ts
git commit -m "feat(crm): add Zod validation schemas for all CRM tables"
```

---

### Task 2: SQL Migration — contacts table

**Files:**
- Create: `supabase/migrations/20260301110000_create_crm_contacts.sql`
- Reference: `src/lib/crm/schemas.ts` (contactTypeValues for enum), existing migration pattern in `supabase/migrations/20260201000000_add_whatsapp_tables.sql`

**Context:** The `contacts` table is the core CRM entity. It holds buyer/seller/landlord/tenant/agent records. The `type` column uses a Postgres CHECK constraint (not an enum type) matching the Zod schema values. All nullable fields match the schema. FK to `clients(client_id)`. Uses `update_updated_at_column()` trigger (already exists from prior migrations).

**Step 1: Write the migration file**

```sql
-- supabase/migrations/20260301110000_create_crm_contacts.sql
-- Migration: Create contacts table for CRM
-- PR: 5 | Decisions: DATA-01, DATA-03, DATA-09

CREATE TABLE IF NOT EXISTS contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL CHECK (type IN ('buyer', 'seller', 'landlord', 'tenant', 'agent', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(client_id, type);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(client_id, last_name, first_name);

-- Updated_at trigger
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110000_create_crm_contacts.sql`
Expected: SQL file displays correctly, no syntax issues visible

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110000_create_crm_contacts.sql
git commit -m "feat(crm): add contacts table migration"
```

---

### Task 3: SQL Migration — deals table

**Files:**
- Create: `supabase/migrations/20260301110001_create_crm_deals.sql`
- Reference: `src/lib/crm/schemas.ts` (dealStageValues for CHECK constraint)

**Context:** The `deals` table tracks pipeline deals. The `stage` column uses a CHECK constraint matching the Zod schema default stages. The `contact_id` FK is nullable (deals can exist without an assigned contact). The `price` column is BIGINT to handle large Singapore property values in cents.

**Step 1: Write the migration file**

```sql
-- supabase/migrations/20260301110001_create_crm_deals.sql
-- Migration: Create deals table for CRM pipeline
-- PR: 5 | Decisions: DATA-01, DATA-03, DATA-09

CREATE TABLE IF NOT EXISTS deals (
  deal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(contact_id) ON DELETE SET NULL,
  address TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('leads', 'viewing', 'offer', 'negotiation', 'otp', 'completion', 'lost')),
  price BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deals_client_id ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(client_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);

-- Updated_at trigger
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110001_create_crm_deals.sql`
Expected: SQL file displays correctly

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110001_create_crm_deals.sql
git commit -m "feat(crm): add deals table migration"
```

---

### Task 4: SQL Migration — interactions table

**Files:**
- Create: `supabase/migrations/20260301110002_create_crm_interactions.sql`
- Reference: `src/lib/crm/schemas.ts` (interactionTypeValues for CHECK constraint)

**Context:** The `interactions` table logs all contact activity (calls, meetings, viewings, etc.). The `contact_id` FK is required (every interaction belongs to a contact). The `deal_id` FK is nullable (interactions may not relate to a specific deal). The `occurred_at` timestamp records when the interaction actually happened (vs `created_at` which records when it was logged).

**Step 1: Write the migration file**

```sql
-- supabase/migrations/20260301110002_create_crm_interactions.sql
-- Migration: Create interactions table for CRM activity history
-- PR: 5 | Decisions: DATA-01, DATA-03, DATA-09

CREATE TABLE IF NOT EXISTS interactions (
  interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'email', 'message', 'viewing', 'note')),
  summary TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interactions_client_id ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_deal_id ON interactions(deal_id);
CREATE INDEX IF NOT EXISTS idx_interactions_occurred_at ON interactions(client_id, occurred_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110002_create_crm_interactions.sql`
Expected: SQL file displays correctly

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110002_create_crm_interactions.sql
git commit -m "feat(crm): add interactions table migration"
```

---

### Task 5: SQL Migration — crm_tasks table

**Files:**
- Create: `supabase/migrations/20260301110003_create_crm_tasks.sql`
- Reference: `src/lib/crm/schemas.ts` (crmTaskStatusValues — binary only: open, completed)

**Context:** CRM tasks are binary tracking-only tasks (`open | completed`). They are NOT the same as agent tasks (which have a full lifecycle: planning → planned → in_progress → review → done | cancelled). The agent creates CRM tasks to track follow-ups and reminders. Both `contact_id` and `deal_id` FKs are nullable.

**Step 1: Write the migration file**

```sql
-- supabase/migrations/20260301110003_create_crm_tasks.sql
-- Migration: Create crm_tasks table for binary follow-up tracking
-- PR: 5 | Decisions: DATA-01, DATA-03, DATA-09
-- NOTE: CRM tasks are binary (open/completed) — NOT agent tasks (full lifecycle).

CREATE TABLE IF NOT EXISTS crm_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(contact_id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_tasks_client_id ON crm_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(client_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON crm_tasks(client_id, due_date)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact_id ON crm_tasks(contact_id);

-- Updated_at trigger
CREATE TRIGGER update_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110003_create_crm_tasks.sql`
Expected: SQL file displays correctly

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110003_create_crm_tasks.sql
git commit -m "feat(crm): add crm_tasks table migration"
```

---

### Task 6: SQL Migration — crm_config table

**Files:**
- Create: `supabase/migrations/20260301110004_create_crm_config.sql`

**Context:** The `crm_config` table stores per-client JSONB customization: custom contact fields, custom deal fields, and custom pipeline stages. Each client gets one row. The JSONB columns are loosely typed at the DB level — validation happens in application code via Zod. One config row per client enforced by UNIQUE constraint on `client_id`.

**Step 1: Write the migration file**

```sql
-- supabase/migrations/20260301110004_create_crm_config.sql
-- Migration: Create crm_config table for per-client CRM customization
-- PR: 5 | Decisions: DATA-01, DATA-03, DATA-09

CREATE TABLE IF NOT EXISTS crm_config (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(client_id) ON DELETE CASCADE,
  contact_fields JSONB,
  deal_fields JSONB,
  deal_stages JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No additional index needed — client_id UNIQUE constraint creates one automatically.

-- Updated_at trigger
CREATE TRIGGER update_crm_config_updated_at
  BEFORE UPDATE ON crm_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110004_create_crm_config.sql`
Expected: SQL file displays correctly

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110004_create_crm_config.sql
git commit -m "feat(crm): add crm_config table migration"
```

---

### Task 7: RLS Policies Migration (all 5 tables)

**Files:**
- Create: `supabase/migrations/20260301110005_crm_rls_policies.sql`
- Reference: `DATA-03` — `client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid())`

**Context:** All 5 CRM tables need RLS policies using the DATA-03 pattern. The pattern is: each table's `client_id` must match the `client_id` from the `clients` row where `user_id = auth.uid()`. This ensures tenant isolation — users can only see their own CRM data. Both SELECT and INSERT/UPDATE are protected. The subquery `(SELECT client_id FROM clients WHERE user_id = auth.uid())` runs against the `clients` table created in PR 3.

**Step 1: Write the RLS migration file**

```sql
-- supabase/migrations/20260301110005_crm_rls_policies.sql
-- Migration: Enable RLS and create policies for all CRM tables
-- PR: 5 | Decision: DATA-03 — tenant isolation via client_id

-- === contacts ===
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

-- === deals ===
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deals"
  ON deals FOR SELECT
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own deals"
  ON deals FOR INSERT
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own deals"
  ON deals FOR UPDATE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

-- === interactions ===
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interactions"
  ON interactions FOR SELECT
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own interactions"
  ON interactions FOR INSERT
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own interactions"
  ON interactions FOR UPDATE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own interactions"
  ON interactions FOR DELETE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

-- === crm_tasks ===
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crm_tasks"
  ON crm_tasks FOR SELECT
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own crm_tasks"
  ON crm_tasks FOR INSERT
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own crm_tasks"
  ON crm_tasks FOR UPDATE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own crm_tasks"
  ON crm_tasks FOR DELETE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

-- === crm_config ===
ALTER TABLE crm_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crm_config"
  ON crm_config FOR SELECT
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own crm_config"
  ON crm_config FOR INSERT
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own crm_config"
  ON crm_config FOR UPDATE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own crm_config"
  ON crm_config FOR DELETE
  USING (client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid()));
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260301110005_crm_rls_policies.sql`
Expected: SQL file displays correctly, 20 policies total (4 per table x 5 tables)

**Step 3: Commit**

```bash
git add supabase/migrations/20260301110005_crm_rls_policies.sql
git commit -m "feat(crm): add RLS policies for all CRM tables"
```

---

### Task 8: TypeScript Database Types Update

**Files:**
- Modify: `src/types/database.ts`
- Reference: Existing table type patterns in same file (e.g., `cases`, `documents`, `whatsapp_contacts`)

**Context:** The `src/types/database.ts` file contains manually maintained Supabase-generated types. Each table needs `Row`, `Insert`, `Update`, and `Relationships` definitions matching the exact column names and types from the SQL migrations. This file is what makes `createClient<Database>()` type-safe. Follow the exact same pattern as existing tables. Note: JSONB columns map to `Json | null`. BIGINT maps to `number | null`. TIMESTAMPTZ maps to `string`.

**Step 1: Add contacts type definitions**

Add inside the `Tables` object in `src/types/database.ts`, after the existing table entries:

```typescript
      contacts: {
        Row: {
          contact_id: string
          client_id: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          type: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          contact_id?: string
          client_id: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          type: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          client_id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          type?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
```

**Step 2: Add deals type definitions**

```typescript
      deals: {
        Row: {
          deal_id: string
          client_id: string
          contact_id: string | null
          address: string
          stage: string
          price: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          deal_id?: string
          client_id: string
          contact_id?: string | null
          address: string
          stage: string
          price?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          deal_id?: string
          client_id?: string
          contact_id?: string | null
          address?: string
          stage?: string
          price?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
        ]
      }
```

**Step 3: Add interactions type definitions**

```typescript
      interactions: {
        Row: {
          interaction_id: string
          client_id: string
          contact_id: string
          deal_id: string | null
          type: string
          summary: string | null
          occurred_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          interaction_id?: string
          client_id: string
          contact_id: string
          deal_id?: string | null
          type: string
          summary?: string | null
          occurred_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          interaction_id?: string
          client_id?: string
          contact_id?: string
          deal_id?: string | null
          type?: string
          summary?: string | null
          occurred_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "interactions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
        ]
      }
```

**Step 4: Add crm_tasks type definitions**

```typescript
      crm_tasks: {
        Row: {
          task_id: string
          client_id: string
          contact_id: string | null
          deal_id: string | null
          title: string
          description: string | null
          status: string
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          task_id?: string
          client_id: string
          contact_id?: string | null
          deal_id?: string | null
          title: string
          description?: string | null
          status?: string
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          task_id?: string
          client_id?: string
          contact_id?: string | null
          deal_id?: string | null
          title?: string
          description?: string | null
          status?: string
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "crm_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "crm_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
        ]
      }
```

**Step 5: Add crm_config type definitions**

```typescript
      crm_config: {
        Row: {
          config_id: string
          client_id: string
          contact_fields: Json | null
          deal_fields: Json | null
          deal_stages: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          config_id?: string
          client_id: string
          contact_fields?: Json | null
          deal_fields?: Json | null
          deal_stages?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          config_id?: string
          client_id?: string
          contact_fields?: Json | null
          deal_fields?: Json | null
          deal_stages?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to the new type definitions (existing errors from other files are OK)

**Step 7: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(crm): add TypeScript database types for CRM tables"
```

---

### Task 9: Local Seed Data (`supabase/seed.sql`)

**Files:**
- Create: `supabase/seed.sql` (append CRM seed section under local-only seed guard)
- Reference: `src/lib/crm/schemas.ts` for valid enum values, `supabase/migrations/20260301110000_create_crm_contacts.sql` through `20260301110004_create_crm_config.sql` for table schemas

**Context:** Seed data is for local development only. It creates one test client (assumes PR 3's `clients` table and auth trigger exist), then populates realistic Singapore RE CRM data: 5 contacts, 4 deals at various pipeline stages, 6 interactions, 3 CRM tasks (mix of open/completed), and 1 crm_config row with default Singapore RE field customizations. UUIDs are deterministic for easy reference. The seed migration uses a fixed `client_id` that assumes a dev user exists.

**Important:** This seed data will only work in a local Supabase environment where a test user and client already exist (set up by PR 3's auth trigger). In production, clients get created via the auth signup flow.

**Step 1: Write the seed data migration**

```sql
-- supabase/migrations/20260301000006_crm_seed_data.sql
-- Migration: Seed CRM data for local development
-- PR: 5 | NOTE: Development only — these rows assume the dev client from PR 3 seed exists.
-- If no dev client exists yet, this migration is a no-op (uses INSERT ... SELECT pattern).

-- Use a DO block so we can reference the dev client dynamically.
DO $$
DECLARE
  v_client_id UUID;
  v_contact_john UUID := 'a0000000-0000-0000-0000-000000000001';
  v_contact_jane UUID := 'a0000000-0000-0000-0000-000000000002';
  v_contact_ahmad UUID := 'a0000000-0000-0000-0000-000000000003';
  v_contact_mei UUID := 'a0000000-0000-0000-0000-000000000004';
  v_contact_david UUID := 'a0000000-0000-0000-0000-000000000005';
  v_deal_orchard UUID := 'b0000000-0000-0000-0000-000000000001';
  v_deal_bukit UUID := 'b0000000-0000-0000-0000-000000000002';
  v_deal_marine UUID := 'b0000000-0000-0000-0000-000000000003';
  v_deal_tanjong UUID := 'b0000000-0000-0000-0000-000000000004';
BEGIN
  -- Get the first client (created by PR 3 dev seed or auth trigger)
  SELECT client_id INTO v_client_id FROM clients LIMIT 1;

  -- Skip if no client exists (safe no-op in clean environments)
  IF v_client_id IS NULL THEN
    RAISE NOTICE 'No client found — skipping CRM seed data.';
    RETURN;
  END IF;

  -- === Contacts ===
  INSERT INTO contacts (contact_id, client_id, first_name, last_name, email, phone, type, notes)
  VALUES
    (v_contact_john, v_client_id, 'John', 'Tan', 'john.tan@email.com', '+6591234567', 'buyer', 'Looking for 3BR condo in D15. Budget 1.5-2M.'),
    (v_contact_jane, v_client_id, 'Jane', 'Lim', 'jane.lim@company.com', '+6598765432', 'seller', 'Selling HDB in Toa Payoh. Upgrading to condo.'),
    (v_contact_ahmad, v_client_id, 'Ahmad', 'Ibrahim', 'ahmad.i@email.com', '+6590001111', 'landlord', 'Owns 2 condos in Marine Parade. Looking for tenants.'),
    (v_contact_mei, v_client_id, 'Mei Ling', 'Wong', NULL, '+6592223333', 'tenant', 'Corporate relocation from HK. Budget $5k/mo.'),
    (v_contact_david, v_client_id, 'David', 'Chen', 'david.chen@realty.sg', '+6594445555', 'agent', 'Co-broke partner at ERA. Specializes in D10.')
  ON CONFLICT (contact_id) DO NOTHING;

  -- === Deals ===
  INSERT INTO deals (deal_id, client_id, contact_id, address, stage, price, notes)
  VALUES
    (v_deal_orchard, v_client_id, v_contact_john, '88 Orchard Boulevard, #12-05', 'viewing', 1800000, 'Scheduled 2 viewings. Client likes the layout.'),
    (v_deal_bukit, v_client_id, v_contact_jane, '456 Bukit Timah Road, #04-12', 'leads', 850000, 'HDB valuation pending. Seller motivated.'),
    (v_deal_marine, v_client_id, v_contact_ahmad, '10 Marine Parade Road, #08-03', 'offer', 4500, 'Rental listing. Tenant interested at asking price.'),
    (v_deal_tanjong, v_client_id, v_contact_john, '22 Tanjong Rhu Road, #15-01', 'negotiation', 2200000, 'Counter-offer at 2.1M. Seller wants 2.25M.')
  ON CONFLICT (deal_id) DO NOTHING;

  -- === Interactions ===
  INSERT INTO interactions (client_id, contact_id, deal_id, type, summary, occurred_at)
  VALUES
    (v_client_id, v_contact_john, v_deal_orchard, 'call', 'Discussed viewing schedule for Orchard Blvd unit. Confirmed Saturday 2pm.', now() - interval '3 days'),
    (v_client_id, v_contact_john, v_deal_orchard, 'viewing', 'Showed 88 Orchard Blvd #12-05. Client liked the view but concerned about noise.', now() - interval '1 day'),
    (v_client_id, v_contact_jane, v_deal_bukit, 'meeting', 'Initial meeting at HDB. Discussed timeline and pricing expectations.', now() - interval '5 days'),
    (v_client_id, v_contact_ahmad, v_deal_marine, 'email', 'Sent rental listing details and tenancy agreement template.', now() - interval '2 days'),
    (v_client_id, v_contact_mei, NULL, 'call', 'Intro call. Corporate relocation from HK. Needs 2BR near MRT. Budget $5k/mo.', now() - interval '7 days'),
    (v_client_id, v_contact_david, NULL, 'message', 'WhatsApp: Confirmed co-broke arrangement for D10 listings.', now() - interval '4 days');

  -- === CRM Tasks ===
  INSERT INTO crm_tasks (client_id, contact_id, deal_id, title, description, status, due_date)
  VALUES
    (v_client_id, v_contact_john, v_deal_orchard, 'Follow up on Orchard Blvd viewing', 'Call John about noise concerns. Check decibel levels.', 'open', now() + interval '2 days'),
    (v_client_id, v_contact_jane, v_deal_bukit, 'Get HDB valuation report', 'Request valuation from HDB. Need for listing price.', 'open', now() + interval '5 days'),
    (v_client_id, v_contact_mei, NULL, 'Send rental listings to Mei Ling', 'Compile 2BR listings near MRT under $5k.', 'completed', now() - interval '1 day');

  -- === CRM Config ===
  INSERT INTO crm_config (client_id, contact_fields, deal_fields, deal_stages)
  VALUES (
    v_client_id,
    '[
      {"name": "budget", "type": "currency", "required": false},
      {"name": "property_type", "type": "select", "options": ["HDB", "Condo", "Landed", "Commercial"]},
      {"name": "district", "type": "text", "required": false},
      {"name": "referral_source", "type": "text", "required": false}
    ]'::jsonb,
    '[
      {"name": "asking_price", "type": "currency", "required": true},
      {"name": "property_type", "type": "select", "options": ["HDB", "Condo", "Landed"]},
      {"name": "floor_area_sqft", "type": "number", "required": false},
      {"name": "tenure", "type": "select", "options": ["Freehold", "Leasehold 99", "Leasehold 999"]}
    ]'::jsonb,
    '[
      {"id": "leads", "name": "Leads", "color": "#94a3b8"},
      {"id": "viewing", "name": "Viewing", "color": "#60a5fa"},
      {"id": "offer", "name": "Offer", "color": "#fbbf24"},
      {"id": "negotiation", "name": "Negotiation", "color": "#f97316"},
      {"id": "otp", "name": "OTP Signed", "color": "#a78bfa"},
      {"id": "completion", "name": "Completed", "color": "#34d399"},
      {"id": "lost", "name": "Lost", "color": "#ef4444"}
    ]'::jsonb
  )
  ON CONFLICT (client_id) DO NOTHING;

END $$;
```

**Step 2: Verify migration syntax**

Run: `cat supabase/seed.sql`
Expected: SQL file displays correctly

**Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(crm): add seed data for local development"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] All Zod schema tests pass: `npx vitest run src/lib/crm/__tests__/schemas.test.ts`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] 5 migration files exist in `supabase/migrations/` (tables)
- [ ] 1 RLS migration file exists (20 policies for 5 tables)
- [ ] Local seed file exists at `supabase/seed.sql` (not a versioned migration)
- [ ] `src/types/database.ts` has Row/Insert/Update/Relationships for all 5 tables
- [ ] `src/lib/crm/schemas.ts` exports schemas + types for all 5 tables
- [ ] All enum values in SQL CHECK constraints match Zod schema values exactly
- [ ] All FK references match PR 3's `clients(client_id)` column name
- [ ] At least one negative RLS check confirms cross-tenant access is denied

---

## Test Criteria (from phasing plan)

> "Tables exist, RLS works, can insert/query via Supabase dashboard"

To verify after applying migrations to local Supabase:

```bash
# Apply all migrations
npx supabase db push

# Verify tables exist
npx supabase db query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('contacts', 'deals', 'interactions', 'crm_tasks', 'crm_config');"

# Verify RLS is enabled
npx supabase db query "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('contacts', 'deals', 'interactions', 'crm_tasks', 'crm_config');"

# Verify policy count (should be 20: 4 per table x 5 tables)
npx supabase db query "SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('contacts', 'deals', 'interactions', 'crm_tasks', 'crm_config');"
```

---

**Tasklist complete and saved to `docs/tasks/2026-03-01-pr5-crm-schema-seed-data-tasklist.md`. Open a new session to do batch execution with checkpoint.**
