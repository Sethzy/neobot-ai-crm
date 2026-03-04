# PR 12a: Knowledge Base Schema + Pages — Implementation Plan

**PR:** PR 12a: Knowledge Base schema + pages
**Decisions:** SERVICE-02, DATA-09
**Goal:** Add `vault_files` table with full-text search, build Knowledge Base list page with search and file upload.

**Architecture:** Per SERVICE-02, Knowledge Base uses Supabase Storage for file blobs + a `vault_files` metadata table in Postgres for structured discovery. Search is via SQL on the `vault_files` table using ILIKE (not directory listing, per TOOL-03). Upload writes to Storage first, then creates a `vault_files` row. The `fts` tsvector generated column is included for future agent-level full-text search. Tags and summary columns are nullable — AI-generated metadata is a Phase 2 concern (DATA-06 async reprocessing).

**Scope cuts (with rationale):**
- **AI-generated summary/tags:** Deferred. Columns exist as nullable for forward-compatibility, but no auto-generation in this PR.
- **File detail page:** Not required by test criteria. List page with search + upload + download is sufficient.
- **Agent vault sync (DATA-06 path-aware write_file):** Separate concern. This PR is the user-facing upload UI + schema. Agent reads vault via `read_file`; write_file vault sync is a follow-up PR.
- **Folder navigation:** YAGNI for v1. Flat file list with search.
- **Delete action:** Not required by test criteria. Omitted.

**Tech Stack:** Supabase (Postgres + Storage + RLS + Realtime), Zod, TanStack Query, TanStack Table, Vitest, React Testing Library

---

## Prerequisites

| PR | What it creates | Why PR 12a needs it |
|----|----------------|-------------------|
| PR 5 | CRM schema, `update_updated_at_column()` trigger function | Shared trigger function for `updated_at` |
| PR 7 | `agent-files` Storage bucket + `read_file`/`write_file` tools | Storage bucket for vault files |
| PR 9 | Realtime hook (`useRealtimeTable`) + realtime publication migration | Live updates when agent writes vault files |

**Verify before starting:**
- `supabase/migrations/` has files (latest: `20260303065320_add_step_count_to_runs.sql`)
- `src/hooks/use-realtime.ts` exports `useRealtimeTable` and `RealtimeTableName`
- `src/lib/supabase.ts` exports the singleton Supabase client
- `app/(dashboard)/knowledge/page.tsx` exists (placeholder "Coming soon")
- Sidebar already has Knowledge nav item at `/knowledge` with `BookOpen` icon (in `src/components/layout/app-sidebar.tsx`)

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
| 1 | Migration: `vault_files` table | 1 SQL create | — | — |
| 2 | RLS policies + realtime | 1 SQL create | — | Task 1 |
| 3 | Regenerate types + Zod schemas | 2 modify/create + 1 test create | 5 tests | Task 1-2 |
| 4 | Search filter builder | 1 source create + 1 test create | 3 tests | — |
| 5 | Data hook: `useVaultFiles` | 1 source create + 1 source modify + 1 test create | 5 tests | Task 3-4 |
| 6 | Upload function: `uploadVaultFile` | 1 source modify + 1 test modify | 3 tests | Task 3 |
| 7 | `VaultFilesTable` component | 1 source create | — | Task 3 |
| 8 | Knowledge Base list page | 1 source modify | — | Task 5-7 |
| 9 | Final verification + plan update | 2 modify | — | All |

**Total: ~12 files changed/created, ~16 new tests.**

---

## Relevant Files

**Create:**
- `supabase/migrations/20260303100000_create_vault_files.sql` — Table + indexes
- `supabase/migrations/20260303100001_vault_files_rls_realtime.sql` — RLS + realtime
- `src/lib/knowledge/schemas.ts` — Zod validators
- `src/lib/knowledge/__tests__/schemas.test.ts` — Schema tests
- `src/lib/knowledge/postgrest-filters.ts` — Search filter builder
- `src/lib/knowledge/__tests__/postgrest-filters.test.ts` — Filter tests
- `src/hooks/use-vault-files.ts` — TanStack Query hooks + upload mutation
- `src/hooks/__tests__/use-vault-files.test.tsx` — Hook + upload tests
- `src/components/knowledge/vault-files-table.tsx` — TanStack Table component

