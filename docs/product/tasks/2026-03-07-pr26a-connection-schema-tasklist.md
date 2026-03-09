# PR 26a: Connection Schema + Queries Implementation Plan

**PR:** PR 26a (sub-PR of PR 26: Connection tools)
**Decisions:** CONN-02, CONN-03, TOOL-04
**Goal:** Update the `connections` table schema and query layer to support multi-connection per toolkit, per-tool activation, pending status, and enriched metadata.

**Architecture:** Multi-connection per toolkit (drop unique constraint), per-tool activation via `activated_tools text[]` column, `pending` status for in-progress OAuth flows, `account_identifier` for display, `tool_count` for total available tools. All changes are data-layer only — no tools, no runner wiring, no Composio SDK calls. Follows existing patterns in `src/lib/connections/schemas.ts` and `queries.ts`. Uses `createMockSupabaseClient` from `src/test/mocks/supabase.ts` for query tests.

**Tech Stack:** Supabase (Postgres + RLS), Zod 4, Vitest

---

## Relevant Files

### Create
- `supabase/migrations/20260308040000_pr26a_connection_schema_updates.sql`
- `src/lib/connections/__tests__/schemas.test.ts` (already exists — modify)
- `src/lib/connections/__tests__/queries.test.ts` (already exists — modify)

### Modify
- `src/lib/connections/schemas.ts`
- `src/lib/connections/queries.ts`
- `app/api/connections/callback/route.ts`
- `app/api/connections/initiate/route.ts`
- `src/types/database.ts` (regenerate)

---

## Task 1: Schema migration — multi-connection + per-tool activation + tool_count

**Files:**
- Create: `supabase/migrations/20260308040000_pr26a_connection_schema_updates.sql`

### Step 1: Write the migration SQL

```sql
-- PR 26a: Connection schema updates for multi-connection, per-tool activation, and tool_count.
--
-- Changes:
-- 1. Add 'pending' to status check constraint (for in-progress OAuth flows)
-- 2. Drop unique constraint on (client_id, toolkit_slug) to allow multi-connection per toolkit
-- 3. Add account_identifier (e.g. email associated with the OAuth account)
-- 4. Add activated_tools text[] (per-tool activation — which tools the user has approved)
-- 5. Add tool_count integer (total available tools for this toolkit, set on OAuth completion)
-- 6. Add composite index for common query patterns

-- 1. Widen the status enum to include 'pending'
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE connections ADD CONSTRAINT connections_status_check
  CHECK (status IN ('active', 'inactive', 'error', 'pending'));

-- 2. Allow multiple connections per toolkit per client
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_client_id_toolkit_slug_key;

-- 3. New columns
ALTER TABLE connections ADD COLUMN IF NOT EXISTS account_identifier text;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS activated_tools text[] NOT NULL DEFAULT '{}';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS tool_count integer NOT NULL DEFAULT 0;

-- 4. Index for getActiveConnections / getAllConnections queries
CREATE INDEX IF NOT EXISTS idx_connections_client_status
  ON connections (client_id, status);
```

### Step 2: Apply migration locally

Run:
```bash
npx supabase migration up --local
```
Expected: Migration applies cleanly, no errors.

### Step 3: Verify schema in local DB

Run:
```bash
npx supabase db dump --local --schema public | grep -A 30 "CREATE TABLE.*connections"
```
Expected: Table includes `account_identifier text`, `activated_tools text[]`, `tool_count integer`, status check includes `'pending'`, no unique constraint on `(client_id, toolkit_slug)`.

### Step 4: Commit

```bash
git add supabase/migrations/20260308040000_pr26a_connection_schema_updates.sql
git commit -m "feat(pr26a): schema migration for multi-connection, per-tool activation, and tool_count"
```

---

## Task 2: Update Zod schemas — add new columns and pending status

**Files:**
- Modify: `src/lib/connections/schemas.ts`
- Modify: `src/lib/connections/__tests__/schemas.test.ts`

### Step 1: Write the failing test — `connectionStatusValues` includes `"pending"`

