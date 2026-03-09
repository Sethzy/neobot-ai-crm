# PR 26c: Read-Only Connection Tools Implementation Plan

**PR:** PR 26c (sub-PR of PR 26: Connection tools)
**Decisions:** TOOL-04, CONN-03
**Goal:** Implement the 4 read-only connection tools (`list_users_connections`, `get_details_for_connections`, `search_for_integrations`, `get_integrations_capabilities`), the connection tool barrel (`createConnectionTools`), and wire them into the runner. After this PR, the agent can discover existing connections and search the integration catalog.

**Architecture:** 4 read-only tools matching Tasklet spec verbatim. Each tool is a factory function returning a Vercel AI SDK `tool()` object, following the trigger-tool pattern in `src/lib/runner/tools/triggers/`. Connection tool barrel with `allowMutations` option (mutation branch empty until 26d). Runner wiring adds connection tools to `createRunnerTools`. Existing `loadComposioTools` Composio tool loading is kept unchanged in this PR — the replacement with `loadActivatedConnectionTools` is deferred to PR 26d when the per-tool activation model is built. Autopilot uses `allowConnectionMutations: false`.

**Tech Stack:** Vercel AI SDK v6 (`tool()`, `z` from `ai`), Zod 4, Vitest

**Response envelope convention (Finding 5 — codebase convention, not Tasklet):** All tool responses use `{ success: true, ... }` / `{ success: false, error }` envelopes. Tasklet canonical traces show varying shapes (bare arrays for `search_for_integrations`, keyed objects for `get_integrations_capabilities`). We follow our own codebase convention for consistency with CRM, trigger, and file tools. This is intentional drift from Tasklet trace shapes — the tool names and input contracts match Tasklet; the response envelopes follow Sunder convention.

---

## Relevant Files

### Create
- `src/lib/runner/tools/connections/list-connections.ts`
- `src/lib/runner/tools/connections/__tests__/list-connections.test.ts`
- `src/lib/runner/tools/connections/get-connection-details.ts`
- `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`
- `src/lib/runner/tools/connections/search-integrations.ts`
- `src/lib/runner/tools/connections/__tests__/search-integrations.test.ts`
- `src/lib/runner/tools/connections/get-integration-capabilities.ts`
- `src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts`
- `src/lib/runner/tools/connections/index.ts`
- `src/lib/runner/tools/connections/__tests__/index.test.ts`

### Modify
- `src/lib/runner/tools/index.ts` — add `createConnectionTools` export
- `src/lib/runner/run-agent.ts` — wire connection tools into `createRunnerTools` (keep existing `loadComposioTools` — replacement deferred to PR 26d)
- `src/lib/runner/run-autopilot.ts` — wire `allowConnectionMutations: false`

---

## Task 1: `list_users_connections` tool

**Files:**
- Create: `src/lib/runner/tools/connections/list-connections.ts`
- Create: `src/lib/runner/tools/connections/__tests__/list-connections.test.ts`

**Tasklet spec:** 18-list_users_connections.md — no params, returns ALL connections (active + inactive + error + pending).

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/list-connections.test.ts`:

```typescript
/**
 * Tests for list_users_connections tool.
 * @module lib/runner/tools/connections/__tests__/list-connections
 */
import { describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createListConnectionsTool } from "../list-connections";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const MIXED_CONNECTIONS = [
  {
    id: "conn-1",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-1",
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
    id: "conn-2",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-2",
    toolkit_slug: "slack",
    display_name: "Slack",
    account_identifier: null,
    status: "inactive",
    activated_tools: [],
    tool_count: 30,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "conn-3",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-3",
    toolkit_slug: "googlecalendar",
    display_name: null,
    account_identifier: null,
    status: "error",
    activated_tools: [],
    tool_count: 20,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "conn-4",
    client_id: CLIENT_ID,
    composio_connected_account_id: "composio-4",
    toolkit_slug: "gmail",
    display_name: null,
    account_identifier: null,
    status: "pending",
    activated_tools: [],
    tool_count: 0,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
  },
];

