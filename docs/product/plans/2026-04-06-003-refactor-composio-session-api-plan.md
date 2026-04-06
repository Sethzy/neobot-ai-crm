---
title: "refactor: Composio SDK upgrade + simplify connection tool loading"
type: refactor
status: active
date: 2026-04-06
---

# refactor: Composio SDK upgrade + simplify connection tool loading

## Overview

Two things in one PR:

1. **Bump `@composio/core` + `@composio/vercel` from 0.6.4 → 0.6.8** (latest stable). No API changes — just taking the patch releases we've been leaving on the table.

2. **Simplify connection tool loading.** Replace the low-level `composio.tools.execute()` + manual tool-construction path in `activated-tools.ts` with `composio.tools.get(userId, { tools: slugs })`, which returns VercelProvider-wrapped tools with `execute()` already built in. This eliminates schema caching, connection ID prefixing, and ~140 lines of custom plumbing.

**Accepted trade-off:** Enforce one connected account per toolkit per user. No live users on connections yet, so no migration complexity.

> **Note on the session API (`composio.create()`):** The `session.tools({ tools: slugs })` pattern documented on the Composio website is in the `next` pre-release SDK (0.1.x), not in the current stable 0.6.x line. In 0.6.x, `composio.tools.get(userId, { tools: slugs })` is the correct interface and produces an identical result — tools with `execute()` built in, routing by userId. We'll migrate to the session API when it lands in stable.

## Problem Statement

We built `activated-tools.ts` using the lowest-level Composio interface: manually constructing tool wrappers from cached schemas and calling `composio.tools.execute()` with explicit `connectedAccountId`. This forced us to:

- Cache tool schemas in a `tool_schemas` DB column to avoid live API calls on every run
- Prefix every tool name with connection ID (`conn_abc__GMAIL_SEND_EMAIL`) to disambiguate multi-connection routing
- Hand-roll `tool()` wrappers from cached JSON schemas
- Pass `dangerouslySkipVersionCheck: true` (which the SDK already adds internally — our flag was redundant)
- Maintain a ~170-line fallback path for pre-migration rows

`composio.tools.get(userId, { tools: slugs })` with VercelProvider handles all of this: schemas come from Composio's API, execute() is wired automatically, routing is by userId.

## Proposed Solution

```typescript
// New activated-tools.ts
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<ToolSet> {
  const allActivatedSlugs = connections
    .filter(c => c.status === "active" && c.activated_tools.length > 0)
    .flatMap(c => c.activated_tools);

  if (allActivatedSlugs.length === 0) return {};

  const composio = getComposio();
  return await composio.tools.get(composioUserId, { tools: allActivatedSlugs });
}
```

Tools appear as plain slugs (`GMAIL_SEND_EMAIL`). No prefix. No manual schema construction. No caching.

## Technical Approach

### What changes

| File | Change |
|---|---|
| `package.json` | Bump `@composio/core` + `@composio/vercel` to `^0.6.8` |
| `src/lib/composio/activated-tools.ts` | Full rewrite — ~170 lines → ~20 lines |
| `src/lib/composio/tools.ts` | Delete — superseded |
| `src/lib/composio/index.ts` | Remove `loadComposioTools` export |
| `src/lib/runner/tools/connections/manage-tools.ts` | Remove schema caching block (lines 94–104) |
| `src/lib/runner/tools/connections/create-connection.ts` | Remove dead `mcp`, `direct_api`, `computer_use` variants from schema + error stubs |
| `src/lib/connections/schemas.ts` | Remove `tool_schemas` field from all three schemas |
| `src/lib/connections/queries.ts` | Remove `tool_schemas` param from `updateConnectionActivatedTools` |
| `src/lib/ai/system-prompt.ts` | Update `<using-connection-tools>` — remove connection ID prefix description |
| DB migration | (1) Add `UNIQUE (client_id, toolkit_slug)` after preflight; (2) drop `tool_schemas` column |
| `src/lib/composio/__tests__/activated-tools.test.ts` | Rewrite — remove schema caching, prefix, and file-bridge tests |
| `src/lib/composio/__tests__/tools.test.ts` | Delete |

### What stays unchanged

| File | Reason |
|---|---|
| `src/lib/composio/client.ts` | Singleton unchanged |
| `src/lib/composio/connection-flow.ts` | OAuth initiation unchanged |
| `src/lib/composio/catalog.ts` | Uses `getRawComposioTools()` for search/discovery — legitimate |
| `src/lib/composio/file-bridge.ts` | Deleted — no users, no backward compat needed |
| `src/lib/runner/tools/connections/get-connection-details.ts` | Uses raw API for discovery (not execution) — keep |
| `src/lib/runner/run-agent.ts` | `composioPromise` block shape unchanged; import stays |

### Tool name change

**Before:** `conn_abc123__GMAIL_SEND_EMAIL`  
**After:** `GMAIL_SEND_EMAIL`

Safe because one-per-toolkit means no ambiguity — `composio.tools.get(userId)` routes to the user's single connected account per toolkit automatically.

### One-per-toolkit enforcement sequence