Open `src/lib/connections/__tests__/schemas.test.ts`. The existing test on line 15 asserts:
```typescript
expect(connectionStatusValues).toEqual(["active", "inactive", "error"]);
```

Update it to expect the new value:

```typescript
// src/lib/connections/__tests__/schemas.test.ts
// Replace the existing test inside describe("connectionStatusValues")
it("includes active, inactive, error, and pending", () => {
  expect(connectionStatusValues).toEqual(["active", "inactive", "error", "pending"]);
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/schemas.test.ts
```
Expected: FAIL — `connectionStatusValues` is `["active", "inactive", "error"]`, not `["active", "inactive", "error", "pending"]`.

### Step 3: Write the failing test — `connectionRowSchema` rejects `"pending"` currently

The existing test on line 37 already tests this:
```typescript
it("rejects an invalid status", () => {
  expect(connectionRowSchema.safeParse({ ...validRow, status: "pending" }).success).toBe(false);
});
```

Replace it with a test that expects `"pending"` to be ACCEPTED:

```typescript
it("accepts pending status", () => {
  expect(
    connectionRowSchema.safeParse({ ...validRow, status: "pending" }).success,
  ).toBe(true);
});

it("rejects an invalid status", () => {
  expect(
    connectionRowSchema.safeParse({ ...validRow, status: "broken" }).success,
  ).toBe(false);
});
```

### Step 4: Write the failing test — `connectionRowSchema` accepts new columns

Add to the `describe("connectionRowSchema")` block after `validRow`:

```typescript
const validRowWithNewColumns = {
  ...validRow,
  account_identifier: "user@gmail.com",
  activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
  tool_count: 45,
};

it("parses a row with new columns (account_identifier, activated_tools, tool_count)", () => {
  expect(connectionRowSchema.safeParse(validRowWithNewColumns).success).toBe(true);
});

it("defaults activated_tools to empty array when omitted", () => {
  const result = connectionRowSchema.safeParse(validRow);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.activated_tools).toEqual([]);
  }
});

it("defaults tool_count to 0 when omitted", () => {
  const result = connectionRowSchema.safeParse(validRow);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.tool_count).toBe(0);
  }
});

it("accepts null account_identifier", () => {
  expect(
    connectionRowSchema.safeParse({ ...validRow, account_identifier: null }).success,
  ).toBe(true);
});
```

### Step 5: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/connections/__tests__/schemas.test.ts
```
Expected: Multiple FAILs — `"pending"` rejected, new columns not recognized, defaults not applied.

### Step 6: Implement — update `schemas.ts`

```typescript
// src/lib/connections/schemas.ts
export const connectionStatusValues = ["active", "inactive", "error", "pending"] as const;

export const connectionRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  composio_connected_account_id: z.string().min(1),
  toolkit_slug: z.string().min(1),
  display_name: z.string().nullable(),
  account_identifier: z.string().nullable().default(null),
  status: z.enum(connectionStatusValues),
  activated_tools: z.array(z.string()).default([]),
  tool_count: z.number().int().nonnegative().default(0),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
```

Also update `connectionInsertSchema` to include new optional fields:

```typescript
export const connectionInsertSchema = connectionRowSchema
  .omit({
    id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    display_name: z.string().nullable().optional(),
    account_identifier: z.string().nullable().optional(),
    activated_tools: z.array(z.string()).optional().default([]),
    tool_count: z.number().int().nonnegative().optional().default(0),
  });
```

### Step 7: Write the failing test — `connectionInsertSchema` accepts new fields

Add to `describe("connectionInsertSchema")`:

```typescript
it("accepts insert payload with new columns", () => {
  expect(
    connectionInsertSchema.safeParse({
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "conn_123abc",
      toolkit_slug: "gmail",
      status: "pending",
      account_identifier: null,
      activated_tools: ["GMAIL_SEND_EMAIL"],
      tool_count: 0,
    }).success,
  ).toBe(true);
});