**Modify:**
- `src/types/database.ts` — Regenerate after migration
- `src/hooks/use-realtime.ts` — Add `"vault_files"` to `RealtimeTableName`
- `app/(dashboard)/knowledge/page.tsx` — Replace placeholder with real page
- `docs/product/plans/2026-03-01-implementation-phasing-plan.json` — Mark PR 12a status

**Reference (read-only):**
- `src/hooks/use-contacts.ts` — Hook pattern to follow
- `src/hooks/__tests__/use-contacts.test.tsx` — Test pattern to follow
- `src/components/crm/contacts-table.tsx` — Table component pattern
- `app/(dashboard)/crm/contacts/page.tsx` — List page pattern
- `src/lib/crm/postgrest-filters.ts` — Reuse `buildContainsIlikeLiteral`
- `src/hooks/use-client-id.ts` — Returns `{ data: string | undefined }`
- `supabase/migrations/20260301110005_crm_rls_policies.sql` — RLS policy pattern

---

## Task 1: Migration — `vault_files` Table

**Files:**
- Create: `supabase/migrations/20260303100000_create_vault_files.sql`

### Step 1: Write the migration

```sql
-- PR12a: Knowledge Base metadata table (SERVICE-02, DATA-09).
-- Stores file metadata for structured discovery. Blobs live in Supabase Storage.

CREATE TABLE public.vault_files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vault_files_client_path_unique UNIQUE (client_id, storage_path)
);

-- Tenant isolation index.
CREATE INDEX idx_vault_files_client_id ON public.vault_files(client_id);

-- Full-text search on title + filename + summary (for future agent SQL queries).
ALTER TABLE public.vault_files
  ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(filename, '') || ' ' ||
      coalesce(summary, '')
    )
  ) STORED;

CREATE INDEX idx_vault_files_fts ON public.vault_files USING gin(fts);

-- Auto-update updated_at on row changes.
CREATE TRIGGER update_vault_files_updated_at
  BEFORE UPDATE ON public.vault_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.vault_files IS 'Knowledge Base file metadata. Blobs in Supabase Storage under /{clientId}/vault/.';
COMMENT ON COLUMN public.vault_files.storage_path IS 'Path within agent-files bucket, e.g. {clientId}/vault/floor-plan.pdf';
COMMENT ON COLUMN public.vault_files.fts IS 'Generated tsvector for full-text search across title, filename, and summary.';
```

### Step 2: Apply the migration locally

```bash
Run: npx supabase db push
Expected: Migration applied. vault_files table created.
```

### Step 3: Verify table exists

```bash
Run: npx supabase db dump --schema public | grep -A5 'vault_files'
Expected: See vault_files table and fts column in DDL output.
```

### Step 4: Commit

```bash
git add supabase/migrations/20260303100000_create_vault_files.sql
git commit -m "feat(db): create vault_files table for Knowledge Base (SERVICE-02)"
```

---

## Task 2: RLS Policies + Realtime

**Files:**
- Create: `supabase/migrations/20260303100001_vault_files_rls_realtime.sql`

### Step 1: Write the migration

```sql
-- PR12a: RLS + Realtime for vault_files (DATA-03, DATA-07).

ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_files_select_own ON public.vault_files
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY vault_files_insert_own ON public.vault_files
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY vault_files_update_own ON public.vault_files
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY vault_files_delete_own ON public.vault_files
  FOR DELETE USING (client_id = public.get_my_client_id());

-- Enable Realtime so frontend auto-refreshes when agent writes vault files.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vault_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_files;
  END IF;
END $$;
```

### Step 2: Apply locally

```bash
Run: npx supabase db push
Expected: RLS enabled, 4 policies created, realtime publication updated.
```

### Step 3: Commit

```bash
git add supabase/migrations/20260303100001_vault_files_rls_realtime.sql
git commit -m "feat(db): add RLS + realtime for vault_files (DATA-03, DATA-07)"
```

---

## Task 3: Regenerate Types + Zod Schemas

