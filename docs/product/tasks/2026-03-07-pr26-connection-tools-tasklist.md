# Connection Tools Implementation Plan

**PR:** PR 26: Connection tools
**Decisions:** TOOL-04, TOOL-06, CONN-01, CONN-02, CONN-03, SKILL-05
**Goal:** Give the agent 8 tools to discover, create, manage, and delete external service connections — matching Tasklet's eight-tool connection lifecycle (TOOL-04). The agent is responsible for finding and wiring up integrations. Composio is the backend for `integrations` type (CONN-02); `mcp` and `direct_api` return done-for-you messages in v1 (TOOL-06); `computer_use` returns "not yet available" (CONN-01).

**Architecture:** Eight agent-facing connection tools built on top of PR 25's Composio plumbing. Tools follow the existing trigger-tool factory pattern (`createConnectionTools()` barrel → individual tool files).

Key structural decisions:

1. **Per-tool activation, not connection-level.** Each connection row stores an `activated_tools text[]` column. `manage_activated_tools_for_connections` updates this array per connection. The runner loads only activated tools from Composio, prefixed with connection ID. `get_details_for_connections` returns both activated and deactivated tools by comparing this column against the full Composio tool list. This matches Tasklet's model where the agent activates a minimum subset first.

2. **Multi-connection per toolkit.** The PR 25 unique constraint on `(client_id, toolkit_slug)` is dropped. One client can have multiple connections to the same service (e.g., two Gmail accounts). `list_users_connections` returns all connections. Tasklet requires this for "use the correct account" behavior.

3. **Connection-scoped skill files.** Path convention: `/{clientId}/skills/connections/{connectionId}/SKILL.md`. Not toolkit-scoped. Lookup helper returns content or null. The system-reminder includes a skill pointer for each connection that has a skill file. v1 does not auto-generate skill files (SKILL-05 deferred), but the path convention, lookup, and reminder pointer are all in place.

4. **Connection-ID-prefixed tool names.** Activated tools appear in the runner as `{connectionId}__TOOL_SLUG`. This matches Tasklet's `conn_1234__search_for_info` pattern. The runner's `loadComposioTools` is replaced with a connection-aware loader.

5. **System prompt faithfully mirrors Tasklet's `<external-connections>`.** Three sub-sections: `<using-existing-connections>`, `<creating-new-connections>`, `<using-connection-tools>`. Includes "MUST read creating-connections skill" and "MUST read connection skill file" instructions.

**v1 approval semantics:** Tasklet's `create_new_connections`, `manage_activated_tools_for_connections`, and `delete_connection` all use UI card approval flows where the tool blocks until the user acts. In v1, we approximate this with our existing chat-based approval pattern: the agent describes the action, the user confirms in chat, then the agent calls the tool. Full UI card approval is a PR 33 concern.

**v1 limitation — `create_new_connections` cannot block:** Tasklet's tool shows a UI card, the user completes OAuth in-browser, and the tool returns `userAction: created|skipped` in the same turn. Without UI cards, we cannot block. v1 adaptation: the tool initiates OAuth and returns `{ connectionStatus: "pending_auth", redirectUrl }`. The agent presents the link. On the next turn, the agent uses `list_users_connections` to verify the connection was created. The connection row is created with `status: 'pending'` and `activated_tools` pre-populated from `toolsToActivate`. The callback route updates to `status: 'active'`.

**v1 limitation — `reauthorize_connection` cannot block:** Same as above. The tool initiates re-auth for the existing connection and returns a redirect URL. The agent presents it and verifies on the next turn.

**Skill files (SKILL-05):** DEFERRED to post-v1 per architecture decision. The plumbing is in place: connection-scoped storage path convention, lookup helper that returns null, system-reminder pointer when file exists, system prompt "MUST read skill file" instruction. Actual skill file authoring happens post-v1 via SKILL-05's "conditional copy-on-OAuth-completion" mechanism.

**Tech Stack:** Vercel AI SDK `tool()` with `inputSchema`, Zod 4, `@composio/core@^0.6.4`, `@composio/vercel@^0.6.4`, Supabase (Postgres + RLS), Vitest

---

## Tasklet Reference Files

Read ALL of these before implementing. The tool specs define the contract. The workflow references show how connections are used end-to-end.

### Tool Specs (canonical — match these verbatim)

| File | What it tells you |
|------|-------------------|
| `.../tasklet tools/built-in/v2/18-list_users_connections.md` | No params, returns ALL connections (active + inactive) |
| `.../tasklet tools/built-in/v2/19-get_details_for_connections.md` | connectionIds + includeToolDetails, returns activated AND deactivated tools |
| `.../tasklet tools/built-in/v2/20-get_integrations_capabilities.md` | integrationIds, quality info, notes |
| `.../tasklet tools/built-in/v2/21-search_for_integrations.md` | keyword search, returns quality/builder/context |
| `.../tasklet tools/built-in/v2/22-manage_activated_tools_for_connections.md` | Per-connection activate/deactivate arrays, returns userAction + tool lists |
| `.../tasklet tools/built-in/v2/23-reauthorize_connection.md` | Re-auth existing connection, cannot change account |
| `.../tasklet tools/built-in/v2/24-delete_connection.md` | Destructive delete with confirmation UI |
| `.../tasklet tools/built-in/v2/25-create_new_connections.md` | 4 types, returns AFTER user approval with userAction/connectionId/tools |

### System Prompt

| File | What it tells you |
|------|-------------------|
| `.../system-prompt-wholesale/01-v2-system-prompt-verbatim.md` | `<external-connections>` section with 3 sub-sections, `<skills>` section with path structure |

### Workflow References (how connections are used in practice)

| File | What it tells you |
|------|-------------------|
| `.../skills-system/03-creating-connections-skill.md` | 4-tier priority: integrations → MCP → direct_api → computer_use. Verify capability match first. |
| `.../skills-system/create-direct-api-connection-verbatim.md` | 6-step direct API setup guide (research → base URL → auth → test cases → notes → call tool) |
| `.../complex-multi-integration-workflow/02-connection-setup-and-auth-failure-handling.md` | Minimal-permission setup path. 4 auth outcomes: approved → skipped → partial → expired/revoked. |
| `.../skills-deep-dive-connection-generation-trace.md` | How skill files work. Conditional generation. System-reminder injects skill pointer every turn. Gmail example. |
| `.../calendly-briefing-workflow/calendly-briefing-trace.md` | End-to-end: check connections → activate tools → create connection → write subagent file → create trigger |

### Full Workflow Directories (read all files in each)

| Directory | Files | What it shows |
|-----------|-------|---------------|
| `.../complex-multi-integration-workflow/` | 7 files | Requirements, auth handling, architecture, triggers, execution trace, edge cases, optimization |
| `.../linkedin-automation-workflow/` | 4 files | Architecture, execution trace, detection surfaces, assumptions |
| `.../calendly-briefing-workflow/` | 1 file | Full briefing setup + trigger execution trace |

All paths abbreviated from `roadmap docs/Sunder - Source of Truth/references/tasklet/`.

---

## v1 Scoping Decisions