it("defaults activated_tools and tool_count in insert payload", () => {
  const result = connectionInsertSchema.safeParse({
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_123abc",
    toolkit_slug: "gmail",
    status: "active",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.activated_tools).toEqual([]);
    expect(result.data.tool_count).toBe(0);
  }
});
```

### Step 8: Run all tests to verify they pass

Run:
```bash
npx vitest run src/lib/connections/__tests__/schemas.test.ts
```
Expected: ALL PASS.

### Step 9: Commit

```bash
git add src/lib/connections/schemas.ts src/lib/connections/__tests__/schemas.test.ts
git commit -m "feat(pr26a): add pending status, activated_tools, tool_count, account_identifier to Zod schemas"
```

---

## Task 3: New query functions

**Files:**
- Modify: `src/lib/connections/queries.ts`
- Modify: `src/lib/connections/__tests__/queries.test.ts`

The test file uses `createMockSupabaseClient` from `src/test/mocks/supabase.ts`. This mock records all chained method calls in `supabase.calls.methods` and returns configured results.

### Step 1: Write the failing test — `insertConnection`

Add to `src/lib/connections/__tests__/queries.test.ts`. First update the imports:

```typescript
import {
  getActiveConnectionByToolkit,
  getActiveConnections,
  getActiveToolkitSlugs,
  getAllConnections,
  getConnectionById,
  getConnectionsByIds,
  deleteConnection,
  insertConnection,
  updateConnectionActivatedTools,
  updateConnectionStatus,
} from "../queries";
```

Update the `ACTIVE_CONNECTIONS` fixture to include new columns:

```typescript
const ACTIVE_CONNECTIONS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_123abc",
    toolkit_slug: "gmail",
    display_name: "Gmail",
    account_identifier: "user@gmail.com",
    status: "active",
    activated_tools: ["GMAIL_SEND_EMAIL"],
    tool_count: 45,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "770e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    composio_connected_account_id: "conn_456def",
    toolkit_slug: "googlecalendar",
    display_name: "Google Calendar",
    account_identifier: null,
    status: "active",
    activated_tools: [],
    tool_count: 20,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
];
```

Add the `insertConnection` test block:

```typescript
describe("insertConnection", () => {
  it("inserts and returns the parsed row", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await insertConnection(supabase as never, {
      client_id: ACTIVE_CONNECTIONS[0].client_id,
      composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
      toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
      display_name: ACTIVE_CONNECTIONS[0].display_name,
      status: "active",
    });

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.from).toEqual(["connections"]);
    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({ method: "insert" }),
    );
    expect(supabase.calls.methods).toContainEqual({ method: "single", args: [] });
  });

  it("does NOT use onConflict (multi-connection allowed)", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    await insertConnection(supabase as never, {
      client_id: ACTIVE_CONNECTIONS[0].client_id,
      composio_connected_account_id: ACTIVE_CONNECTIONS[0].composio_connected_account_id,
      toolkit_slug: ACTIVE_CONNECTIONS[0].toolkit_slug,
      status: "active",
    });

    const upsertCalls = supabase.calls.methods.filter((m) => m.method === "upsert");
    expect(upsertCalls).toHaveLength(0);
  });

  it("throws when the insert fails", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    await expect(
      insertConnection(supabase as never, {
        client_id: ACTIVE_CONNECTIONS[0].client_id,
        composio_connected_account_id: "conn_new",
        toolkit_slug: "gmail",
        status: "pending",
      }),
    ).rejects.toThrow("Failed to insert connection: insert failed");
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts
```
Expected: FAIL — `insertConnection` is not exported from `../queries`.

### Step 3: Implement `insertConnection`

Add to `src/lib/connections/queries.ts`:

```typescript
/** Inserts a new connection row. Does NOT upsert — multi-connection per toolkit is allowed. */
export async function insertConnection(
  supabase: ConnectionSupabaseClient,
  data: ConnectionInsert,
): Promise<ConnectionRow> {
  const parsedInput = connectionInsertSchema.parse(data);
  const { data: row, error } = await supabase
    .from("connections")
    .insert(parsedInput)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to insert connection: ${error.message}`);
  }

  return connectionRowSchema.parse(row);
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "insertConnection"
```
Expected: ALL PASS.

### Step 5: Write the failing test — `getAllConnections`

```typescript
describe("getAllConnections", () => {
  const MIXED_CONNECTIONS = [
    ACTIVE_CONNECTIONS[0],
    { ...ACTIVE_CONNECTIONS[1], status: "inactive" },
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "880e8400-e29b-41d4-a716-446655440000",
      status: "error",
    },
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "990e8400-e29b-41d4-a716-446655440000",
      status: "pending",
      composio_connected_account_id: "conn_pending",
    },
  ];

  it("returns connections of ALL statuses", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: MIXED_CONNECTIONS, error: null },
    });

    const result = await getAllConnections(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
    );

    expect(result).toHaveLength(4);
    expect(result.map((c) => c.status)).toEqual(["active", "inactive", "error", "pending"]);
  });

  it("does NOT filter by status (no .eq('status', ...) call)", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    await getAllConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id);

    const statusFilters = supabase.calls.methods.filter(
      (m) => m.method === "eq" && m.args[0] === "status",
    );
    expect(statusFilters).toHaveLength(0);
  });

  it("throws when the query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      getAllConnections(supabase as never, ACTIVE_CONNECTIONS[0].client_id),
    ).rejects.toThrow("Failed to load connections: db down");
  });
});
```

### Step 6: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getAllConnections"
```
Expected: FAIL — `getAllConnections` is not exported.

### Step 7: Implement `getAllConnections`

```typescript
/** Loads ALL connections for one client (all statuses). */
export async function getAllConnections(
  supabase: ConnectionSupabaseClient,
  clientId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .order("toolkit_slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to load connections: ${error.message}`);
  }

  return parseConnectionRows(data);
}
```

### Step 8: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getAllConnections"
```
Expected: ALL PASS.

### Step 9: Write the failing test — `getActiveConnectionsByToolkit`

> **Review finding (Finding 2):** Composio supports multiple connected accounts per toolkit per user. The existing `getActiveConnectionByToolkit` (singular) returns only one row. We need a plural variant that returns **all** active connections for a toolkit, since the runner and tool loaders must handle multi-connection correctly.

```typescript
describe("getActiveConnectionsByToolkit", () => {
  const MULTI_GMAIL_CONNECTIONS = [
    ACTIVE_CONNECTIONS[0],
    {
      ...ACTIVE_CONNECTIONS[0],
      id: "770e8400-e29b-41d4-a716-446655440000",
      composio_connected_account_id: "conn_gmail_work",
      display_name: "Work Gmail",
    },
  ];

  it("returns all active connections for a toolkit", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: MULTI_GMAIL_CONNECTIONS, error: null },
    });

    const result = await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual([
      ACTIVE_CONNECTIONS[0].id,
      "770e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("filters by status=active AND toolkit_slug", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: MULTI_GMAIL_CONNECTIONS, error: null },
    });

    await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["toolkit_slug", "gmail"],
    });
  });

  it("returns empty array when no active connections exist", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await getActiveConnectionsByToolkit(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "gmail",
    );

    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      getActiveConnectionsByToolkit(supabase as never, "client-1", "gmail"),
    ).rejects.toThrow("Failed to load connections for toolkit: db down");
  });
});
```

### Step 10: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getActiveConnectionsByToolkit"
```
Expected: FAIL — `getActiveConnectionsByToolkit` is not exported.

### Step 11: Implement `getActiveConnectionsByToolkit`

```typescript
/** Loads ALL active connections for a specific toolkit. Supports multi-connection per toolkit. */
export async function getActiveConnectionsByToolkit(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  toolkitSlug: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("toolkit_slug", toolkitSlug)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load connections for toolkit: ${error.message}`);
  }

  return parseConnectionRows(data);
}
```

### Step 12: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getActiveConnectionsByToolkit"
```
Expected: ALL PASS.

### Step 13: Write the failing test — `getConnectionById`

> Steps 13-33 renumbered from original 9-29 after inserting `getActiveConnectionsByToolkit` (steps 9-12).

```typescript
describe("getConnectionById", () => {
  it("returns the connection when found", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [ACTIVE_CONNECTIONS[0]], error: null },
    });

    const result = await getConnectionById(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS[0]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", ACTIVE_CONNECTIONS[0].client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["id", ACTIVE_CONNECTIONS[0].id],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null when not found", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await getConnectionById(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      "nonexistent-id",
    );

    expect(result).toBeNull();
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "boom" } },
    });

    await expect(
      getConnectionById(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "some-id"),
    ).rejects.toThrow("Failed to load connection: boom");
  });
});
```

### Step 14: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getConnectionById"
```
Expected: FAIL — `getConnectionById` is not exported.