**Files:**
- Modify: `src/types/database.ts` (regenerated)
- Create: `src/lib/knowledge/schemas.ts`
- Create: `src/lib/knowledge/__tests__/schemas.test.ts`

### Step 1: Regenerate Supabase TypeScript types

```bash
Run: npx supabase gen types typescript --local > src/types/database.ts
Expected: database.ts now includes vault_files table type with file_id, client_id, filename,
          storage_path, title, content_type, size_bytes, tags, summary, fts, created_at, updated_at.
```

### Step 2: Verify vault_files appears in types

Open `src/types/database.ts` and confirm the `vault_files` entry exists under `Tables`. Look for:
```typescript
vault_files: {
  Row: {
    file_id: string
    client_id: string
    filename: string
    storage_path: string
    title: string
    // ...
  }
}
```

### Step 3: Write failing schema tests

Create `src/lib/knowledge/__tests__/schemas.test.ts`:

```typescript
/**
 * Tests for Knowledge Base Zod schemas.
 * @module lib/knowledge/__tests__/schemas
 */
import { describe, expect, it } from "vitest";

import { vaultFileInsertSchema, vaultFileSchema } from "../schemas";

const validRow = {
  file_id: "550e8400-e29b-41d4-a716-446655440000",
  client_id: "660e8400-e29b-41d4-a716-446655440000",
  filename: "floor-plan.pdf",
  storage_path: "660e8400/vault/floor-plan.pdf",
  title: "floor-plan",
  content_type: "application/pdf",
  size_bytes: 1024000,
  tags: ["listing", "district-10"],
  summary: null,
  created_at: "2026-03-03T00:00:00.000Z",
  updated_at: "2026-03-03T00:00:00.000Z",
};

describe("vaultFileSchema", () => {
  it("validates a complete vault file row", () => {
    expect(vaultFileSchema.safeParse(validRow).success).toBe(true);
  });

  it("accepts null content_type, size_bytes, and summary", () => {
    const row = { ...validRow, content_type: null, size_bytes: null, summary: null };
    expect(vaultFileSchema.safeParse(row).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { file_id: _omitted, ...incomplete } = validRow;
    expect(vaultFileSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("vaultFileInsertSchema", () => {
  it("validates a minimal insert payload", () => {
    const payload = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      filename: "notes.md",
      storage_path: "660e8400/vault/notes.md",
      title: "notes",
    };
    expect(vaultFileInsertSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects empty filename", () => {
    const payload = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      filename: "",
      storage_path: "660e8400/vault/notes.md",
      title: "notes",
    };
    expect(vaultFileInsertSchema.safeParse(payload).success).toBe(false);
  });
});
```

