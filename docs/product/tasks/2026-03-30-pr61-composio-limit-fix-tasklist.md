# Composio getRawComposioTools Limit Fix Implementation Plan

**PR:** PR 61: Composio getRawComposioTools limit fix
**Decisions:** CONN-02
**Goal:** Fix tool truncation bug where getRawComposioTools defaults to returning only 20 tools, causing incomplete discovery for toolkits with >20 tools (Google Drive has 89, Docs 35, Sheets 48).

**Architecture:** All Composio tool discovery calls use `getRawComposioTools()` without a `limit` parameter. The Composio API defaults to 20 results. This truncates tool counts, activation validation, and capability discovery for any toolkit with >20 tools. Fix by defining a shared constant `COMPOSIO_TOOL_FETCH_LIMIT = 200` and using it at every affected call site.

**Tech Stack:** @composio/core SDK, TypeScript, Vitest

**Commit strategy:** Single `fix(pr61): pass limit to getRawComposioTools at all call sites` commit after the full TDD cycle is green.

---

## Relevant Files

**Modify:**
- `src/lib/composio/client.ts` — add `COMPOSIO_TOOL_FETCH_LIMIT` constant
- `src/lib/composio/catalog.ts:39,72` — `searchIntegrations()` and `getToolkitCapabilities()`
- `src/lib/runner/tools/connections/manage-tools.ts:63` — tool activation validation
- `src/lib/runner/tools/connections/get-connection-details.ts:61` — tool capability discovery
- `app/api/connections/callback/route.ts:203` — tool_count computation on OAuth callback

**Test (update existing assertions):**
- `src/lib/composio/__tests__/catalog.test.ts:81` — already asserts SDK call args, update to expect `limit`
- `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts:79` — already asserts SDK call args, update to expect `limit`
- `app/api/connections/callback/__tests__/route.test.ts:221` — already asserts SDK call args, update to expect `limit`
- `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts:75` — **does NOT currently assert SDK call args** — add new assertion

**Explicitly excluded:**
- `src/lib/composio/activated-tools.ts:56` — calls `getRawComposioTools()` with explicit tool slugs (`{ tools: [...] }`), not toolkit queries. The SDK internally forces `limit: 9999` for slug-based queries (see `@composio/core/dist/index.mjs:2013`). Not affected by the truncation bug.

---

### Task 1: Add shared constant

**Files:**
- Modify: `src/lib/composio/client.ts`

**Step 1: Add the constant**

In `src/lib/composio/client.ts`, add after the existing exports:

```typescript
/**
 * Default limit for getRawComposioTools() toolkit queries.
 * The Composio API defaults to 20, which truncates toolkits with >20 tools
 * (e.g., Google Drive has 89). 200 provides headroom for large toolkits.
 * Not needed for slug-based queries (activated-tools.ts) — the SDK forces 9999 internally.
 */
export const COMPOSIO_TOOL_FETCH_LIMIT = 200;
```

---

### Task 2: Write failing tests, then fix catalog.ts

**Files:**
- Modify: `src/lib/composio/__tests__/catalog.test.ts`
- Modify: `src/lib/composio/catalog.ts`

**Step 1: Update existing test assertion to expect limit**

In `src/lib/composio/__tests__/catalog.test.ts`, find the assertion at ~line 81 that checks `getRawComposioTools` call args. Update it to expect the `limit` parameter:

```typescript
// Before (example — match actual test shape):
expect(mockGetRawComposioTools).toHaveBeenCalledWith({ search: "gmail" });

// After:
expect(mockGetRawComposioTools).toHaveBeenCalledWith({ search: "gmail", limit: 200 });
```

Do the same for the `getToolkitCapabilities` test — find the assertion and add `limit: 200`:

```typescript
// Before:
expect(mockGetRawComposioTools).toHaveBeenCalledWith({ toolkits: ["gmail"] });

// After:
expect(mockGetRawComposioTools).toHaveBeenCalledWith({ toolkits: ["gmail"], limit: 200 });
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/composio/__tests__/catalog.test.ts --reporter=verbose
```

Expected: FAIL — call args don't include `limit`.

**Step 3: Fix catalog.ts**

In `src/lib/composio/catalog.ts`, add the import and update both calls:

```typescript
import { getComposio, COMPOSIO_TOOL_FETCH_LIMIT } from "@/lib/composio/client";

// searchIntegrations (~line 39):
const tools = await composio.tools.getRawComposioTools({ search: keyword, limit: COMPOSIO_TOOL_FETCH_LIMIT });

// getToolkitCapabilities (~line 72):
const tools = await composio.tools.getRawComposioTools({
  toolkits: [toolkitSlug],
  limit: COMPOSIO_TOOL_FETCH_LIMIT,
});
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/composio/__tests__/catalog.test.ts --reporter=verbose
```

Expected: PASS.

---

### Task 3: Write failing test, then fix manage-tools.ts

**Files:**
- Modify: `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`
- Modify: `src/lib/runner/tools/connections/manage-tools.ts`

**Step 1: Add missing SDK call assertion**

In `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`, the test at ~line 75 does NOT currently assert the `getRawComposioTools` call args. Add an assertion:

```typescript
expect(mockGetRawComposioTools).toHaveBeenCalledWith({
  toolkits: ["gmail"],
  limit: 200,
});
```

Find the appropriate test case (the one that exercises the activation flow) and add this assertion after the tool execute call.

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts --reporter=verbose
```

Expected: FAIL — either the assertion doesn't match (no `limit`), or the mock wasn't called with expected args.

**Step 3: Fix manage-tools.ts**

```typescript
import { COMPOSIO_TOOL_FETCH_LIMIT } from "@/lib/composio/client";

// ~line 63:
const rawTools = await composio.tools.getRawComposioTools({
  toolkits: [connection.toolkit_slug],
  limit: COMPOSIO_TOOL_FETCH_LIMIT,
});
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts --reporter=verbose
```

Expected: PASS.

---

### Task 4: Update existing tests, then fix get-connection-details.ts and callback route

**Files:**
- Modify: `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`
- Modify: `src/lib/runner/tools/connections/get-connection-details.ts`
- Modify: `app/api/connections/callback/__tests__/route.test.ts`
- Modify: `app/api/connections/callback/route.ts`

**Step 1: Update get-connection-details test assertion**

In `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`, find the assertion at ~line 79 and add `limit: 200`:

```typescript
expect(mockGetRawComposioTools).toHaveBeenCalledWith({
  toolkits: ["gmail"],
  limit: 200,
});
```

**Step 2: Update callback route test assertion**

In `app/api/connections/callback/__tests__/route.test.ts`, find the assertion at ~line 221 and add `limit: 200`:

```typescript
expect(mockGetRawComposioTools).toHaveBeenCalledWith({
  toolkits: ["gmail"],
  limit: 200,
});
```

**Step 3: Run both tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts app/api/connections/callback/__tests__/route.test.ts --reporter=verbose
```

Expected: FAIL — call args don't include `limit`.

**Step 4: Fix get-connection-details.ts**

```typescript
import { COMPOSIO_TOOL_FETCH_LIMIT } from "@/lib/composio/client";

// ~line 61:
const rawTools = (await composio.tools.getRawComposioTools({
  toolkits: [connection.toolkit_slug],
  limit: COMPOSIO_TOOL_FETCH_LIMIT,
})) as RawConnectionTool[];
```

**Step 5: Fix callback route**

```typescript
import { COMPOSIO_TOOL_FETCH_LIMIT } from "@/lib/composio/client";

// ~line 203:
const rawTools = await composio.tools.getRawComposioTools({
  toolkits: [connectedAccount.toolkit.slug],
  limit: COMPOSIO_TOOL_FETCH_LIMIT,
});
```

**Step 6: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts app/api/connections/callback/__tests__/route.test.ts --reporter=verbose
```

Expected: PASS.

---

### Task 5: Final verification + commit

**Step 1: Verify all call sites use the constant**

```bash
grep -rn "getRawComposioTools" src/ app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__ | grep -v ".test."
```

Expected output — every toolkit-query call site includes `COMPOSIO_TOOL_FETCH_LIMIT`:
- `src/lib/composio/catalog.ts` — 2 calls (searchIntegrations, getToolkitCapabilities)
- `src/lib/runner/tools/connections/manage-tools.ts` — 1 call
- `src/lib/runner/tools/connections/get-connection-details.ts` — 1 call
- `app/api/connections/callback/route.ts` — 1 call
- `src/lib/composio/activated-tools.ts` — 1 call (excluded: uses `{ tools: [...] }`, SDK forces limit 9999)

**Step 2: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests pass.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Single commit**

```bash
git add -A
git commit -m "fix(pr61): pass COMPOSIO_TOOL_FETCH_LIMIT to getRawComposioTools at all toolkit-query call sites"
```