### Step 15: Implement `getConnectionById`

```typescript
/** Loads one connection by ID, scoped to the client. Returns null if not found. */
export async function getConnectionById(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load connection: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}
```

### Step 16: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getConnectionById"
```
Expected: ALL PASS.

### Step 17: Write the failing test — `getConnectionsByIds`

```typescript
describe("getConnectionsByIds", () => {
  it("returns matching connections", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: ACTIVE_CONNECTIONS, error: null },
    });

    const ids = ACTIVE_CONNECTIONS.map((c) => c.id);
    const result = await getConnectionsByIds(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ids,
    );

    expect(result).toEqual(ACTIVE_CONNECTIONS);
    expect(supabase.calls.methods).toContainEqual({
      method: "in",
      args: ["id", ids],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "in failed" } },
    });

    await expect(
      getConnectionsByIds(supabase as never, ACTIVE_CONNECTIONS[0].client_id, ["a"]),
    ).rejects.toThrow("Failed to load connections: in failed");
  });
});
```

### Step 18: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getConnectionsByIds"
```
Expected: FAIL — `getConnectionsByIds` is not exported.

### Step 19: Implement `getConnectionsByIds`

```typescript
/** Loads multiple connections by ID array, scoped to the client. */
export async function getConnectionsByIds(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionIds: string[],
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .in("id", connectionIds);

  if (error) {
    throw new Error(`Failed to load connections: ${error.message}`);
  }

  return parseConnectionRows(data);
}
```