| Connection Type | v1 Behavior | Backend |
|-----------------|-------------|---------|
| `integrations` | Self-service via Composio OAuth | PR 25 initiate/callback flow |
| `mcp` | Done-for-you — return "Contact Sunder team to set up MCP connections" | Stub |
| `direct_api` | Done-for-you — return "Contact Sunder team to set up Direct API connections" | Stub |
| `computer_use` | Not available — return "Computer Use connections are not yet available" | Stub |

Per TOOL-06: "mcp/direct_api available in v1 but done-for-you setup only. Self-service mcp/direct_api may open in v2."

---

## Composio SDK Actual API Surface (@composio/core@^0.6.4)

**Do not guess — use exactly these.** Type declarations are in `node_modules/.pnpm/@composio+core@0.6.4_.../node_modules/@composio/core/dist/` — files `composio-ClplAPbl.d.mts` and `BaseProvider-B_7Qy99Q.d.mts`.

| Operation | SDK Call | Notes |
|---|---|---|
| Search toolkits | `composio.toolkits.get(query?)` | Overloaded: string arg = get by slug, object arg = list/search |
| Get toolkit by slug | `composio.toolkits.get(slug)` | Returns `ToolkitRetrieveResponse` |
| List auth configs | `composio.authConfigs.list({ toolkit })` | PR 25 `initiate/route.ts:56` |
| Create auth config | `composio.authConfigs.create(toolkit, opts)` | PR 25 `initiate/route.ts:63` |
| Initiate OAuth | `composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })` | PR 25 `initiate/route.ts:69`. Takes `authConfigId` NOT `toolkitSlug` |
| Get connected account | `composio.connectedAccounts.get(nanoid)` | PR 25 `callback/route.ts:91` |
| List connected accounts | `composio.connectedAccounts.list(query?)` | PR 25 `callback/route.ts:100` |
| Wait for connection | `composio.connectedAccounts.waitForConnection(id, timeout?)` | Polls until connected or timeout |
| Delete connected account | `composio.connectedAccounts.delete(nanoid)` | Returns `ConnectedAccountDeleteResponse` |
| Refresh credentials | `composio.connectedAccounts.refresh(nanoid, opts?)` | Credential refresh, NOT full re-auth |
| List raw tools | `composio.tools.getRawComposioTools(query)` | Returns `ToolList` (array of `Tool`) |
| Get provider-wrapped tools | `composio.tools.get(userId, filters)` | PR 25 `tools.ts:20`. Returns `ToolSet` keyed by tool slug |

### Critical SDK Type Constraints

**`ToolListParams` is a discriminated union.** You cannot combine params freely:

| Variant | Allowed Fields | Use Case |
|---------|---------------|----------|
| `SearchOnlyParams` | `{ search: string }` — **NO limit, NO toolkits** | Keyword search across catalog |
| `ToolkitsOnlyParams` | `{ toolkits: string[], limit?, search?, tags?, important? }` | Load tools for specific toolkits |
| `ToolsOnlyParams` | `{ tools: string[] }` — **NO other fields** | Load specific tools by slug |

**`Tool.toolkit` is an OBJECT, not a string:**
```typescript
toolkit?: { slug: string; name: string; logo?: string }
```
Access via `tool.toolkit?.slug`, `tool.toolkit?.name`. Never `tool.toolkit` as a string.

**`ToolList`** is `Array<Tool>`, not paginated. `ToolListResponse` has `{ items, totalPages, nextCursor }`.

---

## Relevant Files

### Create
- `supabase/migrations/2026MMDD_pr26_connection_schema_updates.sql` — schema migration
- `src/lib/runner/tools/connections/index.ts` — connection tool factory barrel
- `src/lib/runner/tools/connections/list-connections.ts`
- `src/lib/runner/tools/connections/get-connection-details.ts`
- `src/lib/runner/tools/connections/search-integrations.ts`
- `src/lib/runner/tools/connections/get-integration-capabilities.ts`
- `src/lib/runner/tools/connections/create-connection.ts`
- `src/lib/runner/tools/connections/manage-tools.ts`
- `src/lib/runner/tools/connections/reauthorize-connection.ts`
- `src/lib/runner/tools/connections/delete-connection.ts`
- `src/lib/runner/tools/connections/__tests__/*.test.ts` — one per tool
- `src/lib/composio/connection-flow.ts` — shared OAuth initiation (extracted from PR 25)
- `src/lib/composio/__tests__/connection-flow.test.ts`
- `src/lib/composio/catalog.ts` — Composio catalog search + toolkit capabilities
- `src/lib/composio/__tests__/catalog.test.ts`
- `src/lib/composio/activated-tools.ts` — connection-ID-prefixed tool loader
- `src/lib/composio/__tests__/activated-tools.test.ts`
- `src/lib/storage/skill-files.ts` — connection-scoped skill file lookup
- `src/lib/storage/__tests__/skill-files.test.ts`

### Modify
- `src/lib/connections/schemas.ts` — add `activated_tools`, `tool_count`, `account_identifier`, `pending` status
- `src/lib/connections/queries.ts` — add new queries, change upsert to insert, drop toolkit uniqueness
- `src/lib/runner/tools/index.ts` — add `createConnectionTools` export
- `src/lib/runner/run-agent.ts` — wire connection tools, update `RunnerTools` type, replace `loadComposioTools` with activated-tool loader
- `src/lib/runner/run-autopilot.ts` — wire connection tools (read-only)
- `src/lib/composio/tools.ts` — update or replace with connection-aware loader
- `src/lib/ai/system-prompt.ts` — rewrite `<connections>` → `<external-connections>`
- `src/lib/ai/__tests__/system-prompt.test.ts`
- `src/lib/runner/system-reminder.ts` — enrich with per-connection tool counts, skill pointers, inactive count
- `src/lib/runner/__tests__/system-reminder.test.ts`
- `app/api/connections/initiate/route.ts` — extract shared OAuth flow
- `app/api/connections/callback/route.ts` — update for new schema (tool_count, pending row update)
- `src/types/database.ts` — regenerate after migration

---

## Task 1: Schema migration — multi-connection + per-tool activation + tool_count

**Files:**
- Create: `supabase/migrations/2026MMDD_pr26_connection_schema_updates.sql`
- Modify: `src/lib/connections/schemas.ts`
- Modify: `src/types/database.ts` (regenerate)

**Why first:** Every subsequent task depends on the new columns and relaxed constraints.

### Migration SQL

```sql
-- 1. Add 'pending' to status check constraint
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE connections ADD CONSTRAINT connections_status_check
  CHECK (status IN ('active', 'inactive', 'error', 'pending'));

-- 2. Drop unique constraint on (client_id, toolkit_slug) to allow multi-connection
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_client_id_toolkit_slug_key;

-- 3. Add new columns
ALTER TABLE connections ADD COLUMN IF NOT EXISTS account_identifier text;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS activated_tools text[] NOT NULL DEFAULT '{}';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS tool_count integer NOT NULL DEFAULT 0;

-- 4. Add index for common query patterns
CREATE INDEX IF NOT EXISTS idx_connections_client_status
  ON connections (client_id, status);
```

### Schema updates