### Step 4: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/knowledge/__tests__/schemas.test.ts
Expected: FAIL — Cannot find module "../schemas" (file doesn't exist yet)
```

### Step 5: Implement schemas

Create `src/lib/knowledge/schemas.ts`:

```typescript
/**
 * Zod schemas for Knowledge Base vault_files table.
 * @module lib/knowledge/schemas
 */
import { z } from "zod";

/** Full `vault_files` row validator (matches Supabase response shape). */
export const vaultFileSchema = z.object({
  file_id: z.string().uuid(),
  client_id: z.string().uuid(),
  filename: z.string(),
  storage_path: z.string(),
  title: z.string(),
  content_type: z.string().nullable(),
  size_bytes: z.number().nullable(),
  tags: z.array(z.string()),
  summary: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type VaultFile = z.infer<typeof vaultFileSchema>;

/** Insert payload for `vault_files` (id/timestamps auto-generated). */
export const vaultFileInsertSchema = z.object({
  client_id: z.string().uuid(),
  filename: z.string().min(1, "Filename is required"),
  storage_path: z.string().min(1, "Storage path is required"),
  title: z.string().min(1, "Title is required"),
  content_type: z.string().nullable().optional(),
  size_bytes: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().nullable().optional(),
});

export type VaultFileInsert = z.infer<typeof vaultFileInsertSchema>;
```

### Step 6: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/knowledge/__tests__/schemas.test.ts
Expected: 5 tests PASS
```

### Step 7: Commit

```bash
git add src/types/database.ts src/lib/knowledge/schemas.ts src/lib/knowledge/__tests__/schemas.test.ts
git commit -m "feat(knowledge): regenerate types + add vault_files Zod schemas (SERVICE-02)"
```

---

## Task 4: Search Filter Builder

**Files:**
- Create: `src/lib/knowledge/postgrest-filters.ts`
- Create: `src/lib/knowledge/__tests__/postgrest-filters.test.ts`

> **DRY note:** Reuses `buildContainsIlikeLiteral` from `src/lib/crm/postgrest-filters.ts` for PostgREST ILIKE escaping. Same escape logic, different column targets.

### Step 1: Write failing tests

Create `src/lib/knowledge/__tests__/postgrest-filters.test.ts`:

```typescript
/**
 * Tests for Knowledge Base PostgREST search filter builders.
 * @module lib/knowledge/__tests__/postgrest-filters
 */
import { describe, expect, it } from "vitest";

import { buildVaultSearchOrFilter } from "../postgrest-filters";

describe("buildVaultSearchOrFilter", () => {
  it("builds ILIKE filter for title and filename", () => {
    const result = buildVaultSearchOrFilter("floor plan");
    expect(result).toContain("title.ilike.");
    expect(result).toContain("filename.ilike.");
    expect(result).toContain("floor plan");
  });

  it("escapes PostgREST special characters", () => {
    const result = buildVaultSearchOrFilter("100%_match");
    expect(result).toContain("100\\%\\_match");
  });

  it("produces exactly two OR clauses (title, filename)", () => {
    const result = buildVaultSearchOrFilter("test");
    const clauses = result.split(",");
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toMatch(/^title\.ilike\./);
    expect(clauses[1]).toMatch(/^filename\.ilike\./);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/knowledge/__tests__/postgrest-filters.test.ts
Expected: FAIL — Cannot find module "../postgrest-filters"
```

### Step 3: Implement filter builder

Create `src/lib/knowledge/postgrest-filters.ts`:

```typescript
/**
 * PostgREST search filter builders for Knowledge Base queries.
 * @module lib/knowledge/postgrest-filters
 */
import { buildContainsIlikeLiteral } from "@/lib/crm/postgrest-filters";

/**
 * Builds an OR filter for vault file free-text search across title and filename.
 */
export function buildVaultSearchOrFilter(searchText: string): string {
  const containsLiteral = buildContainsIlikeLiteral(searchText);

  return [
    `title.ilike.${containsLiteral}`,
    `filename.ilike.${containsLiteral}`,
  ].join(",");
}
```

### Step 4: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/knowledge/__tests__/postgrest-filters.test.ts
Expected: 3 tests PASS
```

### Step 5: Commit

```bash
git add src/lib/knowledge/postgrest-filters.ts src/lib/knowledge/__tests__/postgrest-filters.test.ts
git commit -m "feat(knowledge): add vault search filter builder (SERVICE-02)"
```

---

## Task 5: Data Hook — `useVaultFiles`

**Files:**
- Create: `src/hooks/use-vault-files.ts`
- Create: `src/hooks/__tests__/use-vault-files.test.tsx`
- Modify: `src/hooks/use-realtime.ts` (add `"vault_files"` to `RealtimeTableName`)

> **Pattern reference:** Follow `src/hooks/use-contacts.ts` exactly — query key factory, standalone fetch function, `queryOptions()` factory, hook with realtime subscription.

### Step 1: Write failing tests

Create `src/hooks/__tests__/use-vault-files.test.tsx`:

```typescript
/**
 * Tests for Knowledge Base vault file query hooks.
 * @module hooks/__tests__/use-vault-files
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultFiles, vaultFileKeys } from "@/hooks/use-vault-files";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1" }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (options: unknown) => mockUseRealtimeTable(options),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createThenableBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

const mockFile = {
  file_id: "file-1",
  client_id: "client-1",
  filename: "test.pdf",
  storage_path: "client-1/vault/test.pdf",
  title: "test",
  content_type: "application/pdf",
  size_bytes: 1024,
  tags: [],
  summary: null,
  created_at: "2026-03-03T00:00:00Z",
  updated_at: "2026-03-03T00:00:00Z",
};

describe("vaultFileKeys", () => {
  it("builds stable key namespaces", () => {
    expect(vaultFileKeys.all).toEqual(["vault-files"]);
    expect(vaultFileKeys.lists()).toEqual(["vault-files", "list"]);
    expect(vaultFileKeys.list({ search: "floor" })).toEqual([
      "vault-files",
      "list",
      { search: "floor" },
    ]);
  });
});

describe("useVaultFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches vault files ordered by updated_at descending", async () => {
    const builder = createThenableBuilder([mockFile]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("vault_files");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("applies search via or() on title and filename", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({ search: "floor plan" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledTimes(1);
    expect(builder.or.mock.calls[0]?.[0]).toContain("title.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("filename.ilike");
  });

  it("does not apply or() filter when search is empty", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).not.toHaveBeenCalled();
  });

  it("surfaces Supabase errors", async () => {
    const builder = createThenableBuilder([], { message: "RLS denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/hooks/__tests__/use-vault-files.test.tsx
Expected: FAIL — Cannot find module "@/hooks/use-vault-files"
```

### Step 3: Add `"vault_files"` to `RealtimeTableName`

Modify `src/hooks/use-realtime.ts` — add `"vault_files"` to the union type:

```typescript
export type RealtimeTableName =
  | "conversation_threads"
  | "conversation_messages"
  | "contacts"
  | "deals"
  | "interactions"
  | "crm_tasks"
  | "vault_files";
```

### Step 4: Implement `useVaultFiles`

Create `src/hooks/use-vault-files.ts`:

```typescript
/**
 * TanStack Query hooks for Knowledge Base vault files.
 * @module hooks/use-vault-files
 */
"use client";

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildVaultSearchOrFilter } from "@/lib/knowledge/postgrest-filters";
import type { VaultFile } from "@/lib/knowledge/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export interface VaultFileFilters {
  search?: string;
}

/** TanStack Query key factory for vault files. */
export const vaultFileKeys = {
  all: ["vault-files"] as const,
  lists: () => [...vaultFileKeys.all, "list"] as const,
  list: (filters?: VaultFileFilters) =>
    [...vaultFileKeys.lists(), filters ?? {}] as const,
};

/** Fetch vault files from Supabase with optional search. */
async function fetchVaultFiles(filters: VaultFileFilters): Promise<VaultFile[]> {
  let query = supabase
    .from("vault_files")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.or(buildVaultSearchOrFilter(filters.search.trim()));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as VaultFile[];
}

/** Query options factory for vault files (exportable for SSR prefetch). */
export function vaultFilesQueryOptions(filters: VaultFileFilters) {
  return queryOptions({
    queryKey: vaultFileKeys.list(filters),
    queryFn: () => fetchVaultFiles(filters),
  });
}

/**
 * Subscribes to vault file row changes and returns vault files list query state.
 */
export function useVaultFiles(filters: VaultFileFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "vault_files",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [vaultFileKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...vaultFilesQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

// ── Upload ──────────────────────────────────────────────────────────────────

const AGENT_FILES_BUCKET = "agent-files";

/**
 * Upload a file to Supabase Storage and create a vault_files metadata row.
 * Uses upsert so re-uploading the same filename updates the existing row.
 */
export async function uploadVaultFile(
  client: SupabaseClient<Database>,
  clientId: string,
  file: File,
): Promise<VaultFile> {
  const storagePath = `${clientId}/vault/${file.name}`;

  // 1. Upload blob to Storage.
  const { error: storageError } = await client.storage
    .from(AGENT_FILES_BUCKET)
    .upload(storagePath, file, { upsert: true });

  if (storageError) {
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  // 2. Upsert metadata row (UNIQUE on client_id + storage_path).
  const { data, error: dbError } = await client
    .from("vault_files")
    .upsert(
      {
        client_id: clientId,
        filename: file.name,
        storage_path: storagePath,
        title: file.name.replace(/\.[^/.]+$/, ""),
        content_type: file.type || null,
        size_bytes: file.size,
      },
      { onConflict: "client_id,storage_path" },
    )
    .select()
    .single();

  if (dbError) {
    throw new Error(`Failed to create vault file record: ${dbError.message}`);
  }

  return data as VaultFile;
}

/**
 * Mutation hook for uploading files to the Knowledge Base.
 * Invalidates vault file list queries on success.
 */
export function useUploadVaultFile() {
  const { data: clientId } = useClientId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!clientId) throw new Error("Not authenticated");
      return uploadVaultFile(supabase, clientId, file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vaultFileKeys.lists() });
    },
  });
}
```

### Step 5: Run tests to verify they pass

```bash
Run: npx vitest run src/hooks/__tests__/use-vault-files.test.tsx
Expected: 5 tests PASS
```

### Step 6: Run existing realtime and hook tests for regressions

```bash
Run: npx vitest run src/hooks/__tests__/
Expected: All tests PASS (vault_files added to RealtimeTableName is additive)
```

### Step 7: Commit

```bash
git add src/hooks/use-vault-files.ts src/hooks/__tests__/use-vault-files.test.tsx src/hooks/use-realtime.ts
git commit -m "feat(knowledge): add useVaultFiles hook with search + upload (SERVICE-02)"
```

---

## Task 6: Upload Function Tests

**Files:**
- Modify: `src/hooks/__tests__/use-vault-files.test.tsx` (add upload tests)

> **Note:** The `uploadVaultFile` function was implemented in Task 5. This task adds TDD tests for the upload logic specifically — testing the Storage + DB upsert flow with mocks.

### Step 1: Write failing upload tests

Append to `src/hooks/__tests__/use-vault-files.test.tsx`:

```typescript
import { uploadVaultFile } from "@/hooks/use-vault-files";

