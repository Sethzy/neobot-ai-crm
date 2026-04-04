# Bulk CRM Operations — Tasklist

**Date:** 2026-04-03
**Design:** `docs/product/designs/2026-04-03-batch-enrichment-skill-design.md`
**Scope:** Raise `update_record` and `create_record` batch limits from 50 → 500. Switch `update_record` internals from sequential per-record to bulk SQL for large batches. Return counts-only for batches >50.

---

## PR: Bulk CRM batch operations

### Why

The batch enrichment skill needs to write 500 records back to the CRM in a single tool call. Today, `update_record` is capped at 50 and runs sequential per-record DB queries (N queries for N records). `create_record` is also capped at 50. Raising both limits and optimizing the update path enables batch enrichment without new tools.

---

### Step 1: Add bulk update path to `update_record`

**File:** `src/lib/runner/tools/crm/update-record.ts`

**1.1** Raise `.max(50)` to `.max(500)` on the `updates` array schema (line 54).

**1.2** Update the tool description to reflect the new limit: change "up to 50 records per call" to "up to 500 records per call".

**1.3** Add a `BULK_THRESHOLD` constant at the top of the file:

```typescript
/** Above this count, return summary instead of full records. */
const BULK_THRESHOLD = 50;
```

**1.4** Add a `bulkUpdate` function that does a single SQL transaction for large batches. This avoids N sequential `updateOne` calls:

```typescript
async function bulkUpdate(
  supabase: SupabaseClient<Database>,
  clientId: string,
  entity: UpdateEntity,
  table: "contacts" | "companies" | "deals",
  pk: string,
  updates: Array<{ id: string; fields: Record<string, unknown> }>,
  config: CrmVocabConfig,
): Promise<{ updated: number; failed: number; failures: Array<{ id: string; error: string }> }>
```