```typescript
// src/lib/connections/schemas.ts
export const connectionStatusValues = ["active", "inactive", "error", "pending"] as const;

export const connectionRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  composio_connected_account_id: z.string().min(1),
  toolkit_slug: z.string().min(1),
  display_name: z.string().nullable(),
  account_identifier: z.string().nullable(),
  status: z.enum(connectionStatusValues),
  activated_tools: z.array(z.string()).default([]),
  tool_count: z.number().int().nonnegative().default(0),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
```

### TDD

1. **RED:** Test that connectionRowSchema accepts new fields (`activated_tools`, `tool_count`, `account_identifier`, status `"pending"`).
2. **GREEN:** Update schemas.ts with new fields.
3. **RED:** Test that connectionInsertSchema accepts the new fields as optional.
4. **GREEN:** Update connectionInsertSchema.
5. Regenerate `database.ts`.

### Commit

```bash
git commit -m "feat(pr26): schema migration for multi-connection, per-tool activation, and tool_count"
```

---

## Task 2: Connection query updates

**Files:**
- Modify: `src/lib/connections/queries.ts`
- Create or modify: `src/lib/connections/__tests__/queries.test.ts`

**Changes:**
- `upsertConnection` → `insertConnection` (no more `onConflict: "client_id,toolkit_slug"`)
- Add `getConnectionById(supabase, clientId, connectionId)`
- Add `getConnectionsByIds(supabase, clientId, connectionIds)`
- Add `getAllConnections(supabase, clientId)` — all statuses
- Add `deleteConnection(supabase, clientId, connectionId)`
- Add `updateConnectionActivatedTools(supabase, clientId, connectionId, activatedTools)`
- Add `updateConnectionStatus(supabase, clientId, connectionId, status)`

### Key changes

**`insertConnection` replaces `upsertConnection`:**
```typescript
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

  if (error) throw new Error(`Failed to insert connection: ${error.message}`);
  return connectionRowSchema.parse(row);
}
```

**`getAllConnections` returns ALL statuses:**
```typescript
export async function getAllConnections(
  supabase: ConnectionSupabaseClient,
  clientId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .order("toolkit_slug", { ascending: true });

  if (error) throw new Error(`Failed to load connections: ${error.message}`);
  return parseConnectionRows(data);
}
```

**`updateConnectionActivatedTools`:**
```typescript
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

  if (error) throw new Error(`Failed to update activated tools: ${error.message}`);
  return connectionRowSchema.parse(data);
}
```

### TDD

For each new query: RED (test the function signature and expected behavior) → GREEN (implement) → verify. Test `getAllConnections` specifically returns rows with mixed statuses. Test `insertConnection` allows two rows with the same `toolkit_slug`.

### REFACTOR — Update callback route

Update `app/api/connections/callback/route.ts` to use `insertConnection` instead of `upsertConnection`. Also update `app/api/connections/initiate/route.ts` — the duplicate-by-toolkit check should be relaxed or removed (multi-connection is now allowed; the agent decides).

### Commit

```bash
git commit -m "feat(pr26): connection query updates for multi-connection and per-tool activation"
```

---

## Task 3: Extract shared OAuth initiation flow from PR 25 route

**Files:**
- Create: `src/lib/composio/connection-flow.ts`
- Create: `src/lib/composio/__tests__/connection-flow.test.ts`
- Modify: `app/api/connections/initiate/route.ts`

PR 25's `initiate/route.ts:55-71` has the correct `authConfigs.list → create → connectedAccounts.link` flow. Extract into a reusable helper.

### Implementation

```typescript
// src/lib/composio/connection-flow.ts
export interface InitiateOAuthFlowParams {
  composioUserId: string;
  toolkitSlug: string;
  callbackUrl: string;
}

export interface InitiateOAuthFlowResult {
  redirectUrl: string;
  connectedAccountId: string;
}

export async function initiateOAuthFlow(
  params: InitiateOAuthFlowParams,
): Promise<InitiateOAuthFlowResult> {
  const composio = getComposio();
  const authConfigs = await composio.authConfigs.list({
    toolkit: params.toolkitSlug,
    isComposioManaged: true,
  });
  const reusableAuthConfig = authConfigs.items.find((ac) => ac.status === "ENABLED");
  const authConfigId = reusableAuthConfig?.id
    ?? (await composio.authConfigs.create(params.toolkitSlug, {
        type: "use_composio_managed_auth",
        name: `${params.toolkitSlug} Auth Config`,
      })).id;

  const connectionRequest = await composio.connectedAccounts.link(
    params.composioUserId,
    authConfigId,
    { callbackUrl: params.callbackUrl },
  );

  if (!connectionRequest.redirectUrl) {
    throw new Error("Composio did not return a redirect URL.");
  }

  return {
    redirectUrl: connectionRequest.redirectUrl,
    connectedAccountId: connectionRequest.id,
  };
}
```

### TDD

1. **RED:** Test `initiateOAuthFlow` returns `{ redirectUrl, connectedAccountId }`.
2. **GREEN:** Implement as above.
3. **RED:** Test throws when Composio returns no redirect URL.
4. **GREEN:** Already handled.
5. **REFACTOR:** Update `initiate/route.ts` to call `initiateOAuthFlow()`.

### Commit

```bash
git commit -m "feat(pr26): extract shared OAuth initiation flow from PR 25 route"
```

---

## Task 4: Composio catalog helpers (fixed SDK types)

**Files:**
- Create: `src/lib/composio/catalog.ts`
- Create: `src/lib/composio/__tests__/catalog.test.ts`

### searchToolkits — keyword search

Uses `SearchOnlyParams` which ONLY allows `{ search: string }`. No `limit`.

```typescript
export interface CatalogIntegration {
  integrationId: string;
  name: string;
  description: string;
  quality: string;   // "GREAT" | "GOOD" | "OK" | "LIMITED" | "UNKNOWN"
  builder: string;   // "Composio" in v1
  context: string;   // additional usage context
}

export async function searchIntegrations(keyword: string): Promise<CatalogIntegration[]> {
  const composio = getComposio();
  const tools = await composio.tools.getRawComposioTools({ search: keyword });

  // Dedupe by toolkit slug (multiple tools per toolkit)
  const seenToolkits = new Map<string, CatalogIntegration>();
  for (const tool of tools) {
    const slug = tool.toolkit?.slug;
    if (!slug || seenToolkits.has(slug)) continue;
    seenToolkits.set(slug, {
      integrationId: slug,
      name: tool.toolkit?.name ?? slug,
      description: tool.description ?? "",
      quality: "UNKNOWN",  // Composio does not expose quality scores
      builder: "Composio",
      context: "",
    });
  }

  return Array.from(seenToolkits.values());
}
```

**Critical:** `tool.toolkit` is `{ slug: string; name: string; logo?: string }`, not a string.

### getToolkitCapabilities — tools + quality + notes

Uses `ToolkitsOnlyParams` which allows `{ toolkits, limit }`.