### Step 20: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "getConnectionsByIds"
```
Expected: ALL PASS.

### Step 21: Write the failing test — `deleteConnection`

```typescript
describe("deleteConnection", () => {
  it("deletes and confirms via count", async () => {
    const supabase = createMockSupabaseClient({
      deleteResult: { data: null, error: null },
    });

    await deleteConnection(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
    );

    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({ method: "delete" }),
    );
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", ACTIVE_CONNECTIONS[0].client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["id", ACTIVE_CONNECTIONS[0].id],
    });
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      deleteResult: { data: null, error: { message: "delete failed" } },
    });

    await expect(
      deleteConnection(supabase as never, ACTIVE_CONNECTIONS[0].client_id, "some-id"),
    ).rejects.toThrow("Failed to delete connection: delete failed");
  });
});
```

### Step 22: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "deleteConnection"
```
Expected: FAIL — `deleteConnection` is not exported.

### Step 23: Implement `deleteConnection`

```typescript
/** Hard-deletes a connection row by ID, scoped to the client. */
export async function deleteConnection(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("client_id", clientId)
    .eq("id", connectionId);

  if (error) {
    throw new Error(`Failed to delete connection: ${error.message}`);
  }
}
```

### Step 24: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "deleteConnection"
```
Expected: ALL PASS.

### Step 25: Write the failing test — `updateConnectionActivatedTools`

```typescript
describe("updateConnectionActivatedTools", () => {
  it("updates activated_tools and returns the updated row", async () => {
    const updatedRow = {
      ...ACTIVE_CONNECTIONS[0],
      activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedRow], error: null },
    });

    const result = await updateConnectionActivatedTools(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
      ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    );

    expect(result.activated_tools).toEqual(["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]);
    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({
        method: "update",
        args: [{ activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"] }],
      }),
    );
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "update failed" } },
    });

    await expect(
      updateConnectionActivatedTools(supabase as never, "client", "conn", []),
    ).rejects.toThrow("Failed to update activated tools: update failed");
  });
});
```

### Step 26: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "updateConnectionActivatedTools"
```
Expected: FAIL — `updateConnectionActivatedTools` is not exported.