describe("uploadVaultFile", () => {
  it("uploads to Storage and upserts DB row", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: "client-1/vault/test.pdf" },
      error: null,
    });
    const mockSingle = vi.fn().mockResolvedValue({ data: mockFile, error: null });
    const mockSelect = vi.fn(() => ({ single: mockSingle }));
    const mockUpsert = vi.fn(() => ({ select: mockSelect }));

    const mock = {
      storage: { from: vi.fn(() => ({ upload: mockUpload })) },
      from: vi.fn(() => ({ upsert: mockUpsert })),
    } as never;

    const file = new File(["test content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 1024 });

    const result = await uploadVaultFile(mock, "client-1", file);

    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/vault/test.pdf",
      file,
      { upsert: true },
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-1",
        filename: "test.pdf",
        storage_path: "client-1/vault/test.pdf",
        title: "test",
        content_type: "application/pdf",
        size_bytes: 1024,
      }),
      { onConflict: "client_id,storage_path" },
    );
    expect(result).toEqual(mockFile);
  });

  it("throws on Storage upload failure", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "bucket not found" },
    });

    const mock = {
      storage: { from: vi.fn(() => ({ upload: mockUpload })) },
    } as never;

    const file = new File(["test"], "test.pdf", { type: "application/pdf" });

    await expect(uploadVaultFile(mock, "client-1", file)).rejects.toThrow(
      "Storage upload failed: bucket not found",
    );
  });

  it("throws on DB upsert failure after successful upload", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ data: { path: "ok" }, error: null });
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "unique violation" },
    });

    const mock = {
      storage: { from: vi.fn(() => ({ upload: mockUpload })) },
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({ single: mockSingle })),
        })),
      })),
    } as never;

    const file = new File(["test"], "test.pdf", { type: "application/pdf" });

    await expect(uploadVaultFile(mock, "client-1", file)).rejects.toThrow(
      "Failed to create vault file record: unique violation",
    );
  });
});
```

### Step 2: Run tests to verify they pass

Since `uploadVaultFile` was already implemented in Task 5, these tests should pass immediately. If they don't, fix the implementation until they do.

```bash
Run: npx vitest run src/hooks/__tests__/use-vault-files.test.tsx
Expected: 8 tests PASS (5 from Task 5 + 3 new upload tests)
```

> **TDD note:** The upload function was written alongside its hook in Task 5 for co-location. These tests verify the Storage→DB flow explicitly with mocked Supabase clients. If any test fails, fix the `uploadVaultFile` implementation — do not modify the test expectations.

### Step 3: Commit

```bash
git add src/hooks/__tests__/use-vault-files.test.tsx
git commit -m "test(knowledge): add uploadVaultFile unit tests (SERVICE-02)"
```

---

## Task 7: `VaultFilesTable` Component

**Files:**
- Create: `src/components/knowledge/vault-files-table.tsx`

> **Pattern reference:** Follow `src/components/crm/contacts-table.tsx` exactly — TanStack Table with `createColumnHelper`, sorting, same styling classes.

### Step 1: Create the table component

Create `src/components/knowledge/vault-files-table.tsx`:

```typescript
/**
 * Knowledge Base file table with sortable columns and download action.
 * @module components/knowledge/vault-files-table
 */