```typescript
export interface ToolkitCapability {
  integrationId: string;
  name: string;
  description: string;
  quality: string;
  notes: string;
  tools: Array<{
    slug: string;
    name: string;
    description: string;
    tags: string[];
  }>;
}

export async function getToolkitCapabilities(
  toolkitSlugs: string[],
): Promise<ToolkitCapability[]> {
  const composio = getComposio();
  const results: ToolkitCapability[] = [];

  for (const slug of toolkitSlugs) {
    const tools = await composio.tools.getRawComposioTools({ toolkits: [slug] });
    results.push({
      integrationId: slug,
      name: tools[0]?.toolkit?.name ?? slug,
      description: "",
      quality: "UNKNOWN",
      notes: "",
      tools: tools.map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        description: tool.description ?? "",
        tags: tool.tags ?? [],
      })),
    });
  }

  return results;
}
```

### TDD

1. **RED:** Test `searchIntegrations("gmail")` returns deduped results with correct shape.
2. **GREEN:** Implement with `tool.toolkit?.slug` access.
3. **RED:** Test `getToolkitCapabilities(["gmail"])` returns tools array with slugs.
4. **GREEN:** Implement.

### Commit

```bash
git commit -m "feat(pr26): Composio catalog helpers with correct SDK types"
```

---

## Task 5: list_users_connections tool

**Files:**
- Create: `src/lib/runner/tools/connections/list-connections.ts`
- Create: `src/lib/runner/tools/connections/__tests__/list-connections.test.ts`

**Tasklet spec:** 18-list_users_connections.md — no params, returns ALL connections.

### Implementation

```typescript
export function createListConnectionsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    list_users_connections: tool({
      description: "Lists all connections to external services. Returns connectionId, serviceName, accountName, connectionType, status, and activation details for each connection.",
      inputSchema: z.object({}),
      execute: async () => {
        const connections = await getAllConnections(supabase, clientId);
        return {
          success: true,
          connections: connections.map((conn) => ({
            connectionId: conn.id,
            serviceName: conn.toolkit_slug,
            accountName: conn.account_identifier ?? conn.display_name,
            connectionType: "integrations" as const,
            status: conn.status,
            activatedToolCount: conn.activated_tools.length,
            totalToolCount: conn.tool_count,
          })),
        };
      },
    }),
  };
}
```

**Key:** Returns ALL connections (active + inactive + error + pending), not just active. This is per Tasklet spec — the agent needs to see inactive/error connections to decide whether to reauthorize or delete.

### TDD

1. **RED:** Test returns empty array when no connections exist.
2. **GREEN:** Implement.
3. **RED:** Test returns connections of all statuses (active, inactive, error, pending).
4. **GREEN:** Uses `getAllConnections` which has no status filter.
5. **RED:** Test response shape matches Tasklet (connectionId, serviceName, etc.).
6. **GREEN:** Map fields as shown.

### Commit

```bash
git commit -m "feat(pr26): list_users_connections tool"
```

---

## Task 6: get_details_for_connections tool

**Files:**
- Create: `src/lib/runner/tools/connections/get-connection-details.ts`
- Create: `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`

**Tasklet spec:** 19-get_details_for_connections.md — connectionIds + includeToolDetails, returns activated AND deactivated tools.

### Implementation

```typescript
inputSchema: z.object({
  connectionIds: z.array(z.string()).describe("The connection IDs to get details for"),
  includeToolDetails: z.boolean().describe("Pass true to include detailed descriptions and arguments for each tool"),
}),
execute: async ({ connectionIds, includeToolDetails }) => {
  const connections = await getConnectionsByIds(supabase, clientId, connectionIds);
  const composio = getComposio();

  const results = await Promise.all(connections.map(async (conn) => {
    const rawTools = await composio.tools.getRawComposioTools({
      toolkits: [conn.toolkit_slug],
    });
    const activatedSet = new Set(conn.activated_tools);

    const activated = rawTools.filter((t) => activatedSet.has(t.slug));
    const deactivated = rawTools.filter((t) => !activatedSet.has(t.slug));

    const mapTool = (t: Tool) => includeToolDetails
      ? { slug: t.slug, name: t.name, description: t.description ?? "", arguments: t.inputParameters }
      : { slug: t.slug, name: t.name };

    return {
      connectionId: conn.id,
      serviceName: conn.toolkit_slug,
      accountName: conn.account_identifier ?? conn.display_name,
      connectionType: "integrations" as const,
      status: conn.status,
      toolCount: rawTools.length,
      tools: {
        activated: activated.map(mapTool),
        deactivated: deactivated.map(mapTool),
      },
    };
  }));

  return { success: true, connections: results };
},
```

**Key:** Returns BOTH activated and deactivated tools per connection, split by comparing the `activated_tools` column against the full Composio tool list. `includeToolDetails` controls whether descriptions and arguments are included (token budget control).

### TDD

1. **RED:** Test returns activated and deactivated tool arrays split correctly.
2. **GREEN:** Implement with Set-based filtering.
3. **RED:** Test `includeToolDetails: true` includes descriptions and arguments.
4. **GREEN:** Conditional mapping.
5. **RED:** Test `includeToolDetails: false` returns only slug and name.
6. **GREEN:** Already handled.

### Commit

```bash
git commit -m "feat(pr26): get_details_for_connections tool with per-tool activation"
```

---

## Task 7: search_for_integrations tool

**Files:**
- Create: `src/lib/runner/tools/connections/search-integrations.ts`
- Create: `src/lib/runner/tools/connections/__tests__/search-integrations.test.ts`

**Tasklet spec:** 21-search_for_integrations.md — keywords array, returns integrationId + name + description + quality + builder + context.

### Implementation

```typescript
inputSchema: z.object({
  keywords: z.array(z.string()).describe("Keywords to search for. Each keyword must be a single word."),
}),
execute: async ({ keywords }) => {
  // Search each keyword separately (SearchOnlyParams only takes one search string)
  const allResults = new Map<string, CatalogIntegration>();
  for (const keyword of keywords) {
    const results = await searchIntegrations(keyword);
    for (const r of results) {
      if (!allResults.has(r.integrationId)) allResults.set(r.integrationId, r);
    }
  }

  return {
    success: true,
    integrations: Array.from(allResults.values()).map((r) => ({
      integrationId: r.integrationId,
      name: r.name,
      description: r.description,
      quality: r.quality,
      builder: r.builder,
      context: r.context,
    })),
  };
},
```

**Key:** Response includes quality, builder, and context per Tasklet spec. The description tells the agent: "NEVER mention integration quality scores or who built the integrations unless the user specifically asks."

### TDD

1. **RED:** Test returns deduplicated integrations across multiple keywords.
2. **GREEN:** Implement with Map dedup.
3. **RED:** Test response shape includes quality, builder, context fields.
4. **GREEN:** Map from `CatalogIntegration`.

### Commit

```bash
git commit -m "feat(pr26): search_for_integrations tool with quality/builder/context"
```

---

## Task 8: get_integrations_capabilities tool

**Files:**
- Create: `src/lib/runner/tools/connections/get-integration-capabilities.ts`
- Create: `src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts`

**Tasklet spec:** 20-get_integrations_capabilities.md — integrationIds array, returns capabilities with tools, quality, notes.

### Implementation

```typescript
inputSchema: z.object({
  integrationIds: z.array(z.string()).describe("The integration IDs to get capabilities for."),
}),
execute: async ({ integrationIds }) => {
  const capabilities = await getToolkitCapabilities(integrationIds);
  return {
    success: true,
    integrations: capabilities.map((cap) => ({
      integrationId: cap.integrationId,
      name: cap.name,
      description: cap.description,
      quality: cap.quality,
      notes: cap.notes,
      tools: cap.tools,
    })),
  };
},
```