describe("list_users_connections", () => {
  it("returns empty array when no connections exist", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const tools = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await tools.list_users_connections.execute({}, { toolCallId: "test", messages: [] });

    expect(result).toEqual({ success: true, connections: [] });
  });

  it("returns connections of ALL statuses (active, inactive, error, pending)", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: MIXED_CONNECTIONS, error: null },
    });

    const tools = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await tools.list_users_connections.execute({}, { toolCallId: "test", messages: [] });

    expect(result.success).toBe(true);
    expect(result.connections).toHaveLength(4);
    expect(result.connections.map((c: { status: string }) => c.status)).toEqual([
      "active",
      "inactive",
      "error",
      "pending",
    ]);
  });

  it("response shape matches Tasklet spec", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MIXED_CONNECTIONS[0]], error: null },
    });

    const tools = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await tools.list_users_connections.execute({}, { toolCallId: "test", messages: [] });

    expect(result.connections[0]).toEqual({
      connectionId: "conn-1",
      serviceName: "gmail",
      description: "Gmail",
      accountName: "user@gmail.com",
      connectionType: "integrations",
      status: "active",
      activatedToolCount: 1,
      totalToolCount: 45,
    });
  });

  it("uses display_name as accountName fallback when account_identifier is null", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MIXED_CONNECTIONS[1]], error: null },
    });

    const tools = createListConnectionsTool(supabase as never, CLIENT_ID);
    const result = await tools.list_users_connections.execute({}, { toolCallId: "test", messages: [] });

    expect(result.connections[0].accountName).toBe("Slack");
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/list-connections.test.ts
```
Expected: FAIL — `../list-connections` module does not exist.

### Step 3: Implement `createListConnectionsTool`

Create `src/lib/runner/tools/connections/list-connections.ts`:

```typescript
/**
 * list_users_connections tool — lists all connections to external services.
 * Tasklet spec: 18-list_users_connections.md
 * @module lib/runner/tools/connections/list-connections
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAllConnections } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the list_users_connections tool.
 * Returns ALL connections (active + inactive + error + pending).
 */