### Step 27: Implement `updateConnectionActivatedTools`

```typescript
/** Updates the activated_tools array for one connection. */
export async function updateConnectionActivatedTools(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
  activatedTools: string[],
): Promise<ConnectionRow> {
  const { data, error } = await supabase
    .from("connections")
    .update({ activated_tools: activatedTools })
    .eq("client_id", clientId)
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update activated tools: ${error.message}`);
  }

  return connectionRowSchema.parse(data);
}
```

### Step 28: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "updateConnectionActivatedTools"
```
Expected: ALL PASS.

### Step 29: Write the failing test — `updateConnectionStatus`

```typescript
describe("updateConnectionStatus", () => {
  it("updates status and returns the updated row", async () => {
    const updatedRow = { ...ACTIVE_CONNECTIONS[0], status: "error" };
    const supabase = createMockSupabaseClient({
      updateResult: { data: [updatedRow], error: null },
    });

    const result = await updateConnectionStatus(
      supabase as never,
      ACTIVE_CONNECTIONS[0].client_id,
      ACTIVE_CONNECTIONS[0].id,
      "error",
    );

    expect(result.status).toBe("error");
    expect(supabase.calls.methods).toContainEqual(
      expect.objectContaining({
        method: "update",
        args: [{ status: "error" }],
      }),
    );
  });

  it("throws on query error", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "status failed" } },
    });

    await expect(
      updateConnectionStatus(supabase as never, "client", "conn", "active"),
    ).rejects.toThrow("Failed to update connection status: status failed");
  });
});
```