### TDD

1. **RED:** Test returns tools array for each integration.
2. **GREEN:** Implement using `getToolkitCapabilities`.
3. **RED:** Test includes quality and notes fields (even if "UNKNOWN"/"").
4. **GREEN:** Already included in `ToolkitCapability`.

### Commit

```bash
git commit -m "feat(pr26): get_integrations_capabilities tool with quality and notes"
```

---

## Task 9: create_new_connections tool

**Files:**
- Create: `src/lib/runner/tools/connections/create-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/create-connection.test.ts`

**Tasklet spec:** 25-create_new_connections.md — 4 types, returns userAction/connectionId/tools after user approval.

**v1 adaptation:** Cannot block until OAuth completes (no UI cards). Returns `redirectUrl` + creates pending connection row. See architecture notes above.

### Input schema (Tasklet-faithful — all 4 types)

```typescript
inputSchema: z.object({
  connection: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("integrations"),
      integrations: z.array(z.object({
        integrationId: z.string().describe("The integration id (toolkit slug)"),
        toolsToActivate: z.array(z.string()).optional().describe("Tools to activate once connected"),
      })),
    }),
    z.object({
      type: z.literal("mcp"),
      displayName: z.string().optional(),
      serverUrl: z.string().optional(),
    }),
    z.object({
      type: z.literal("direct_api"),
      serviceName: z.string(),
      description: z.string(),
      connectionName: z.string(),
      baseUrl: z.string(),
      methods: z.array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])),
      authConfig: z.record(z.unknown()),
      notes: z.string(),
      testCases: z.array(z.record(z.unknown())).optional(),
    }),
    z.object({
      type: z.literal("computer_use"),
      displayName: z.string(),
    }),
  ]),
}),
```

### Execute (integrations type)

```typescript
if (connection.type === "integrations") {
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/callback`;
  const results = [];

  for (const integration of connection.integrations) {
    const { redirectUrl, connectedAccountId } = await initiateOAuthFlow({
      composioUserId: clientId,
      toolkitSlug: integration.integrationId,
      callbackUrl,
    });

    // Create pending connection row with pre-populated activated_tools
    await insertConnection(supabase, {
      client_id: clientId,
      composio_connected_account_id: connectedAccountId,
      toolkit_slug: integration.integrationId,
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: integration.toolsToActivate ?? [],
      tool_count: 0,
    });

    results.push({
      integrationId: integration.integrationId,
      connectionStatus: "pending_auth",
      redirectUrl,
    });
  }

  return {
    success: true,
    message: "Send these authorization links to the user. After they complete authorization, use list_users_connections to verify the connections were created.",
    results,
  };
}
```

### Execute (stub types)

```typescript
if (connection.type === "mcp") {
  return { success: false, error: "MCP connections require manual setup. Contact the Sunder team." };
}
if (connection.type === "direct_api") {
  return { success: false, error: "Direct API connections require manual setup. Contact the Sunder team." };
}
if (connection.type === "computer_use") {
  return { success: false, error: "Computer Use connections are not yet available." };
}
```

### Callback route update

Update `app/api/connections/callback/route.ts` to find the pending row by `composio_connected_account_id` and update it to `status: 'active'` with `tool_count`, rather than inserting a new row:

```typescript
// Find pending row
const { data: pendingRow } = await supabase
  .from("connections")
  .select("*")
  .eq("composio_connected_account_id", connectedAccount.id)
  .eq("status", "pending")
  .maybeSingle();