export function createListConnectionsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    list_users_connections: tool({
      description:
        "Lists all connections to external services that the user has already created in their account.\nReturns connectionId, serviceName, description, accountName, connectionType, and connection-specific details for each connection.",
      inputSchema: z.object({}),
      execute: async () => {
        const connections = await getAllConnections(supabase, clientId);

        return {
          success: true,
          connections: connections.map((conn) => ({
            connectionId: conn.id,
            serviceName: conn.toolkit_slug,
            description: conn.display_name ?? conn.toolkit_slug,
            accountName: conn.account_identifier ?? conn.display_name,
            // v1: all Composio connections are "integrations" type.
            // Tasklet also supports mcp/direct_api/computer_use.
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

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/list-connections.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/list-connections.ts src/lib/runner/tools/connections/__tests__/list-connections.test.ts
git commit -m "feat(pr26c): list_users_connections tool"
```

---

## Task 2: `get_details_for_connections` tool

**Files:**
- Create: `src/lib/runner/tools/connections/get-connection-details.ts`
- Create: `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`

**Tasklet spec:** 19-get_details_for_connections.md — connectionIds + includeToolDetails, returns activated AND deactivated tools.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts`:

```typescript
/**
 * Tests for get_details_for_connections tool.
 * @module lib/runner/tools/connections/__tests__/get-connection-details
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createGetConnectionDetailsTool } from "../get-connection-details";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const MOCK_CONNECTION = {
  id: "conn-1",
  client_id: CLIENT_ID,
  composio_connected_account_id: "composio-1",
  toolkit_slug: "gmail",
  display_name: "Gmail",
  account_identifier: "user@gmail.com",
  status: "active",
  activated_tools: ["GMAIL_SEND_EMAIL"],
  tool_count: 3,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

const MOCK_RAW_TOOLS = [
  {
    slug: "GMAIL_SEND_EMAIL",
    name: "Send Email",
    description: "Send an email via Gmail",
    inputParameters: { to: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
  {
    slug: "GMAIL_READ_EMAIL",
    name: "Read Email",
    description: "Read emails from Gmail",
    inputParameters: { query: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
  {
    slug: "GMAIL_DELETE_EMAIL",
    name: "Delete Email",
    description: "Delete an email",
    inputParameters: { id: { type: "string" } },
    toolkit: { slug: "gmail", name: "Gmail" },
  },
];

function createMockComposio() {
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockResolvedValue(MOCK_RAW_TOOLS),
    },
  };
  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("get_details_for_connections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns activated and deactivated tool arrays split correctly", async () => {
    createMockComposio();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const tools = createGetConnectionDetailsTool(supabase as never, CLIENT_ID);
    const result = await tools.get_details_for_connections.execute(
      { connectionIds: ["conn-1"], includeToolDetails: false },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.connections[0].tools.activated).toHaveLength(1);
    expect(result.connections[0].tools.activated[0].slug).toBe("GMAIL_SEND_EMAIL");
    expect(result.connections[0].tools.deactivated).toHaveLength(2);
    expect(result.connections[0].tools.deactivated.map((t: { slug: string }) => t.slug).sort()).toEqual([
      "GMAIL_DELETE_EMAIL",
      "GMAIL_READ_EMAIL",
    ]);
  });

  it("includeToolDetails: true includes descriptions and arguments", async () => {
    createMockComposio();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const tools = createGetConnectionDetailsTool(supabase as never, CLIENT_ID);
    const result = await tools.get_details_for_connections.execute(
      { connectionIds: ["conn-1"], includeToolDetails: true },
      { toolCallId: "test", messages: [] },
    );

    const activatedTool = result.connections[0].tools.activated[0];
    expect(activatedTool).toHaveProperty("description");
    expect(activatedTool).toHaveProperty("arguments");
    expect(activatedTool.description).toBe("Send an email via Gmail");
  });

  it("includeToolDetails: false returns only slug and name", async () => {
    createMockComposio();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const tools = createGetConnectionDetailsTool(supabase as never, CLIENT_ID);
    const result = await tools.get_details_for_connections.execute(
      { connectionIds: ["conn-1"], includeToolDetails: false },
      { toolCallId: "test", messages: [] },
    );

    const activatedTool = result.connections[0].tools.activated[0];
    expect(Object.keys(activatedTool).sort()).toEqual(["name", "slug"]);
  });

  it("handles connection with zero activated tools", async () => {
    createMockComposio();
    const connNoTools = { ...MOCK_CONNECTION, id: "conn-2", activated_tools: [] };
    const supabase = createMockSupabaseClient({
      selectResult: { data: [connNoTools], error: null },
    });

    const tools = createGetConnectionDetailsTool(supabase as never, CLIENT_ID);
    const result = await tools.get_details_for_connections.execute(
      { connectionIds: ["conn-2"], includeToolDetails: false },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0].tools.activated).toHaveLength(0);
    expect(result.connections[0].tools.deactivated).toHaveLength(3);
  });

  it("response shape includes connection metadata", async () => {
    createMockComposio();
    const supabase = createMockSupabaseClient({
      selectResult: { data: [MOCK_CONNECTION], error: null },
    });

    const tools = createGetConnectionDetailsTool(supabase as never, CLIENT_ID);
    const result = await tools.get_details_for_connections.execute(
      { connectionIds: ["conn-1"], includeToolDetails: false },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0]).toMatchObject({
      connectionId: "conn-1",
      serviceName: "gmail",
      accountName: "user@gmail.com",
      connectionType: "integrations",
      status: "active",
      toolCount: 3,
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts
```
Expected: FAIL — `../get-connection-details` module does not exist.

### Step 3: Implement `createGetConnectionDetailsTool`

Create `src/lib/runner/tools/connections/get-connection-details.ts`:

```typescript
/**
 * get_details_for_connections tool — returns full details including tool activation.
 * Tasklet spec: 19-get_details_for_connections.md
 * @module lib/runner/tools/connections/get-connection-details
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import { getConnectionsByIds } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the get_details_for_connections tool.
 * Returns activated AND deactivated tools per connection.
 */
export function createGetConnectionDetailsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    get_details_for_connections: tool({
      description:
        "Gets detailed information for the listed connections.\nReturns a full list of tools, including both activated and deactivated tools, for each connection, including full detailed descriptions and arguments if requested.\nAlso returns connectionId, serviceName, description, accountName, connectionType, toolCount, and other connection-specific details.\n\nUse this to:\n- Discover what actions you can perform with a connection before activating it\n- Check which tools are already activated for a connection\n- Verify exact tool names before activating connections",
      inputSchema: z.object({
        connectionIds: z
          .array(z.string())
          .describe("The connection IDs to get details for"),
        includeToolDetails: z
          .boolean()
          .describe(
            "Pass true to include detailed descriptions and arguments for each connection tool in the results",
          ),
      }),
      execute: async ({ connectionIds, includeToolDetails }) => {
        const connections = await getConnectionsByIds(
          supabase,
          clientId,
          connectionIds,
        );
        const composio = getComposio();

        const results = await Promise.all(
          connections.map(async (conn) => {
            const rawTools = await composio.tools.getRawComposioTools({
              toolkits: [conn.toolkit_slug],
            });
            const activatedSet = new Set(conn.activated_tools);

            const activated = rawTools.filter((t) =>
              activatedSet.has(t.slug),
            );
            const deactivated = rawTools.filter(
              (t) => !activatedSet.has(t.slug),
            );

            const mapTool = (t: (typeof rawTools)[number]) =>
              includeToolDetails
                ? {
                    slug: t.slug,
                    name: t.name,
                    description: t.description ?? "",
                    arguments: t.inputParameters,
                  }
                : { slug: t.slug, name: t.name };

            return {
              connectionId: conn.id,
              serviceName: conn.toolkit_slug,
              description: conn.display_name ?? conn.toolkit_slug,
              accountName: conn.account_identifier ?? conn.display_name,
              // v1: all Composio connections are "integrations" type
              connectionType: "integrations" as const,
              status: conn.status,
              toolCount: rawTools.length,
              tools: {
                activated: activated.map(mapTool),
                deactivated: deactivated.map(mapTool),
              },
            };
          }),
        );

        return { success: true, connections: results };
      },
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/get-connection-details.ts src/lib/runner/tools/connections/__tests__/get-connection-details.test.ts
git commit -m "feat(pr26c): get_details_for_connections tool with per-tool activation"
```

---

## Task 3: `search_for_integrations` tool

**Files:**
- Create: `src/lib/runner/tools/connections/search-integrations.ts`
- Create: `src/lib/runner/tools/connections/__tests__/search-integrations.test.ts`

**Tasklet spec:** 21-search_for_integrations.md — keywords array, returns deduped integrations with quality/builder/context.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/search-integrations.test.ts`:

```typescript
/**
 * Tests for search_for_integrations tool.
 * @module lib/runner/tools/connections/__tests__/search-integrations
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  searchIntegrations: vi.fn(),
}));

import { searchIntegrations } from "@/lib/composio/catalog";

import { createSearchIntegrationsTool } from "../search-integrations";

describe("search_for_integrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns deduplicated integrations across multiple keywords", async () => {
    vi.mocked(searchIntegrations)
      .mockResolvedValueOnce([
        {
          integrationId: "gmail",
          name: "Gmail",
          description: "Email service",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
      ])
      .mockResolvedValueOnce([
        {
          integrationId: "gmail",
          name: "Gmail",
          description: "Email service",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
        {
          integrationId: "outlook",
          name: "Outlook",
          description: "Microsoft email",
          quality: "UNKNOWN",
          builder: "Composio",
          context: "",
        },
      ]);

    const tools = createSearchIntegrationsTool();
    const result = await tools.search_for_integrations.execute(
      { keywords: ["email", "mail"] },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.integrations).toHaveLength(2);
    expect(result.integrations.map((i: { integrationId: string }) => i.integrationId)).toEqual([
      "gmail",
      "outlook",
    ]);
  });

  it("response shape includes quality, builder, context fields", async () => {
    vi.mocked(searchIntegrations).mockResolvedValueOnce([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "Email service",
        quality: "UNKNOWN",
        builder: "Composio",
        context: "",
      },
    ]);

    const tools = createSearchIntegrationsTool();
    const result = await tools.search_for_integrations.execute(
      { keywords: ["email"] },
      { toolCallId: "test", messages: [] },
    );

    expect(result.integrations[0]).toEqual({
      integrationId: "gmail",
      name: "Gmail",
      description: "Email service",
      quality: "UNKNOWN",
      builder: "Composio",
      context: "",
    });
  });

  it("returns empty array for empty keywords", async () => {
    const tools = createSearchIntegrationsTool();
    const result = await tools.search_for_integrations.execute(
      { keywords: [] },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: true, integrations: [] });
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/search-integrations.test.ts
```
Expected: FAIL — `../search-integrations` module does not exist.

### Step 3: Implement `createSearchIntegrationsTool`

Create `src/lib/runner/tools/connections/search-integrations.ts`:

```typescript
/**
 * search_for_integrations tool — keyword search across the integration catalog.
 * Tasklet spec: 21-search_for_integrations.md
 * @module lib/runner/tools/connections/search-integrations
 */
import { tool } from "ai";
import { z } from "zod";

import { searchIntegrations, type CatalogIntegration } from "@/lib/composio/catalog";

/**
 * Creates the search_for_integrations tool.
 * NEVER mention integration quality scores or who built the integrations unless the user specifically asks.
 */
export function createSearchIntegrationsTool() {
  return {
    search_for_integrations: tool({
      description:
        "Lists integrations that match one or more given keywords. Keywords are single words (e.g. email, billing, tasks, Gmail, Asana, etc.).\nSearches integrations available through Composio and returns:\n- Integration ID\n- Name and description\n- Quality score (GREAT/GOOD/OK/LIMITED/UNKNOWN)\n- Who built it\n- Additional context about its capabilities and usage\n\nNEVER mention integration quality scores or who built the integrations unless the user specifically asks.\n\nOnce you have the integration ID you can get more information about it if needed using get_integrations_capabilities.",
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .describe(
            "The list of keywords to search for. Each keyword must be a single word. Verify exact tool names by calling get_integrations_capabilities first.",
          ),
      }),
      execute: async ({ keywords }) => {
        if (keywords.length === 0) {
          return { success: true, integrations: [] };
        }

        const allResults = new Map<string, CatalogIntegration>();

        for (const keyword of keywords) {
          const results = await searchIntegrations(keyword);

          for (const r of results) {
            if (!allResults.has(r.integrationId)) {
              allResults.set(r.integrationId, r);
            }
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
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/search-integrations.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/search-integrations.ts src/lib/runner/tools/connections/__tests__/search-integrations.test.ts
git commit -m "feat(pr26c): search_for_integrations tool with quality/builder/context"
```

---

## Task 4: `get_integrations_capabilities` tool

**Files:**
- Create: `src/lib/runner/tools/connections/get-integration-capabilities.ts`
- Create: `src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts`

**Tasklet spec:** 20-get_integrations_capabilities.md — integrationIds array, returns capabilities with tools, quality, notes.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts`:

```typescript
/**
 * Tests for get_integrations_capabilities tool.
 * @module lib/runner/tools/connections/__tests__/get-integration-capabilities
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/catalog", () => ({
  getToolkitCapabilities: vi.fn(),
}));

import { getToolkitCapabilities } from "@/lib/composio/catalog";

import { createGetIntegrationCapabilitiesTool } from "../get-integration-capabilities";

describe("get_integrations_capabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tools array for each integration", async () => {
    vi.mocked(getToolkitCapabilities).mockResolvedValue([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "",
        quality: "UNKNOWN",
        notes: "",
        tools: [
          {
            slug: "GMAIL_SEND_EMAIL",
            name: "Send Email",
            description: "Send an email",
            tags: ["email"],
          },
          {
            slug: "GMAIL_READ_EMAIL",
            name: "Read Email",
            description: "Read emails",
            tags: ["email"],
          },
        ],
      },
    ]);

    const tools = createGetIntegrationCapabilitiesTool();
    const result = await tools.get_integrations_capabilities.execute(
      { integrationIds: ["gmail"] },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.integrations).toHaveLength(1);
    expect(result.integrations[0].tools).toHaveLength(2);
    expect(result.integrations[0].tools[0].slug).toBe("GMAIL_SEND_EMAIL");
  });

  it("includes quality and notes fields (even if defaults)", async () => {
    vi.mocked(getToolkitCapabilities).mockResolvedValue([
      {
        integrationId: "gmail",
        name: "Gmail",
        description: "",
        quality: "UNKNOWN",
        notes: "",
        tools: [],
      },
    ]);

    const tools = createGetIntegrationCapabilitiesTool();
    const result = await tools.get_integrations_capabilities.execute(
      { integrationIds: ["gmail"] },
      { toolCallId: "test", messages: [] },
    );

    expect(result.integrations[0].quality).toBe("UNKNOWN");
    expect(result.integrations[0].notes).toBe("");
  });

  it("handles empty integrationIds array", async () => {
    vi.mocked(getToolkitCapabilities).mockResolvedValue([]);

    const tools = createGetIntegrationCapabilitiesTool();
    const result = await tools.get_integrations_capabilities.execute(
      { integrationIds: [] },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toEqual({ success: true, integrations: [] });
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts
```
Expected: FAIL — `../get-integration-capabilities` module does not exist.

### Step 3: Implement `createGetIntegrationCapabilitiesTool`

Create `src/lib/runner/tools/connections/get-integration-capabilities.ts`:

```typescript
/**
 * get_integrations_capabilities tool — returns toolkit capabilities with tool lists.
 * Tasklet spec: 20-get_integrations_capabilities.md
 * @module lib/runner/tools/connections/get-integration-capabilities
 */
import { tool } from "ai";
import { z } from "zod";

import { getToolkitCapabilities } from "@/lib/composio/catalog";

/**
 * Creates the get_integrations_capabilities tool.
 * Returns tools, quality, and notes for each integration.
 */
export function createGetIntegrationCapabilitiesTool() {
  return {
    get_integrations_capabilities: tool({
      description:
        "Lists the capabilities available via the given integrations, including tools (if available), quality information (GREAT, GOOD, OK, LIMITED, and UNKNOWN), and notes.",
      inputSchema: z.object({
        integrationIds: z
          .array(z.string())
          .describe("The list of integration IDs to get capabilities for."),
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
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/get-integration-capabilities.ts src/lib/runner/tools/connections/__tests__/get-integration-capabilities.test.ts
git commit -m "feat(pr26c): get_integrations_capabilities tool"
```

---

## Task 5: Connection tool barrel

**Files:**
- Create: `src/lib/runner/tools/connections/index.ts`
- Create: `src/lib/runner/tools/connections/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/index.ts`

### Step 1: Write the failing test — barrel returns exactly 4 read-only tools

Create `src/lib/runner/tools/connections/__tests__/index.test.ts`:

```typescript
/**
 * Tests for the connection tool barrel.
 * @module lib/runner/tools/connections/__tests__/index
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createConnectionTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createConnectionTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns exactly 4 read-only tools when mutations disabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: false,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "search_for_integrations",
    ]);
  });

  it("returns 4 tools when mutations enabled (mutation tools not yet added)", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "search_for_integrations",
    ]);
  });

  it("defaults to allowMutations: true", () => {
    const supabase = createMockSupabaseClient();
    const withDefault = createConnectionTools(supabase as never, CLIENT_ID);
    const withExplicit = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: true,
    });

    expect(Object.keys(withDefault).sort()).toEqual(
      Object.keys(withExplicit).sort(),
    );
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/index.test.ts
```
Expected: FAIL — `../index` module does not exist.

### Step 3: Implement the barrel

Create `src/lib/runner/tools/connections/index.ts`:

```typescript
/**
 * Connection tool factory barrel for runner registration.
 * @module lib/runner/tools/connections
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createGetConnectionDetailsTool } from "./get-connection-details";
import { createGetIntegrationCapabilitiesTool } from "./get-integration-capabilities";
import { createListConnectionsTool } from "./list-connections";
import { createSearchIntegrationsTool } from "./search-integrations";

export interface CreateConnectionToolsOptions {
  allowMutations?: boolean;
}

/**
 * Creates connection discovery and management tools for the active client.
 */
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

  // Mutation tools added in PR 26d
  return { ...readTools };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/index.test.ts
```
Expected: ALL PASS.

### Step 5: Update the tools barrel export

In `src/lib/runner/tools/index.ts`, add:

```typescript
export { createConnectionTools } from "./connections";
```

### Step 6: Run all connection tool tests

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/
```
Expected: ALL PASS.

### Step 7: Commit

```bash
git add src/lib/runner/tools/connections/index.ts src/lib/runner/tools/connections/__tests__/index.test.ts src/lib/runner/tools/index.ts
git commit -m "feat(pr26c): connection tool barrel with read-only tools"
```

---

## Task 6: Runner wiring

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/run-autopilot.ts`

### Step 1: Update `run-agent.ts` — imports

Add `createConnectionTools` to the tools import:
```typescript
import {
  createConnectionTools,
  createCrmTools,
  createStorageTools,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
```

**Note:** Keep the existing `loadComposioTools` and `getActiveToolkitSlugs` imports unchanged. The replacement with `loadActivatedConnectionTools` is deferred to PR 26d when the per-tool activation model is built.

### Step 2: Update `RunnerTools` type

Replace:
```typescript
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createTriggerTools> &
  ReturnType<typeof createUtilityTools> &
  ReturnType<typeof createWebTools>;
```
with:
```typescript
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createTriggerTools> &
  ReturnType<typeof createConnectionTools> &
  ReturnType<typeof createUtilityTools> &
  ReturnType<typeof createWebTools>;
```

### Step 3: Update `createRunnerTools` function

Add `allowConnectionMutations` option and wire connection tools:

```typescript
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
  const crmTools = createCrmTools(supabase, clientId, {
    allowWriteTools: true,
    mode: options?.crmMode ?? "normal",
    config: options?.crmConfig,
  });
  const storageTools = createStorageTools(supabase, clientId);
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(supabase, clientId, threadId);
  const triggerTools = createTriggerTools(supabase, clientId, threadId, {
    allowMutations: options?.allowTriggerMutations ?? true,
  });
  const connectionTools = createConnectionTools(supabase, clientId, {
    allowMutations: options?.allowConnectionMutations ?? true,
  });

  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...utilityTools,
    ...triggerTools,
    ...connectionTools,
  };
}
```

### Step 4: Update `run-autopilot.ts` — add `allowConnectionMutations: false`

In `runAutopilot()`, update the `createRunnerTools` call:

```typescript
      tools: createRunnerTools(supabase, clientId, threadId, {
        allowTriggerMutations: false,
        allowConnectionMutations: false,
      }),
```

### Step 5: Run existing runner tests to verify no regressions

Run:
```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: ALL PASS. The existing `run-agent.test.ts` and `run-autopilot.test.ts` tests should continue to pass since they mock the tool loading and don't test the specific tools returned.

### Step 6: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/run-autopilot.ts
git commit -m "feat(pr26c): wire connection tools into runner"
```

---

## Verification Checklist

- [ ] Tool names match Tasklet exactly: `list_users_connections`, `get_details_for_connections`, `search_for_integrations`, `get_integrations_capabilities`
- [ ] All tools use `inputSchema` (codebase convention — 29 existing uses, 0 uses of `parameters`)
- [ ] Tool descriptions match Tasklet spec verbatim (adapted only for Composio vs Pipedream)
- [ ] `list_users_connections` returns ALL connections (active + inactive + error + pending)
- [ ] `list_users_connections` response includes `description` field (Tasklet return shape)
- [ ] `get_details_for_connections` returns BOTH activated and deactivated tools per connection
- [ ] `get_details_for_connections` `includeToolDetails` toggle works (full vs. summary)
- [ ] `get_details_for_connections` response includes `description` field
- [ ] `search_for_integrations` response includes quality, builder, context fields
- [ ] `search_for_integrations` deduplicates across keywords
- [ ] `get_integrations_capabilities` response includes quality, notes, tools array
- [ ] `connectionType` hardcoded to `"integrations"` with v1 comment (Tasklet also supports mcp/direct_api/computer_use)
- [ ] Barrel follows trigger-tool factory pattern (`CreateConnectionToolsOptions` with `allowMutations`)
- [ ] `createConnectionTools` exported from `src/lib/runner/tools/index.ts`
- [ ] `RunnerTools` type includes `ReturnType<typeof createConnectionTools>`
- [ ] `createRunnerTools` has `allowConnectionMutations` option
- [ ] Existing `loadComposioTools` kept unchanged (replacement deferred to PR 26d)
- [ ] Autopilot uses `allowConnectionMutations: false`
- [ ] All tests pass: `npx vitest run src/lib/runner/tools/connections/__tests__/ src/lib/runner/__tests__/`