### Step 30: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts -- -t "updateConnectionStatus"
```
Expected: FAIL — `updateConnectionStatus` is not exported.

### Step 31: Implement `updateConnectionStatus`

```typescript
/** Updates the status of one connection. */
export async function updateConnectionStatus(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
  status: ConnectionRow["status"],
): Promise<ConnectionRow> {
  const { data, error } = await supabase
    .from("connections")
    .update({ status })
    .eq("client_id", clientId)
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update connection status: ${error.message}`);
  }

  return connectionRowSchema.parse(data);
}
```

### Step 32: Run ALL query tests to verify everything passes

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts
```
Expected: ALL PASS.

### Step 33: Commit

```bash
git add src/lib/connections/queries.ts src/lib/connections/__tests__/queries.test.ts
git commit -m "feat(pr26a): add insertConnection, getAllConnections, getActiveConnectionsByToolkit, getConnectionById, getConnectionsByIds, deleteConnection, updateConnectionActivatedTools, updateConnectionStatus"
```

---

## Task 4: Remove `upsertConnection` and update existing callers

**Files:**
- Modify: `src/lib/connections/queries.ts`
- Modify: `src/lib/connections/__tests__/queries.test.ts`
- Modify: `app/api/connections/callback/route.ts`
- Modify: `app/api/connections/initiate/route.ts`

### Step 1: Update the failing test — `upsertConnection` tests become `insertConnection` tests

The existing `upsertConnection` test block (line 188 of the test file) should be removed since `upsertConnection` will be deleted. The new `insertConnection` tests from Task 3 cover the same behavior.

Remove the entire `describe("upsertConnection", ...)` block from the test file.

### Step 2: Remove `upsertConnection` from `queries.ts`

Delete the `upsertConnection` function (lines 89-106 of `queries.ts`).

### Step 3: Run tests to check for breakage

Run:
```bash
npx vitest run src/lib/connections/__tests__/queries.test.ts
```
Expected: ALL PASS (no more `upsertConnection` tests, `insertConnection` tests cover new behavior).

### Step 4: Update `callback/route.ts` — use `insertConnection` instead of `upsertConnection`

In `app/api/connections/callback/route.ts`, change the import:

```typescript
// Before:
import { upsertConnection } from "@/lib/connections/queries";
// After:
import { insertConnection } from "@/lib/connections/queries";
```

And update the call (around line 117):

```typescript
// Before:
await upsertConnection(supabase, {
  client_id: clientId,
  composio_connected_account_id: connectedAccount.id,
  toolkit_slug: connectedAccount.toolkit.slug,
  display_name: null,
  status: "active",
});
// After:
await insertConnection(supabase, {
  client_id: clientId,
  composio_connected_account_id: connectedAccount.id,
  toolkit_slug: connectedAccount.toolkit.slug,
  display_name: null,
  account_identifier: null,
  status: "active",
});
```

### Step 5: Update `initiate/route.ts` — relax duplicate guard

In `app/api/connections/initiate/route.ts`, the guard at lines 45-53 blocks a second connection to the same toolkit. Relax it to only block pending connections (prevents double-initiation but allows multi-connection):

```typescript
// Before:
const existingConnection = await getActiveConnectionByToolkit(
  supabase,
  clientId,
  toolkit,
);
if (existingConnection) {
  return jsonError("Service already connected.", 409);
}

// After (import getActiveConnectionByToolkit is still used, but check for pending):
// Check if there's already a pending OAuth flow for this toolkit
const { data: pendingConnection } = await supabase
  .from("connections")
  .select("id")
  .eq("client_id", clientId)
  .eq("toolkit_slug", toolkit)
  .eq("status", "pending")
  .maybeSingle();

if (pendingConnection) {
  return jsonError("An OAuth flow for this service is already in progress.", 409);
}
```

Remove the `getActiveConnectionByToolkit` import if it's no longer used in this file.

### Step 6: Run the full test suite for connections

Run:
```bash
npx vitest run src/lib/connections/
```
Expected: ALL PASS.

### Step 7: Commit

```bash
git add src/lib/connections/queries.ts src/lib/connections/__tests__/queries.test.ts app/api/connections/callback/route.ts app/api/connections/initiate/route.ts
git commit -m "feat(pr26a): remove upsertConnection, update routes for insertConnection and relaxed multi-connection guard"
```

---

## Task 5: Regenerate database types

**Files:**
- Modify: `src/types/database.ts`

### Step 1: Generate types from local DB

Run:
```bash
npx supabase gen types typescript --local > src/types/database.ts
```
Expected: File regenerated with new columns (`account_identifier`, `activated_tools`, `tool_count`) and updated status enum.

### Step 2: Verify new columns appear in generated types

Run:
```bash
grep -A 5 "activated_tools" src/types/database.ts
```
Expected: Shows `activated_tools: string[]` in the connections table type.

### Step 3: Run full test suite

Run:
```bash
npx vitest run src/lib/connections/
```
Expected: ALL PASS (types are compatible with new schemas).

### Step 4: Commit

```bash
git add src/types/database.ts
git commit -m "feat(pr26a): regenerate database types for connection schema updates"
```

---

## Verification Checklist

- [ ] Migration applies cleanly on fresh DB
- [ ] `connections` table allows multiple rows per `(client_id, toolkit_slug)`
- [ ] `connections` table accepts `status: 'pending'`
- [ ] `connections` table has `account_identifier text`, `activated_tools text[]`, `tool_count integer`
- [ ] `connectionRowSchema` validates all new columns with correct defaults
- [ ] `connectionInsertSchema` accepts new fields as optional
- [ ] `insertConnection` creates rows (no upsert, no `onConflict`)
- [ ] `getAllConnections` returns rows of ALL statuses (no status filter)
- [ ] `getActiveConnectionsByToolkit` returns ALL active connections for a toolkit (supports multi-connection)
- [ ] `getConnectionById` and `getConnectionsByIds` enforce `client_id` guard
- [ ] `deleteConnection` hard-deletes the row
- [ ] `updateConnectionActivatedTools` and `updateConnectionStatus` persist changes
- [ ] `upsertConnection` export removed, all callers migrated
- [ ] Callback route uses `insertConnection`
- [ ] Initiate route allows multi-connection (blocks only pending duplicates)
- [ ] `database.ts` regenerated with new columns
- [ ] All tests pass: `npx vitest run src/lib/connections/`