if (pendingRow) {
  // Update existing pending row
  const rawTools = await composio.tools.getRawComposioTools({
    toolkits: [connectedAccount.toolkit.slug],
  });
  await supabase.from("connections").update({
    status: "active",
    tool_count: rawTools.length,
    account_identifier: connectedAccount.metadata?.email ?? null,
  }).eq("id", pendingRow.id);
} else {
  // Fallback: insert new row (Settings UI flow, no pending row)
  await insertConnection(supabase, { ... });
}
```

### TDD

1. **RED:** Test integrations type calls `initiateOAuthFlow` and inserts pending connection row.
2. **GREEN:** Implement.
3. **RED:** Test `toolsToActivate` is stored in pending row's `activated_tools`.
4. **GREEN:** Already handled in insert.
5. **RED:** Test mcp type returns done-for-you message.
6. **GREEN:** Stub handler.
7. **RED:** Test direct_api type returns done-for-you message.
8. **GREEN:** Stub handler.
9. **RED:** Test computer_use type returns not-available message.
10. **GREEN:** Stub handler.
11. **RED:** Test callback route updates pending row to active with tool_count.
12. **GREEN:** Update callback route.

### Commit

```bash
git commit -m "feat(pr26): create_new_connections tool with pending connection flow"
```

---

## Task 10: manage_activated_tools_for_connections tool

**Files:**
- Create: `src/lib/runner/tools/connections/manage-tools.ts`
- Create: `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`

**Tasklet spec:** 22-manage_activated_tools_for_connections.md — per-connection activate/deactivate arrays, returns userAction + tool lists.

This is the core of the per-tool activation model. Each connection maintains its own `activated_tools` array.

### Input schema

```typescript
inputSchema: z.object({
  connections: z.array(z.object({
    connectionId: z.string().describe("The connectionId to activate or deactivate tools for."),
    activate: z.array(z.string()).describe("Tool names to activate. Verify exact names first."),
    deactivate: z.array(z.string()).describe("Tool names to deactivate."),
  })),
}),
```

### Execute

```typescript
execute: async ({ connections: connectionRequests }) => {
  const composio = getComposio();
  const results = [];

  for (const req of connectionRequests) {
    const conn = await getConnectionById(supabase, clientId, req.connectionId);
    if (!conn) {
      results.push({ connectionId: req.connectionId, error: "Connection not found." });
      continue;
    }

    // Get full tool list from Composio
    const rawTools = await composio.tools.getRawComposioTools({
      toolkits: [conn.toolkit_slug],
    });
    const allToolSlugs = new Set(rawTools.map((t) => t.slug));

    // Validate requested tool names exist
    const invalidActivate = req.activate.filter((t) => !allToolSlugs.has(t));
    const invalidDeactivate = req.deactivate.filter((t) => !allToolSlugs.has(t));
    if (invalidActivate.length > 0 || invalidDeactivate.length > 0) {
      results.push({
        connectionId: req.connectionId,
        error: `Unknown tools: ${[...invalidActivate, ...invalidDeactivate].join(", ")}`,
      });
      continue;
    }

    // Compute new activated set
    const currentActivated = new Set(conn.activated_tools);
    for (const t of req.activate) currentActivated.add(t);
    for (const t of req.deactivate) currentActivated.delete(t);
    const newActivatedArray = Array.from(currentActivated);

    // Persist
    await updateConnectionActivatedTools(supabase, clientId, conn.id, newActivatedArray);

    // Build response
    const newActivatedSet = new Set(newActivatedArray);
    results.push({
      connectionId: conn.id,
      userAction: "approved",  // v1: chat-based approval already happened before tool call
      tools: {
        activated: rawTools.filter((t) => newActivatedSet.has(t.slug)).map((t) => t.slug),
        deactivated: rawTools.filter((t) => !newActivatedSet.has(t.slug)).map((t) => t.slug),
      },
      skills: conn.activated_tools.length === 0
        ? `If a skill file exists for this connection, read it at: skills/connections/${conn.id}/SKILL.md`
        : undefined,
    });
  }

  return { success: true, connections: results };
},
```

**Key behaviors:**
- Per-tool, not connection-level. `activate` and `deactivate` are arrays of tool slugs.
- Validates tool names against Composio's actual tool list for the toolkit.
- Returns Tasklet-shaped response: `userAction`, `tools.activated`, `tools.deactivated`, optional `skills` pointer.
- v1: `userAction` is always "approved" because chat-based approval happened before the tool call.
- Skills pointer returned on first activation (when previously no tools were activated).

### TDD

1. **RED:** Test activating tools adds them to `activated_tools` column.
2. **GREEN:** Implement set union logic.
3. **RED:** Test deactivating tools removes them.
4. **GREEN:** Implement set difference logic.
5. **RED:** Test invalid tool names return error.
6. **GREEN:** Validate against Composio tool list.
7. **RED:** Test response splits tools into activated/deactivated arrays.
8. **GREEN:** Set-based filtering.
9. **RED:** Test skills pointer returned on first activation.
10. **GREEN:** Check `conn.activated_tools.length === 0`.

### Commit

```bash
git commit -m "feat(pr26): manage_activated_tools_for_connections with per-tool activation"
```

---

## Task 11: reauthorize_connection tool

**Files:**
- Create: `src/lib/runner/tools/connections/reauthorize-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts`

**Tasklet spec:** 23-reauthorize_connection.md — re-auth existing connection, cannot change account.

**Contract:** Use only after auth errors or explicit user request. Preserves connection identity and account. Does not create a new connected account.

### Implementation

```typescript
inputSchema: z.object({
  connectionId: z.string().describe("The connectionId to reauthorize."),
}),
execute: async ({ connectionId }) => {
  const conn = await getConnectionById(supabase, clientId, connectionId);
  if (!conn) return { success: false, error: "Connection not found." };
  if (conn.status === "pending") return { success: false, error: "Connection is still pending initial authorization." };

  const composio = getComposio();

  // Try credential refresh first (no user interaction needed)
  try {
    await composio.connectedAccounts.refresh(conn.composio_connected_account_id);
    const refreshed = await composio.connectedAccounts.get(conn.composio_connected_account_id);
    if (refreshed.status === "ACTIVE") {
      await updateConnectionStatus(supabase, clientId, connectionId, "active");
      return {
        success: true,
        connectionId: conn.id,
        status: "reauthorized",
        message: "Connection credentials refreshed successfully.",
      };
    }
  } catch {
    // Refresh failed, fall through to full re-auth
  }

  // Full re-auth: initiate OAuth for the SAME connected account
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/callback`;
  const { redirectUrl } = await initiateOAuthFlow({
    composioUserId: clientId,
    toolkitSlug: conn.toolkit_slug,
    callbackUrl,
  });

  // Mark as pending re-auth
  await updateConnectionStatus(supabase, clientId, connectionId, "pending");

  return {
    success: true,
    connectionId: conn.id,
    status: "pending_reauth",
    redirectUrl,
    message: "Send this re-authorization link to the user. The connection account cannot change.",
  };
},
```

**Key:** Try `refresh()` first (silent credential refresh). If that fails, fall back to full OAuth re-auth. The connection row is preserved — no new row created. v1 limitation: full re-auth returns `redirectUrl` like `create_new_connections`.

### TDD

1. **RED:** Test refresh succeeds → returns "reauthorized" status.
2. **GREEN:** Implement refresh path.
3. **RED:** Test refresh fails → returns redirectUrl for re-auth.
4. **GREEN:** Implement fallback OAuth path.
5. **RED:** Test connection not found returns error.
6. **GREEN:** Guard clause.

### Commit

```bash
git commit -m "feat(pr26): reauthorize_connection tool with refresh-first strategy"
```

---

## Task 12: delete_connection tool

**Files:**
- Create: `src/lib/runner/tools/connections/delete-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/delete-connection.test.ts`

**Tasklet spec:** 24-delete_connection.md — destructive delete with confirmation. WARNING in description about not confusing with deactivation.

### Implementation

```typescript
inputSchema: z.object({
  connectionId: z.string().describe("The connectionId to delete."),
}),
execute: async ({ connectionId }) => {
  const conn = await getConnectionById(supabase, clientId, connectionId);
  if (!conn) return { success: false, error: "Connection not found." };

  const composio = getComposio();

  // Delete from Composio
  try {
    await composio.connectedAccounts.delete(conn.composio_connected_account_id);
  } catch (error) {
    console.error("[delete_connection] Failed to delete Composio account:", error);
    // Continue to delete local row even if Composio delete fails
  }

  // Delete local connection row
  await deleteConnection(supabase, clientId, connectionId);

  return {
    success: true,
    connectionId: conn.id,
    message: `Connection to ${conn.toolkit_slug} permanently deleted.`,
  };
},
```

**Key:** Description includes Tasklet's warning: "PERMANENTLY DELETES a connection. DO NOT use if user wants to deactivate tools → use manage_activated_tools_for_connections instead." v1: chat-based confirmation happened before tool call.

### TDD

1. **RED:** Test deletes both Composio account and local row.
2. **GREEN:** Implement.
3. **RED:** Test still deletes local row even if Composio delete fails.
4. **GREEN:** Try-catch around Composio call.
5. **RED:** Test connection not found returns error.
6. **GREEN:** Guard clause.

### Commit

```bash
git commit -m "feat(pr26): delete_connection tool"
```

---

## Task 13: Connection-scoped skill file lookup (PR26-8)

**Files:**
- Create: `src/lib/storage/skill-files.ts`
- Create: `src/lib/storage/__tests__/skill-files.test.ts`

**Path convention:** `/{clientId}/skills/connections/{connectionId}/SKILL.md`

This matches Tasklet's connection-scoped pattern (`/agent/skills/connections/{id}/SKILL.md`), not toolkit-scoped.

### Implementation

```typescript
// src/lib/storage/skill-files.ts
export function getConnectionSkillPath(clientId: string, connectionId: string): string {
  return `${clientId}/skills/connections/${connectionId}/SKILL.md`;
}

export async function getConnectionSkillContent(
  supabase: SupabaseClient<Database>,
  clientId: string,
  connectionId: string,
): Promise<string | null> {
  const path = getConnectionSkillPath(clientId, connectionId);

  const { data, error } = await supabase.storage
    .from("files")
    .download(path);

  if (error || !data) return null;
  return await data.text();
}
```

**v1:** Always returns null (no auto-generation). The plumbing is in place for post-v1 SKILL-05 implementation. The path, lookup, and system-reminder pointer are all ready.

### TDD

1. **RED:** Test `getConnectionSkillPath` returns correct path.
2. **GREEN:** Implement.
3. **RED:** Test `getConnectionSkillContent` returns null when no file exists.
4. **GREEN:** Implement with Supabase storage download.
5. **RED:** Test returns content when file exists (mock storage).
6. **GREEN:** Already handled.

### Commit

```bash
git commit -m "feat(pr26): connection-scoped skill file lookup helper"
```

---

## Task 14: Connection-ID-prefixed tool loading

**Files:**
- Create: `src/lib/composio/activated-tools.ts`
- Create: `src/lib/composio/__tests__/activated-tools.test.ts`
- Modify: `src/lib/composio/tools.ts` (keep for backward compat or remove)

Replaces the current `loadComposioTools` (which loads ALL tools for active toolkits) with a connection-aware loader that respects per-tool activation and prefixes tool names with connection ID.

### Implementation

```typescript
// src/lib/composio/activated-tools.ts
import type { ToolSet } from "ai";
import type { ConnectionRow } from "@/lib/connections/schemas";
import { getComposio } from "./client";

/**
 * Loads only the activated tools for each connection, prefixed with connection ID.
 * Example: connection "conn-abc" with activated tool "GMAIL_SEND_EMAIL"
 * → tool key: "conn-abc__GMAIL_SEND_EMAIL"
 */
export async function loadActivatedConnectionTools(
  composioUserId: string,
  connections: ConnectionRow[],
): Promise<ToolSet> {
  const activeConnections = connections.filter(
    (c) => c.status === "active" && c.activated_tools.length > 0,
  );

  if (activeConnections.length === 0) return {};

  const composio = getComposio();
  const allTools: ToolSet = {};

  for (const conn of activeConnections) {
    try {
      const tools = await composio.tools.get(composioUserId, {
        tools: conn.activated_tools,
      });

      // Prefix each tool with connection ID
      for (const [slug, toolDef] of Object.entries(tools)) {
        allTools[`${conn.id}__${slug}`] = toolDef;
      }
    } catch (error) {
      console.error(`[composio] Failed to load tools for connection ${conn.id}:`, error);
    }
  }

  return allTools;
}
```

**Key:** Uses `ToolsOnlyParams` (`{ tools: string[] }`) to load specific tool slugs. Each tool is prefixed with `{connectionId}__` matching Tasklet's `conn_1234__search_for_info` pattern.

### TDD

1. **RED:** Test returns empty ToolSet when no connections have activated tools.
2. **GREEN:** Implement filter.
3. **RED:** Test prefixes tool names with connection ID.
4. **GREEN:** Implement prefixing loop.
5. **RED:** Test skips inactive connections.
6. **GREEN:** Status filter.
7. **RED:** Test handles Composio errors gracefully (returns partial results).
8. **GREEN:** Try-catch per connection.

### Commit

```bash
git commit -m "feat(pr26): connection-ID-prefixed activated tool loader"
```

---

## Task 15: Barrel + runner wiring

**Files:**
- Create: `src/lib/runner/tools/connections/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/run-autopilot.ts`

### Connection tool barrel

```typescript
// src/lib/runner/tools/connections/index.ts
export interface CreateConnectionToolsOptions {
  allowMutations?: boolean;
}

export function createConnectionTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateConnectionToolsOptions,
) {
  const allowMutations = options?.allowMutations ?? true;

  const readTools = {
    ...createListConnectionsTool(supabase, clientId),
    ...createGetConnectionDetailsTool(supabase, clientId),
    ...createSearchIntegrationsTool(),
    ...createGetIntegrationCapabilitiesTool(),
  };

  if (!allowMutations) return readTools;

  return {
    ...readTools,
    ...createCreateConnectionTool(supabase, clientId),
    ...createManageToolsTool(supabase, clientId),
    ...createReauthorizeConnectionTool(supabase, clientId),
    ...createDeleteConnectionTool(supabase, clientId),
  };
}
```

### Runner updates

```typescript
// run-agent.ts — update RunnerTools type
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createTriggerTools> &
  ReturnType<typeof createConnectionTools> &
  ReturnType<typeof createUtilityTools> &
  ReturnType<typeof createWebTools>;

// createRunnerTools — add connection tools
export function createRunnerTools(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  options?: {
    allowTriggerMutations?: boolean;
    allowConnectionMutations?: boolean;
    crmMode?: "normal" | "setup";
    crmConfig?: Awaited<ReturnType<typeof loadCrmConfig>>["config"];
  },
) {
  // ... existing tools ...
  const connectionTools = createConnectionTools(supabase, clientId, {
    allowMutations: options?.allowConnectionMutations ?? true,
  });

  return { ...crmTools, ...storageTools, ...webTools, ...utilityTools, ...triggerTools, ...connectionTools };
}
```

### Runner tool loading update

Replace `loadComposioTools` with `loadActivatedConnectionTools`:

```typescript
// In runAgent():
const activeConnections = await getActiveConnections(supabase, clientId);
composioTools = await loadActivatedConnectionTools(clientId, activeConnections);
```

### Autopilot — read-only

```typescript
// run-autopilot.ts
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: false,
  allowConnectionMutations: false,  // Autopilot cannot create/manage/delete connections
});
```

### TDD

1. **RED:** Test `createConnectionTools` with mutations returns all 8 tools.
2. **GREEN:** Implement barrel.
3. **RED:** Test without mutations returns only 4 read tools.
4. **GREEN:** Conditional spread.
5. **RED:** Test `createRunnerTools` includes connection tools.
6. **GREEN:** Wire into factory.
7. **RED:** Test runner loads activated connection tools instead of all toolkit tools.
8. **GREEN:** Replace `loadComposioTools` call.

### Commit

```bash
git commit -m "feat(pr26): wire connection tools into runner with per-tool activation loading"
```

---

## Task 16: System prompt rewrite — `<external-connections>`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`

Replace the current `<connections>` section with Tasklet-faithful `<external-connections>`. The original Tasklet section has three sub-sections. Our adaptation preserves the structure and key instructions.

### New section

```typescript
// Replace the <connections> section in SYSTEM_PROMPT with:
`<external-connections>
You have the ability to connect to any external service using connections. Connections allow you to activate new tools to use in your work.
You are responsible for ensuring you have the right tools to accomplish the user's task. You MUST find, create, and activate connections as needed to get access to the services the user wants to use.

<using-existing-connections>
Your users may already have existing connections they want you to use.
ALWAYS prefer to use existing connections over creating new connections if the existing connection will work (for example, if it is tied to the correct account).
You MUST use the list_users_connections tool to check the users' existing connections first before creating new connections.
</using-existing-connections>

<creating-new-connections>
You can use the create_new_connections tool to create new connections to external services.
You can create connections to almost any external service using thousands of pre-built integrations, custom MCP servers, any HTTP API, or a remote computer with a browser you can view and control.

You MUST read the creating-connections skill file for full instructions before creating connections. Check if the file exists at: skills/system/creating-connections/SKILL.md
</creating-new-connections>

<using-connection-tools>
You MUST activate the tools you want to use from your connections before using them by calling manage_activated_tools_for_connections.
This will prompt the user to grant permissions to use the specified tools.
Activated connection tools will appear in your prompt prefixed with their connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.
To discover the full set of tools that are available for each connection before activating them call get_details_for_connections.

If your connection has an associated skills file you MUST read and follow the instructions in the skills file before using any tools from that connection.
</using-connection-tools>
</external-connections>`
```

**Key Tasklet fidelity points:**
- "MUST read creating-connections skill file before creating connections" — preserved from Tasklet
- "MUST activate tools before using them" — preserved
- Connection-ID-prefixed tool naming — `conn_1234__search_for_info` — preserved
- "MUST read connection skills file before using tools" — preserved
- Three sub-sections matching Tasklet structure — preserved

### TDD

1. **RED:** Test SYSTEM_PROMPT contains `<external-connections>`.
2. **GREEN:** Replace section.
3. **RED:** Test contains "MUST read" creating-connections skill instruction.
4. **GREEN:** Already in template.
5. **RED:** Test contains connection-ID-prefixed tool naming example.
6. **GREEN:** Already in template.
7. **RED:** Test does NOT contain old `<connections>` section or "Never try to create or manage connections yourself".
8. **GREEN:** Old section removed.

### Commit

```bash
git commit -m "feat(pr26): system prompt rewrite to Tasklet-faithful external-connections"
```

---

## Task 17: System-reminder enrichment (PR26-9)

**Files:**
- Modify: `src/lib/runner/system-reminder.ts`
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts`
- May modify: the `get_system_reminder_context` RPC or add a separate query

### Current format

```
Active connections: gmail, googlecalendar
```

### New format (Tasklet-faithful)

```
Active connections:
  gmail (conn-abc): 3/45 tools active (skill: connections/conn-abc/SKILL.md)
  googlecalendar (conn-def): 2/20 tools active
Inactive connections: 1
```

When no skill file exists, the `(skill: ...)` pointer is omitted. When a skill file exists, it's included every turn — this is Tasklet's mechanism for forcing skill file reads.

### Implementation approach

The current system-reminder context comes from `get_system_reminder_context` RPC which returns `active_connection_toolkits: string[]`. This needs to be enriched with per-connection data.

**Option A:** Update the RPC to return richer connection data.
**Option B:** Add a separate query in the TS layer.

Option B is simpler and avoids RPC changes:

```typescript
// In buildSystemReminder, after fetchReminderContext:
const connections = await getAllConnections(supabase, clientId);
const activeConns = connections.filter((c) => c.status === "active");
const inactiveCount = connections.filter((c) => c.status !== "active" && c.status !== "pending").length;

if (activeConns.length > 0) {
  const connLines = await Promise.all(activeConns.map(async (conn) => {
    const activatedCount = conn.activated_tools.length;
    const totalCount = conn.tool_count;
    const skillContent = await getConnectionSkillContent(supabase, clientId, conn.id);
    const skillPointer = skillContent ? ` (skill: connections/${conn.id}/SKILL.md)` : "";
    return `  ${escapeXml(conn.toolkit_slug)} (${conn.id}): ${activatedCount}/${totalCount} tools active${skillPointer}`;
  }));
  reminderLines.push(`Active connections:\n${connLines.join("\n")}`);
} else {
  reminderLines.push("Active connections: none");
}

if (inactiveCount > 0) {
  reminderLines.push(`Inactive connections: ${inactiveCount}`);
}
```

### Token budget note

Each connection line is ~60-80 chars. For 3 connections, that's ~200 chars (~50 tokens). Well within budget. The skill pointer adds ~40 chars per connection with a skill file.

### TDD

1. **RED:** Test system-reminder includes per-connection tool counts in format `toolkit (connId): N/M tools active`.
2. **GREEN:** Implement connection query + formatting.
3. **RED:** Test includes skill pointer when skill file exists.
4. **GREEN:** Check `getConnectionSkillContent` result.
5. **RED:** Test omits skill pointer when no skill file.
6. **GREEN:** Conditional suffix.
7. **RED:** Test includes inactive connection count.
8. **GREEN:** Filter and count.
9. **RED:** Test shows "Active connections: none" when no active connections.
10. **GREEN:** Length check.

### Commit

```bash
git commit -m "feat(pr26): enrich system-reminder with per-connection tool counts and skill pointers"
```

---

## Verification Checklist

Before marking PR 26 complete:

- [ ] All 8 connection tools implemented with Tasklet-aligned schemas and `inputSchema` (not `parameters`)
- [ ] Tool names match Tasklet exactly: `list_users_connections`, `get_details_for_connections`, `search_for_integrations`, `get_integrations_capabilities`, `create_new_connections`, `manage_activated_tools_for_connections`, `reauthorize_connection`, `delete_connection`
- [ ] **Per-tool activation:** `manage_activated_tools_for_connections` updates `activated_tools` column per connection, not connection-level on/off
- [ ] **Multi-connection:** Schema allows multiple connections per toolkit (unique constraint dropped)
- [ ] **Connection-scoped skill files:** Path convention `/{clientId}/skills/connections/{connectionId}/SKILL.md`, lookup helper exists
- [ ] **Connection-ID-prefixed tools:** Activated tools appear as `{connectionId}__TOOL_SLUG` in runner
- [ ] v1 type gating: `integrations` self-service, `mcp`/`direct_api` done-for-you, `computer_use` not available
- [ ] `list_users_connections` returns ALL connections (active + inactive + error + pending), not just active
- [ ] `get_details_for_connections` returns BOTH activated and deactivated tools per connection
- [ ] `get_integrations_capabilities` includes quality and notes fields ("UNKNOWN"/"" for v1)
- [ ] `search_for_integrations` includes quality, builder, and context fields
- [ ] `create_new_connections` creates pending row with `toolsToActivate` pre-populated; callback updates to active
- [ ] `reauthorize_connection` tries refresh first, falls back to re-auth; preserves connection identity
- [ ] `delete_connection` deletes both Composio account and local row
- [ ] Composio SDK calls use correct types: `tool.toolkit?.slug` (object not string), `SearchOnlyParams` has no `limit`
- [ ] System prompt rewritten to `<external-connections>` with 3 sub-sections matching Tasklet
- [ ] System prompt includes "MUST read creating-connections skill" instruction
- [ ] System prompt includes connection-ID-prefixed tool naming example
- [ ] System-reminder enriched: per-connection `toolkit (connId): N/M tools active` + skill pointer when file exists + inactive count
- [ ] Tools wired into runner via `createConnectionTools()` barrel with `RunnerTools` type updated
- [ ] `createRunnerTools` options shape updated with `allowConnectionMutations`
- [ ] Autopilot gets read-only connection tools (no mutations)
- [ ] Chat gets full connection tools (mutations allowed)
- [ ] Runner loads activated tools via `loadActivatedConnectionTools` instead of `loadComposioTools`
- [ ] All tests pass: `npx vitest run src/lib/runner/tools/connections/ src/lib/composio/__tests__/ src/lib/ai/__tests__/ src/lib/storage/__tests__/`
- [ ] Every TDD cycle includes RED → verify fail → GREEN → verify pass → REFACTOR

## Test Criteria (from v2 plan)

- [ ] Agent uses Composio action to read user's calendar
- [ ] Agent creates connection, activates subset of tools, writes skill file (skill file = stub lookup, SKILL-05 deferred)
- [ ] System-reminder shows active connections with tool counts and skill pointers after connecting a service