The adversarial review flagged that adding the DB constraint before fixing the creation flow leaves orphaned Composio auth state if the constraint fires after OAuth has already started. Correct sequence:

1. **First:** Update `create_new_connections` to preflight — if an active same-toolkit connection already exists, block before calling `initiateOAuthFlow()` and return a clear error.
2. **Then:** Add `UNIQUE (client_id, toolkit_slug)` constraint as a safety net.

Preflight query to add in `create-connection.ts` before `initiateOAuthFlow()`:
```typescript
const existing = await getActiveConnectionByToolkit(supabase, clientId, integrationId);
if (existing) {
  results.push({ integrationId, error: "Already connected. Delete the existing connection first." });
  continue;
}
```

### Schema caching removal

`manage-tools.ts` lines 94–104 build `schemasToCache` and pass it to `updateConnectionActivatedTools`. Remove that block entirely. The function signature on `updateConnectionActivatedTools` drops the `toolSchemas` optional param. `tool_schemas` becomes dead in the DB, then the column is dropped via migration.

### `create_new_connections` cleanup

The Zod input schema currently has a discriminated union with `mcp`, `direct_api`, and `computer_use` variants that immediately return errors. Remove all three — the LLM sees them as valid options and occasionally tries them. The tool becomes integrations-only with a flat input schema.

### System prompt update

`<using-connection-tools>` currently says:
> "Activated connection tools will appear in your prompt prefixed with their connection ID. For example, `conn_1234__search_for_info`."

Replace with:
> "Activated connection tools appear directly in your tool list by their slug (e.g. `GMAIL_SEND_EMAIL`, `GOOGLEDRIVE_FIND_FILE`). If you do not see a tool you need, activate it first via `manage_activated_tools_for_connections`."

## System-Wide Impact

- **Interaction graph:** `run-agent.ts` → `loadActivatedConnectionTools()` → `composio.tools.get()`. Per-run, not shared. No shared mutable state.
- **Error propagation:** If `composio.tools.get()` fails, the existing `.catch(() => {})` in `run-agent.ts:258` returns `{}` — agent continues without Composio tools.
- **State lifecycle:** `tool_schemas` data in existing rows becomes unreachable after code deploy; safe to drop the column in the same migration or a follow-up.
- **API surface parity:** Only two callers of `updateConnectionActivatedTools` — `manage-tools.ts` (losing the `toolSchemas` arg) and the pre-migration fallback in `activated-tools.ts` (being deleted).
- **Integration tests:** `composio.tools.get()` hits the Composio network — mock at the module level in tests.

## Acceptance Criteria

- [ ] `@composio/core` and `@composio/vercel` at 0.6.8 in lockfile
- [ ] `activated-tools.ts` uses `composio.tools.get(userId, { tools: slugs })` — no manual `tool()` construction
- [ ] No `composio.tools.execute()` with explicit `connectedAccountId` anywhere in the execution path
- [ ] Tool names in runner are plain slugs — no connection ID prefix
- [ ] `tools.ts` deleted, export removed from `index.ts`
- [ ] `file-bridge.ts` deleted
- [ ] `tool_schemas` field removed from `schemas.ts`, `queries.ts`, and all call sites
- [ ] `tool_schemas` column dropped from `connections` table
- [ ] `create_new_connections` tool schema has no `mcp`/`direct_api`/`computer_use` variants
- [ ] `create_new_connections` preflight blocks duplicate same-toolkit connections before OAuth
- [ ] `UNIQUE (client_id, toolkit_slug)` constraint on `connections` table
- [ ] System prompt `<using-connection-tools>` updated (no connection ID prefix language)
- [ ] All Composio tests updated or removed; test suite passes

## Dependencies & Risks

**Risk: `composio.tools.get(userId, { tools: slugs })` routes to wrong connected account.**  
With one-per-toolkit enforced, there is exactly one connected account per (userId, toolkit). Routing is unambiguous. Verify by checking the SDK's `createExecuteToolFn` — confirmed it uses `userId` for routing.

**Risk: 0.6.4 → 0.6.8 has a silent breaking change.**  
Unlikely for a patch bump, but run the full test suite after the bump before touching any other code.

**Risk: Duplicate same-toolkit rows exist in DB before constraint.**  
Check before migration:
```sql
SELECT client_id, toolkit_slug, COUNT(*)
FROM connections
GROUP BY client_id, toolkit_slug
HAVING COUNT(*) > 1;
```

## Sources & References

- `src/lib/composio/activated-tools.ts` — file being replaced
- `src/lib/composio/tools.ts` — file being deleted
- `src/lib/runner/run-agent.ts:240–261` — composio load block
- `src/lib/runner/tools/connections/manage-tools.ts:94–104` — schema caching block
- `src/lib/connections/schemas.ts:20–23` — `tool_schemas` field
- SDK source: `node_modules/.pnpm/@composio+core@0.6.4/.../dist/index.mjs:2178` — `createExecuteFnForProviders` confirms execute() is built into `tools.get()` results
- SDK source: `node_modules/.pnpm/@composio+core@0.6.4/.../dist/index.mjs:6049` — `composio.create()` shape in 0.6.x