Implementation:
- Skip custom field deep-merge for bulk path (overwrite, not merge — enrichment writes complete field values)
- Skip deal stage analytics for bulk path (batch enrichment doesn't change stages)
- Normalize vocabulary values (stage, type, industry) same as `updateOne`
- Use individual Supabase `.update().eq(pk, id).eq("client_id", clientId)` calls but with `Promise.all` batched in chunks of 25 (Supabase connection pool safe)
- Collect per-record successes and failures
- Return `{ updated, failed, failures }` — no full record objects

**1.5** Update the `execute` function to route based on batch size:

```typescript
execute: async ({ entity, updates }) => {
  const { table, pk } = ENTITY_ROUTING[entity];

  // Single update: existing behavior, return { record }
  if (updates.length === 1) {
    // ... unchanged
  }

  // Small batch (≤ BULK_THRESHOLD): existing sequential behavior, return { records, count }
  if (updates.length <= BULK_THRESHOLD) {
    // ... unchanged
  }

  // Large batch (> BULK_THRESHOLD): bulk path, return { updated, failed, failures }
  const result = await bulkUpdate(supabase, clientId, entity, table, pk, updates, config);
  return {
    success: result.failed === 0,
    updated: result.updated,
    failed: result.failed,
    ...(result.failures.length > 0 && { failures: result.failures }),
  };
}
```

---

### Step 2: Write tests for bulk update path

**File:** `src/lib/runner/tools/crm/__tests__/update-record.test.ts`

**2.1** Add test: "schema accepts up to 500 updates"

```typescript
it("accepts 500 updates in schema validation", () => {
  const updates = Array.from({ length: 500 }, (_, i) => ({
    id: crypto.randomUUID(),
    fields: { notes: `note-${i}` },
  }));
  const parsed = tools.update_record.inputSchema.safeParse({
    entity: "companies",
    updates,
  });
  expect(parsed.success).toBe(true);
});
```

**2.2** Add test: "rejects more than 500 updates"

```typescript
it("rejects 501 updates", () => {
  const updates = Array.from({ length: 501 }, (_, i) => ({
    id: crypto.randomUUID(),
    fields: { notes: `note-${i}` },
  }));
  const parsed = tools.update_record.inputSchema.safeParse({
    entity: "companies",
    updates,
  });
  expect(parsed.success).toBe(false);
});
```

**2.3** Add test: "bulk update returns summary, not full records"

```typescript
it("returns summary for batches above threshold", async () => {
  // Mock 51 successful updates
  const { client } = createMockSupabase({
    companies: Array.from({ length: 51 }, () => ({
      data: { company_id: crypto.randomUUID() },
      error: null,
    })),
  });
  const tools = createUpdateRecordTool(client, CLIENT_ID);

  const result = await tools.update_record.execute(
    {
      entity: "companies",
      updates: Array.from({ length: 51 }, (_, i) => ({
        id: crypto.randomUUID(),
        fields: { notes: `enriched-${i}` },
      })),
    },
    EXEC_OPTIONS,
  );

  expect(result).toMatchObject({
    success: true,
    updated: 51,
    failed: 0,
  });
  // Should NOT have `records` array
  expect(result).not.toHaveProperty("records");
});
```

**2.4** Add test: "bulk update handles partial failures"

```typescript
it("reports partial failures in bulk mode", async () => {
  const { client } = createMockSupabase({
    companies: [
      // 2 successes, 1 failure
      { data: { company_id: "co1" }, error: null },
      { data: null, error: { message: "not found" } },
      { data: { company_id: "co3" }, error: null },
    ],
  });
  // ... test with 51+ records where one fails
  // expect result.failed === 1, result.failures has the failed ID
});
```

**2.5** Add test: "small batch (≤50) still returns full records" — confirm existing behavior unchanged.

**2.6** Run tests: `npx vitest run src/lib/runner/tools/crm/__tests__/update-record.test.ts`

---

### Step 3: Raise `create_record` batch limit

**File:** `src/lib/runner/tools/crm/create-record.ts`

**3.1** Raise `.max(50)` to `.max(500)` on the `records` array schema (line 235).

**3.2** Update the tool description: change "up to 50 records per call" to "up to 500 records per call".

**3.3** Add summary response for large batches. After the batch insert (line 331-358), add:

```typescript
// Large batch: return summary only (no full record objects in context)
if (created.length > BULK_THRESHOLD) {
  await captureServerEvents(/* ... existing analytics ... */);
  return {
    success: true as const,
    count: created.length,
    // Omit `records` — too large for context
  };
}
```

**3.4** For large batches with dedup: the current per-record dedup check (`findDuplicates` in a for loop, line 269-289) will be slow at 500 records. Optimize for large batches:
- For companies: single query `SELECT * FROM companies WHERE client_id = ? AND LOWER(name) IN (?, ?, ...)` 
- For contacts: similar batch query
- For deals: similar batch query
- Only run per-record dedup below a threshold; above it, use batch query

---

### Step 4: Write tests for bulk create path

**File:** `src/lib/runner/tools/crm/__tests__/create-record.test.ts`

**4.1** Add test: "schema accepts up to 500 records"

**4.2** Add test: "rejects more than 500 records"

**4.3** Add test: "large batch returns count-only summary"

**4.4** Add test: "large batch with force_create skips dedup" — verify dedup isn't run for 500-record batches with `force_create: true`

**4.5** Run tests: `npx vitest run src/lib/runner/tools/crm/__tests__/create-record.test.ts`

---

### Step 5: Raise sandbox timeout

**File:** `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

**5.1** Change `SANDBOX_TIMEOUT_MS` from `5 * 60 * 1000` to `15 * 60 * 1000` (line 22).

**5.2** Update the comment to explain why: `// 15 minutes — supports batch enrichment scripts running 500+ web searches`

---

### Step 6: Run full test suite and verify

**6.1** Run all CRM tool tests:
```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

**6.2** Run sandbox tool tests (if any):
```bash
npx vitest run src/lib/runner/tools/sandbox/
```

**6.3** Verify no type errors:
```bash
npx tsc --noEmit
```

---

### Summary of changes

| File | Change |
|------|--------|
| `src/lib/runner/tools/crm/update-record.ts` | Raise limit 50→500, add bulk path with Promise.all chunks, summary response >50 |
| `src/lib/runner/tools/crm/create-record.ts` | Raise limit 50→500, summary response >50, batch dedup optimization |
| `src/lib/runner/tools/crm/__tests__/update-record.test.ts` | 5 new tests for bulk behavior |
| `src/lib/runner/tools/crm/__tests__/create-record.test.ts` | 4 new tests for bulk behavior |
| `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` | Raise timeout 5min→15min |