"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import type { VaultFile } from "@/lib/knowledge/schemas";
import { supabase } from "@/lib/supabase";

const columnHelper = createColumnHelper<VaultFile>();

/** Format bytes to human-readable file size. */
function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format ISO timestamp to short locale date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Map MIME type to short display label. */
function formatContentType(type: string | null): string {
  if (!type) return "—";
  if (type.includes("pdf")) return "PDF";
  if (type.includes("word")) return "Word";
  if (type.includes("markdown") || type === "text/plain") return "Text";
  if (type.includes("image")) return "Image";
  if (type.includes("sheet") || type.includes("csv")) return "Sheet";
  return type.split("/").pop() ?? type;
}

/** Create a signed download URL and trigger browser download. */
async function handleDownload(storagePath: string, filename: string) {
  const { data, error } = await supabase.storage
    .from("agent-files")
    .createSignedUrl(storagePath, 60);

  if (error || !data?.signedUrl) return;

  const anchor = document.createElement("a");
  anchor.href = data.signedUrl;
  anchor.download = filename;
  anchor.click();
}

interface VaultFilesTableProps {
  files: VaultFile[];
}

export function VaultFilesTable({ files }: VaultFilesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => (
          <span className="font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("filename", {
        header: "File",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("content_type", {
        header: "Type",
        cell: (info) => formatContentType(info.getValue()),
      }),
      columnHelper.accessor("size_bytes", {
        header: "Size",
        cell: (info) => formatFileSize(info.getValue()),
      }),
      columnHelper.accessor("updated_at", {
        header: "Updated",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload(
                info.row.original.storage_path,
                info.row.original.filename,
              );
            }}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: files,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
        <p className="text-muted-foreground">
          No files yet. Upload documents to build your knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 md:px-5 md:py-4"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {{ asc: " ↑", desc: " ↓" }[
                      header.column.getIsSorted() as string
                    ] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-border/30 transition-colors hover:bg-muted/40"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 py-3 text-[13px] text-foreground/80 md:px-5 md:py-4"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 2: Verify no TypeScript errors

```bash
Run: npx tsc --noEmit --pretty 2>&1 | head -30
Expected: No errors related to vault-files-table.tsx
```

### Step 3: Commit

```bash
git add src/components/knowledge/vault-files-table.tsx
git commit -m "feat(knowledge): add VaultFilesTable component (SERVICE-02)"
```

---

## Task 8: Knowledge Base List Page

**Files:**
- Modify: `app/(dashboard)/knowledge/page.tsx` (replace placeholder)

> **Pattern reference:** Follow `app/(dashboard)/crm/contacts/page.tsx` exactly — client component, search state, loading/error/empty states, data table.

### Step 1: Replace placeholder page

Replace contents of `app/(dashboard)/knowledge/page.tsx`:

```typescript
/**
 * Knowledge Base list page with search and file upload.
 * @module app/(dashboard)/knowledge/page
 */
"use client";

import { FileText, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { VaultFilesTable } from "@/components/knowledge/vault-files-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadVaultFile, useVaultFiles } from "@/hooks/use-vault-files";

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => {
    const normalizedSearch = search.trim();
    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [search]);

  const { data: files = [], isLoading, isError, refetch } = useVaultFiles(filters);
  const upload = useUploadVaultFile();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await upload.mutateAsync(file);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Knowledge Base
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Upload and search documents your AI agent can reference.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or filename…"
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.md,.txt,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
        />
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="h-12 gap-2"
        >
          <Upload className="h-4 w-4" />
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {upload.isError && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Upload failed: {upload.error?.message}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load files</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {filters.search
                ? "No files match your search"
                : "No files yet. Upload documents to get started."}
            </p>
          </div>
        ) : (
          <VaultFilesTable files={files} />
        )}
      </div>
    </div>
  );
}
```

### Step 2: Verify locally in browser

```bash
Run: npm run dev
Navigate to: http://localhost:3000/knowledge
Expected: See "Knowledge Base" heading, search bar, Upload button, and empty state.
          Upload a file — it should appear in the table.
          Search — table should filter by title/filename.
```

### Step 3: Commit

```bash
git add app/(dashboard)/knowledge/page.tsx
git commit -m "feat(knowledge): Knowledge Base list page with search + upload (SERVICE-02)"
```

---

## Task 9: Final Verification + Plan Update

**Files:**
- Modify: `docs/product/plans/2026-03-01-implementation-phasing-plan.json`

### Step 1: Run full test suite

```bash
Run: npx vitest run
Expected: ALL tests pass — no regressions.
```

### Step 2: TypeScript check

```bash
Run: npx tsc --noEmit
Expected: No errors.
```

### Step 3: Update implementation plan JSON

In `docs/product/plans/2026-03-01-implementation-phasing-plan.json`:
- Set PR 12a `status` to `"done"`
- Set all PR12a tasks `done` to `true`
- Add changelog entry: `"2026-03-03: PR 12a marked done — vault_files table, RLS, Knowledge Base page with search + upload"`

### Step 4: Commit

```bash
git add docs/product/plans/2026-03-01-implementation-phasing-plan.json
git commit -m "chore: mark PR 12a done in implementation plan"
```

---

## Verification Checklist

Before marking PR 12a complete:

- [ ] Migration applied: `vault_files` table with `fts` tsvector + UNIQUE constraint
- [ ] RLS: 4 policies on `vault_files` using `get_my_client_id()`
- [ ] Realtime: `vault_files` added to `supabase_realtime` publication
- [ ] `database.ts` regenerated with `vault_files` types
- [ ] Zod schemas validate rows and inserts (5 tests)
- [ ] Search filter builder works (3 tests)
- [ ] `useVaultFiles` hook fetches + searches + subscribes to realtime (5 tests)
- [ ] `uploadVaultFile` uploads to Storage + upserts DB row (3 tests)
- [ ] `VaultFilesTable` renders with sorting + download action
- [ ] Knowledge Base page: search, upload, loading/error/empty states
- [ ] Navigation: `/knowledge` already in sidebar — page loads correctly
- [ ] Full test suite passes (`npx vitest run`)
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Implementation plan JSON updated: PR 12a → `"done"`

---

## Notes

- **Navigation (PR12a-5) is already done:** `app-sidebar.tsx` has Knowledge at `/knowledge` with `BookOpen` icon. The placeholder page just needed replacing.
- **`fts` tsvector is forward-looking:** Included in the schema per the implementation plan spec but the UI uses ILIKE for v1 search (matches CRM pattern). The tsvector enables future agent-level full-text search via SQL and PostgREST's `.textSearch()`.
- **`buildContainsIlikeLiteral` reuse is intentional (DRY):** The escape function in `src/lib/crm/postgrest-filters.ts` is generic PostgREST utility logic. If a third consumer appears, extract to a shared `src/lib/postgrest/` module.
- **Upsert handles re-uploads:** The UNIQUE constraint on `(client_id, storage_path)` + `.upsert({ onConflict })` means uploading the same filename updates the existing row rather than failing.
- **Storage bucket is `agent-files`:** Created in PR 7. Vault files live at `{clientId}/vault/{filename}` within this bucket, alongside memory and agent files. RLS on the bucket scopes access by client path prefix.
- **No file detail page in v1:** The list + search + download covers the test criteria. Detail pages (with preview, metadata editing, tag management) are Phase 2+ scope.
- **`useClientId()` returns `{ data: string | undefined }`:** All hooks use `const { data: clientId } = useClientId()` and guard with `enabled: Boolean(clientId)`.
