# PR 26d: Mutation Connection Tools Implementation Plan

**PR:** PR 26d (sub-PR of PR 26: Connection tools)
**Decisions:** TOOL-04, TOOL-06, CONN-01, CONN-02, CONN-03, SKILL-05
**Depends on:** PR 26a (schema), PR 26b (Composio helpers), PR 26c (barrel + runner wiring)
**Blocks:** PR 26e (system prompt references these tools)

**Goal:** Implement the 4 mutation connection tools (`create_new_connections`, `manage_activated_tools_for_connections`, `reauthorize_connection`, `delete_connection`), update the callback route for the pending-connection flow, wire mutation tools into the barrel, and replace `loadComposioTools` with `loadActivatedConnectionTools` in the runner. After this PR, the agent can create, configure, repair, and remove connections, and only activated tools are loaded per-connection with connection-ID prefixes.

**Architecture:** 4 mutation tools matching Tasklet spec, adapted for v1 (chat-based approval + redirect URLs instead of UI cards). Callback route gains pending-row-finding logic — when `create_new_connections` inserts a `status: 'pending'` row, the callback finds it and updates to `active`. Runner's `loadComposioTools` (all-tools-per-toolkit) replaced with `loadActivatedConnectionTools` (only activated tools, connection-ID-prefixed) from PR 26b.

**Tech Stack:** Vercel AI SDK v6 (`tool()`, `z` from `ai`), Composio SDK (`@composio/core`), Zod 4, Vitest

---

## Tasklet Reference Files

| Tool Spec | Key Behavior |
|-----------|-------------|
| `.../tasklet tools/built-in/v2/25-create_new_connections.md` | 4 types (integrations/mcp/direct_api/computer_use), returns AFTER user approval with userAction/connectionId/tools |
| `.../tasklet tools/built-in/v2/22-manage_activated_tools_for_connections.md` | Per-connection activate/deactivate arrays, returns userAction + tool lists |
| `.../tasklet tools/built-in/v2/23-reauthorize_connection.md` | Re-auth existing connection, cannot change account |
| `.../tasklet tools/built-in/v2/24-delete_connection.md` | Destructive delete with confirmation. WARNING about not confusing with deactivation |

### Workflow References
| File | What it tells you |
|------|-------------------|
| `.../skills-system/03-creating-connections-skill.md` | 4-tier priority: integrations → MCP → direct_api → computer_use |
| `.../complex-multi-integration-workflow/02-connection-setup-and-auth-failure-handling.md` | 4 auth outcomes: approved → skipped → partial → expired/revoked |

All paths abbreviated from `roadmap docs/Sunder - Source of Truth/references/tasklet/`.

---

## v1 Scoping Decisions

| Connection Type | v1 Behavior | Backend |
|-----------------|-------------|---------|
| `integrations` | Self-service via Composio OAuth | PR 25 initiate/callback + `initiateOAuthFlow` helper |
| `mcp` | Done-for-you — return "Contact Sunder team to set up MCP connections" | Stub |
| `direct_api` | Done-for-you — return "Contact Sunder team to set up Direct API connections" | Stub |
| `computer_use` | Not available — return "Computer Use connections are not yet available" | Stub |

Per TOOL-06: "mcp/direct_api available in v1 but done-for-you setup only." **However, the v2 plan (source of truth, higher authority than arch decisions) scopes PR 26 to Composio OAuth integrations only (Finding 4). TOOL-06 describes the aspirational full product; the v2 plan narrows v1 scope. Stubs return explicit "contact team" / "not yet available" messages — the model knows these types exist but cannot use them yet.**

> **IMPORTANT — Intentional Tasklet Deviations (Finding 1):** This PR's mutation tools preserve Tasklet tool names and input contracts but change the approval lifecycle. Tasklet's tools block until the user approves/skips via UI cards — Sunder v1 has no UI cards, so tools return immediately with redirect URLs and the agent verifies on the next turn. This is the correct adaptation to a serverless + chat architecture. The deviations are itemized below. If you are reviewing this PR against Tasklet traces, expect these differences — they are by design, not oversights.

**v1 approval semantics:** Without UI cards (PR 33), mutation tools use chat-based approval — the agent describes the action, the user confirms in chat, then the agent calls the tool.

**v1 `create_new_connections` cannot block (Finding 6 — explicit v1 deviation):** Tasklet's tool blocks until OAuth completes and returns `userAction: created|skipped`. Without UI cards, we return `{ connectionStatus: "pending_auth", redirectUrl }`. The agent presents the link. On the next turn, the agent calls `list_users_connections` to verify. The connection row is created with `status: 'pending'`. Future: Composio SDK exposes `waitForConnection(id, timeout)` which could enable blocking — evaluate for PR 33 (UI cards).

**v1 `reauthorize_connection` cannot block:** Same pattern — returns `redirectUrl` for re-auth via `refresh(id, { redirectUrl })` on the SAME connected account (preserves identity).

**v1 `manage_activated_tools_for_connections` (Finding 10 — explicit v1 deviation):** `userAction` always `"approved"` — chat-based approval happened before the tool call. Activation changes are local-only (update `activated_tools` in Supabase). This is sufficient for v1 because `loadActivatedConnectionTools` (PR 26b) only loads tools in the local array — the agent cannot call tools not in `activated_tools`. Future: sync to Composio's `toolAccessConfig.toolsAvailableForExecution` for defense-in-depth.

**v1 non-integration types (Finding 12):** Only `integrations` is functional. `mcp`, `direct_api`, and `computer_use` return stub messages. Input schema accepts all 4 types for Tasklet parity — stubs are explicit, not placeholders for "done" behavior.

---

## Relevant Files

### Create
- `src/lib/runner/tools/connections/create-connection.ts`
- `src/lib/runner/tools/connections/__tests__/create-connection.test.ts`
- `src/lib/runner/tools/connections/manage-tools.ts`
- `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`
- `src/lib/runner/tools/connections/reauthorize-connection.ts`
- `src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts`
- `src/lib/runner/tools/connections/delete-connection.ts`
- `src/lib/runner/tools/connections/__tests__/delete-connection.test.ts`

### Modify
- `src/lib/runner/tools/connections/index.ts` — add mutation tools to barrel
- `src/lib/runner/tools/connections/__tests__/index.test.ts` — update barrel tests for 8 tools
- `app/api/connections/callback/route.ts` — pending row activation + tool_count enrichment
- `src/lib/runner/run-agent.ts` — replace `loadComposioTools` with `loadActivatedConnectionTools`

---

## Task 1: `create_new_connections` tool

**Files:**
- Create: `src/lib/runner/tools/connections/create-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/create-connection.test.ts`

**Tasklet spec:** 25-create_new_connections.md — 4 types, returns userAction/connectionId/tools after user approval.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/create-connection.test.ts`:

```typescript
/**
 * Tests for create_new_connections tool.
 * @module lib/runner/tools/connections/__tests__/create-connection
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/connection-flow", () => ({
  initiateOAuthFlow: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  insertConnection: vi.fn(),
  getActiveConnectionsByToolkit: vi.fn().mockResolvedValue([]),
}));

import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import {
  getActiveConnectionsByToolkit,
  insertConnection,
} from "@/lib/connections/queries";

import { createCreateConnectionTool } from "../create-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function createMockSupabase() {
  return {} as never;
}

describe("create_new_connections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("integrations type: calls initiateOAuthFlow and returns pending_auth with redirectUrl", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-123",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [
            { integrationId: "gmail", toolsToActivate: ["GMAIL_SEND_EMAIL"] },
          ],
        },
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      integrationId: "gmail",
      connectionStatus: "pending_auth",
      redirectUrl: "https://composio.dev/oauth/redirect",
    });
  });

  it("integrations type: inserts pending connection row with activated_tools from toolsToActivate", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-123",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    await tools.create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [
            { integrationId: "gmail", toolsToActivate: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"] },
          ],
        },
      },
      { toolCallId: "test", messages: [] },
    );

    expect(insertConnection).toHaveBeenCalledWith(supabase, {
      client_id: CLIENT_ID,
      composio_connected_account_id: "composio-acct-123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
      tool_count: 0,
    });
  });

  it("integrations type: defaults toolsToActivate to empty array when not provided", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(initiateOAuthFlow).mockResolvedValue({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "composio-acct-456",
    });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    await tools.create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [{ integrationId: "slack" }],
        },
      },
      { toolCallId: "test", messages: [] },
    );

    expect(insertConnection).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ activated_tools: [] }),
    );
  });

  it("integrations type: handles multiple integrations in one call", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([]);
    vi.mocked(initiateOAuthFlow)
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/gmail",
        connectedAccountId: "composio-gmail",
      })
      .mockResolvedValueOnce({
        redirectUrl: "https://composio.dev/oauth/slack",
        connectedAccountId: "composio-slack",
      });
    vi.mocked(insertConnection).mockResolvedValue({} as never);

    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [
            { integrationId: "gmail" },
            { integrationId: "slack" },
          ],
        },
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.results).toHaveLength(2);
    expect(insertConnection).toHaveBeenCalledTimes(2);
  });

  it("integrations type: includes existing connections info but still creates (Finding 7)", async () => {
    vi.mocked(getActiveConnectionsByToolkit).mockResolvedValue([
      {
        id: "conn-existing",
        toolkit_slug: "gmail",
        account_identifier: "personal@gmail.com",
      },
    ] as never);

    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      {
        connection: {
          type: "integrations",
          integrations: [{ integrationId: "gmail" }],
        },
      },
      { toolCallId: "test", messages: [] },
    );

    // Should still create — multi-connection allowed
    expect(result.results[0]).toMatchObject({
      integrationId: "gmail",
      connectionStatus: "pending_auth",
      existingConnections: [
        { connectionId: "conn-existing", accountIdentifier: "personal@gmail.com" },
      ],
    });
    expect(initiateOAuthFlow).toHaveBeenCalled();
    expect(insertConnection).toHaveBeenCalled();
  });

  it("mcp type: returns done-for-you message", async () => {
    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      { connection: { type: "mcp" } },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("MCP");
    expect(result.error).toContain("manual setup");
  });

  it("direct_api type: returns done-for-you message", async () => {
    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      {
        connection: {
          type: "direct_api",
          serviceName: "Test",
          description: "Test",
          connectionName: "Test",
          baseUrl: "https://api.test.com",
          methods: ["GET"],
          authConfig: {},
          notes: "",
        },
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Direct API");
    expect(result.error).toContain("manual setup");
  });

  it("computer_use type: returns not-available message", async () => {
    const supabase = createMockSupabase();
    const tools = createCreateConnectionTool(supabase, CLIENT_ID);
    const result = await tools.create_new_connections.execute(
      { connection: { type: "computer_use", displayName: "Test Computer" } },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Computer Use");
    expect(result.error).toContain("not yet available");
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/create-connection.test.ts
```
Expected: FAIL — `../create-connection` module does not exist.

### Step 3: Implement `createCreateConnectionTool`

Create `src/lib/runner/tools/connections/create-connection.ts`:

```typescript
/**
 * create_new_connections tool — creates new connections to external services.
 * Tasklet spec: 25-create_new_connections.md
 * v1: integrations type uses redirect URL (no UI cards). mcp/direct_api are done-for-you. computer_use not available.
 * @module lib/runner/tools/connections/create-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
import {
  getActiveConnectionsByToolkit,
  insertConnection,
} from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the create_new_connections tool.
 * Supports 4 connection types; only `integrations` is self-service in v1.
 */
export function createCreateConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    create_new_connections: tool({
      description:
        "Creates new connections to external services.\nFor integration connections, initiates OAuth and returns an authorization URL for the user to complete.\n\nIMPORTANT: If skills/system/creating-connections/SKILL.md exists, you MUST read it for detailed setup instructions before using this tool.\n\nSupports 4 connection types: pre-built integrations, custom MCP, Direct API (HTTP), and Computer Use.\nFor pre-built integrations, supports creating multiple connections at once. All others support only one at a time.\n\nFor integration connections returns:\n- connectionStatus: 'pending_auth' while awaiting user authorization\n- redirectUrl: the authorization URL to present to the user\n\nAfter the user completes authorization, use list_users_connections to verify the connection was created.",
      inputSchema: z.object({
        connection: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("integrations"),
            integrations: z.array(
              z.object({
                integrationId: z
                  .string()
                  .describe("The integration id (toolkit slug)"),
                toolsToActivate: z
                  .array(z.string())
                  .optional()
                  .describe("Tools to activate once connected"),
              }),
            ),
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
            methods: z.array(
              z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            ),
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
      execute: async ({ connection }) => {
        if (connection.type === "mcp") {
          return {
            success: false,
            error:
              "MCP connections require manual setup. Contact the Sunder team.",
          };
        }
        if (connection.type === "direct_api") {
          return {
            success: false,
            error:
              "Direct API connections require manual setup. Contact the Sunder team.",
          };
        }
        if (connection.type === "computer_use") {
          return {
            success: false,
            error: "Computer Use connections are not yet available.",
          };
        }

        // Finding 7: Use plural getActiveConnectionsByToolkit — inform about existing
        // connections but DO NOT block creation. Multi-connection per toolkit is allowed.
        // Finding 8: Uses process.env.NEXT_PUBLIC_APP_URL because tool functions don't have
        // request context (unlike the PR25 route handler which uses `new URL(..., request.url)`).
        const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/callback`;
        const results = [];

        for (const integration of connection.integrations) {
          const existingConnections = await getActiveConnectionsByToolkit(
            supabase,
            clientId,
            integration.integrationId,
          );

          const { redirectUrl, connectedAccountId } =
            await initiateOAuthFlow({
              composioUserId: clientId,
              toolkitSlug: integration.integrationId,
              callbackUrl,
            });

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
            connectionStatus: "pending_auth" as const,
            redirectUrl,
            existingConnections: existingConnections.length > 0
              ? existingConnections.map((c) => ({
                  connectionId: c.id,
                  accountIdentifier: c.account_identifier,
                }))
              : undefined,
          });
        }

        return {
          success: true,
          message:
            "Send these authorization links to the user. After they complete authorization, use list_users_connections to verify the connections were created.",
          results,
        };
      },
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/create-connection.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/create-connection.ts src/lib/runner/tools/connections/__tests__/create-connection.test.ts
git commit -m "feat(pr26d): create_new_connections tool with pending connection flow"
```

---

## Task 2: Callback route update for pending rows

**Files:**
- Modify: `app/api/connections/callback/route.ts`

### Current behavior

The callback calls `upsertConnection` (which PR 26a will delete) with basic fields. No tool_count, no account_identifier, no pending-row awareness.

### New behavior (Finding 8: uses insertConnection, not upsertConnection)

The callback:
1. Gets enrichment data (tool_count from Composio, account_identifier from deprecated `data`/`params` bags — Finding 4a)
2. Checks for a pending row by `composio_connected_account_id`
3. If pending row found → updates to `active` with enrichment (preserves `activated_tools`)
4. If no pending row → falls back to `insertConnection` with enrichment

### Step 1: Write the failing test

Create `app/api/connections/callback/__tests__/route.test.ts`:

```typescript
/**
 * Tests for callback route pending-row activation logic.
 * @module app/api/connections/callback/__tests__/route
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: vi.fn(),
}));
vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: vi.fn(),
}));
vi.mock("@/lib/composio", () => ({
  getComposio: vi.fn(),
}));
vi.mock("@/lib/connections/queries", () => ({
  insertConnection: vi.fn(),
}));

import { authenticateRequest } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getComposio } from "@/lib/composio";
import { insertConnection } from "@/lib/connections/queries";

import { GET } from "../route";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "user-123";
const CONNECTED_ACCOUNT_ID = "composio-acct-456";

function createCallbackRequest(
  params: Record<string, string> = {},
): Request {
  const url = new URL("https://example.com/api/connections/callback");
  url.searchParams.set("status", "success");
  url.searchParams.set("connected_account_id", CONNECTED_ACCOUNT_ID);

  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return new Request(url.toString());
}

function setupAuthMock(mockSupabase: Record<string, unknown>) {
  vi.mocked(authenticateRequest).mockResolvedValue({
    kind: "ok",
    supabase: mockSupabase as never,
    userId: USER_ID,
  } as never);
  vi.mocked(resolveClientId).mockResolvedValue(CLIENT_ID);
}

function setupComposioMock(overrides?: {
  accountStatus?: string;
  /** Finding 4a: SDK has deprecated `data` bag (no `metadata` field exists). */
  data?: Record<string, unknown>;
  toolkitSlug?: string;
}) {
  const rawTools = [
    { slug: "GMAIL_SEND_EMAIL" },
    { slug: "GMAIL_READ_EMAIL" },
    { slug: "GMAIL_DELETE_EMAIL" },
  ];

  const mockComposio = {
    connectedAccounts: {
      get: vi.fn().mockResolvedValue({
        id: CONNECTED_ACCOUNT_ID,
        status: overrides?.accountStatus ?? "ACTIVE",
        toolkit: { slug: overrides?.toolkitSlug ?? "gmail", name: "Gmail" },
        data: overrides?.data ?? { email: "user@gmail.com" },
      }),
      list: vi.fn().mockResolvedValue({
        items: [{ id: CONNECTED_ACCOUNT_ID }],
      }),
    },
    tools: {
      getRawComposioTools: vi.fn().mockResolvedValue(rawTools),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("GET callback — pending row activation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates pending row to active with tool_count and account_identifier", async () => {
    const pendingRow = { id: "conn-pending-1", status: "pending" };
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: pendingRow,
                error: null,
              }),
            }),
          }),
        }),
        update: updateFn,
      }),
    };

    setupAuthMock(mockSupabase);
    setupComposioMock();

    const response = await GET(createCallbackRequest());

    expect(updateFn).toHaveBeenCalledWith({
      status: "active",
      tool_count: 3,
      account_identifier: "user@gmail.com",
    });
    expect(insertConnection).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });

  it("falls back to insertConnection when no pending row exists (Finding 8)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    setupAuthMock(mockSupabase);
    setupComposioMock();

    await GET(createCallbackRequest());

    expect(insertConnection).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        client_id: CLIENT_ID,
        toolkit_slug: "gmail",
        status: "active",
        tool_count: 3,
        account_identifier: "user@gmail.com",
        activated_tools: [],
      }),
    );
  });

  it("preserves activated_tools from pending row (does not overwrite)", async () => {
    const pendingRow = {
      id: "conn-pending-2",
      status: "pending",
      activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
    };
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: pendingRow,
                error: null,
              }),
            }),
          }),
        }),
        update: updateFn,
      }),
    };

    setupAuthMock(mockSupabase);
    setupComposioMock();

    await GET(createCallbackRequest());

    const updatePayload = updateFn.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("activated_tools");
    expect(updatePayload).toEqual({
      status: "active",
      tool_count: 3,
      account_identifier: "user@gmail.com",
    });
  });

  it("populates account_identifier as null when Composio data bag has no email (Finding 4a)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    setupAuthMock(mockSupabase);
    setupComposioMock({ data: {} });

    await GET(createCallbackRequest());

    expect(insertConnection).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ account_identifier: null }),
    );
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run app/api/connections/callback/__tests__/route.test.ts
```
Expected: FAIL — tests fail because the route does not yet have pending-row logic.

### Step 3: Implement the callback route update

Update `app/api/connections/callback/route.ts`. Replace the `upsertConnection` call (lines 117-123) with pending-row-aware logic:

```typescript
// Add to imports at top:
// (no new imports needed — getComposio already imported)

// Replace lines 117-123 (the upsertConnection call) with:

    // Enrich with tool count and account identifier
    const rawTools = await composio.tools.getRawComposioTools({
      toolkits: [connectedAccount.toolkit.slug],
    });
    const toolCount = rawTools.length;
    // Finding 4a: ConnectedAccountRetrieveResponse has no `metadata` field.
    // Use deprecated `data` / `params` bags — one of them may contain email.
    const accountIdentifier =
      (connectedAccount.data as Record<string, unknown> | undefined)?.email as string | undefined
      ?? (connectedAccount.params as Record<string, unknown> | undefined)?.email as string | undefined
      ?? null;

    // Check for pending row created by create_new_connections tool
    const { data: pendingRow } = await supabase
      .from("connections")
      .select("*")
      .eq("composio_connected_account_id", connectedAccount.id)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingRow) {
      // Update existing pending row → active (preserves activated_tools)
      await supabase
        .from("connections")
        .update({
          status: "active",
          tool_count: toolCount,
          account_identifier: accountIdentifier,
        })
        .eq("id", pendingRow.id);
    } else {
      // Finding 8: Fallback uses insertConnection (not upsertConnection, which PR 26a deletes).
      // This path handles the Settings UI flow where no pending row exists.
      await insertConnection(supabase, {
        client_id: clientId,
        composio_connected_account_id: connectedAccount.id,
        toolkit_slug: connectedAccount.toolkit.slug,
        display_name: null,
        account_identifier: accountIdentifier,
        status: "active",
        activated_tools: [],
        tool_count: toolCount,
      });
    }
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run app/api/connections/callback/__tests__/route.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add app/api/connections/callback/route.ts app/api/connections/callback/__tests__/route.test.ts
git commit -m "feat(pr26d): callback route updates pending connection rows to active"
```

---

## Task 3: `manage_activated_tools_for_connections` tool

**Files:**
- Create: `src/lib/runner/tools/connections/manage-tools.ts`
- Create: `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`

**Tasklet spec:** 22-manage_activated_tools_for_connections.md — per-connection activate/deactivate arrays, returns userAction + tool lists.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/manage-tools.test.ts`:

```typescript
/**
 * Tests for manage_activated_tools_for_connections tool.
 * @module lib/runner/tools/connections/__tests__/manage-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: vi.fn(),
  updateConnectionActivatedTools: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import {
  getConnectionById,
  updateConnectionActivatedTools,
} from "@/lib/connections/queries";

import { createManageToolsTool } from "../manage-tools";

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
  { slug: "GMAIL_SEND_EMAIL", name: "Send Email" },
  { slug: "GMAIL_READ_EMAIL", name: "Read Email" },
  { slug: "GMAIL_DELETE_EMAIL", name: "Delete Email" },
];

function setupComposioMock() {
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockResolvedValue(MOCK_RAW_TOOLS),
    },
  };
  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

function createMockSupabase() {
  return {} as never;
}

describe("manage_activated_tools_for_connections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("activating tools adds them to activated_tools", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL"],
            deactivate: [],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(updateConnectionActivatedTools).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
      expect.arrayContaining(["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]),
    );
  });

  it("deactivating tools removes them from activated_tools", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: [],
            deactivate: ["GMAIL_SEND_EMAIL"],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(updateConnectionActivatedTools).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
      [],
    );
  });

  it("combined activate + deactivate in one request", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL", "GMAIL_DELETE_EMAIL"],
            deactivate: ["GMAIL_SEND_EMAIL"],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(updateConnectionActivatedTools).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
      expect.arrayContaining(["GMAIL_READ_EMAIL", "GMAIL_DELETE_EMAIL"]),
    );
    const savedTools = vi.mocked(updateConnectionActivatedTools).mock.calls[0][3];
    expect(savedTools).not.toContain("GMAIL_SEND_EMAIL");
  });

  it("invalid tool names return error for that connection", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["NONEXISTENT_TOOL"],
            deactivate: [],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0].error).toContain("NONEXISTENT_TOOL");
    expect(updateConnectionActivatedTools).not.toHaveBeenCalled();
  });

  it("connection not found returns error", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(null);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          { connectionId: "conn-999", activate: [], deactivate: [] },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0].error).toContain("not found");
  });

  it("response splits tools into activated/deactivated arrays", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL"],
            deactivate: [],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    const conn = result.connections[0];
    expect(conn.userAction).toBe("approved");
    expect(conn.tools.activated.sort()).toEqual(
      ["GMAIL_READ_EMAIL", "GMAIL_SEND_EMAIL"].sort(),
    );
    expect(conn.tools.deactivated).toEqual(["GMAIL_DELETE_EMAIL"]);
  });

  it("returns skills pointer on first activation, with caveat (Finding 11)", async () => {
    setupComposioMock();
    const connNoTools = { ...MOCK_CONNECTION, activated_tools: [] };
    vi.mocked(getConnectionById).mockResolvedValue(connNoTools as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_SEND_EMAIL"],
            deactivate: [],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0].skills).toContain("SKILL.md");
    expect(result.connections[0].skills).toContain("not all connections have one");
    // Finding 13: Uses conn.id (not toolkit_slug) to match PR 26e's getConnectionSkillPath
    expect(result.connections[0].skills).toContain("conn-1");
  });

  it("omits skills pointer on subsequent activations", async () => {
    setupComposioMock();
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    vi.mocked(updateConnectionActivatedTools).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createManageToolsTool(supabase, CLIENT_ID);
    const result = await tools.manage_activated_tools_for_connections.execute(
      {
        connections: [
          {
            connectionId: "conn-1",
            activate: ["GMAIL_READ_EMAIL"],
            deactivate: [],
          },
        ],
      },
      { toolCallId: "test", messages: [] },
    );

    expect(result.connections[0].skills).toBeUndefined();
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts
```
Expected: FAIL — `../manage-tools` module does not exist.

### Step 3: Implement `createManageToolsTool`

Create `src/lib/runner/tools/connections/manage-tools.ts`:

```typescript
/**
 * manage_activated_tools_for_connections tool — per-connection tool activation.
 * Tasklet spec: 22-manage_activated_tools_for_connections.md
 * v1: chat-based approval (userAction always "approved").
 * @module lib/runner/tools/connections/manage-tools
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import {
  getConnectionById,
  updateConnectionActivatedTools,
} from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the manage_activated_tools_for_connections tool.
 * Per-connection activate/deactivate arrays. Validates tool names against Composio.
 */
export function createManageToolsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    manage_activated_tools_for_connections: tool({
      description:
        "Activates or deactivates tools for connections.\nChanges take effect after user approval in chat.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- userAction: 'approved' if user approved the changes, 'skipped' if user rejected\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.\nTo discover the full set of tools that are available for each connection before activating them call get_details_for_connections.\n\nIf your connection has an associated skills file you MUST read and follow the instructions in the skills file before using any tools from that connection.",
      inputSchema: z.object({
        connections: z.array(
          z.object({
            connectionId: z
              .string()
              .describe(
                "The connectionId to activate or deactivate tools for. Must be a valid connectionId from the user's existing connections.",
              ),
            activate: z
              .array(z.string())
              .describe(
                "Tool names to activate from this connection. Always verify exact tool names before activating them.",
              ),
            deactivate: z
              .array(z.string())
              .describe("Tool names to deactivate from this connection."),
          }),
        ),
      }),
      execute: async ({ connections: connectionRequests }) => {
        const composio = getComposio();
        const results = [];

        for (const req of connectionRequests) {
          const conn = await getConnectionById(
            supabase,
            clientId,
            req.connectionId,
          );

          if (!conn) {
            results.push({
              connectionId: req.connectionId,
              error: "Connection not found.",
            });
            continue;
          }

          const rawTools = await composio.tools.getRawComposioTools({
            toolkits: [conn.toolkit_slug],
          });
          const allToolSlugs = new Set(rawTools.map((t) => t.slug));

          const invalidActivate = req.activate.filter(
            (t) => !allToolSlugs.has(t),
          );
          const invalidDeactivate = req.deactivate.filter(
            (t) => !allToolSlugs.has(t),
          );

          if (invalidActivate.length > 0 || invalidDeactivate.length > 0) {
            results.push({
              connectionId: req.connectionId,
              error: `Unknown tools: ${[...invalidActivate, ...invalidDeactivate].join(", ")}`,
            });
            continue;
          }

          const currentActivated = new Set(conn.activated_tools);
          for (const t of req.activate) currentActivated.add(t);
          for (const t of req.deactivate) currentActivated.delete(t);
          const newActivatedArray = Array.from(currentActivated);

          await updateConnectionActivatedTools(
            supabase,
            clientId,
            conn.id,
            newActivatedArray,
          );

          const newActivatedSet = new Set(newActivatedArray);
          results.push({
            connectionId: conn.id,
            userAction: "approved" as const,
            tools: {
              activated: rawTools
                .filter((t) => newActivatedSet.has(t.slug))
                .map((t) => t.slug),
              deactivated: rawTools
                .filter((t) => !newActivatedSet.has(t.slug))
                .map((t) => t.slug),
            },
            // Finding 11: Only hint at skill file on first activation (0 → N), and
            // explicitly note that not all toolkits have one (Tasklet: "only APIs with quirks").
            // Finding 13: Uses conn.id (not toolkit_slug) to match PR 26e's getConnectionSkillPath.
            skills:
              conn.activated_tools.length === 0 && newActivatedArray.length > 0
                ? `Check for a connection skill file at: skills/connections/${conn.id}/SKILL.md — not all connections have one.`
                : undefined,
          });
        }

        return { success: true, connections: results };
      },
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/manage-tools.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/manage-tools.ts src/lib/runner/tools/connections/__tests__/manage-tools.test.ts
git commit -m "feat(pr26d): manage_activated_tools_for_connections with per-tool activation"
```

---

## Task 4: `reauthorize_connection` tool

**Files:**
- Create: `src/lib/runner/tools/connections/reauthorize-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts`

**Tasklet spec:** 23-reauthorize_connection.md — re-auth existing connection, cannot change account.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts`:

```typescript
/**
 * Tests for reauthorize_connection tool.
 * @module lib/runner/tools/connections/__tests__/reauthorize-connection
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));
vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: vi.fn(),
  updateConnectionStatus: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import {
  getConnectionById,
  updateConnectionStatus,
} from "@/lib/connections/queries";

import { createReauthorizeConnectionTool } from "../reauthorize-connection";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const MOCK_CONNECTION = {
  id: "conn-1",
  client_id: CLIENT_ID,
  composio_connected_account_id: "composio-1",
  toolkit_slug: "gmail",
  display_name: "Gmail",
  account_identifier: "user@gmail.com",
  status: "error",
  activated_tools: ["GMAIL_SEND_EMAIL"],
  tool_count: 45,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

function createMockSupabase() {
  return {} as never;
}

describe("reauthorize_connection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refresh succeeds: returns reauthorized status and updates to active", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        refresh: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(updateConnectionStatus).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createReauthorizeConnectionTool(supabase, CLIENT_ID);
    const result = await tools.reauthorize_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("reauthorized");
    expect(updateConnectionStatus).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
      "active",
    );
  });

  it("refresh fails: returns pending_reauth with redirectUrl (Finding 9)", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        // Finding 9: First refresh (silent) rejects, second refresh (with redirectUrl) resolves.
        // Both use the SAME connected account — never initiateOAuthFlow.
        refresh: vi.fn()
          .mockRejectedValueOnce(new Error("Token expired"))
          .mockResolvedValueOnce({
            redirect_url: "https://composio.dev/oauth/reauth",
          }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(updateConnectionStatus).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createReauthorizeConnectionTool(supabase, CLIENT_ID);
    const result = await tools.reauthorize_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("pending_reauth");
    expect(result.redirectUrl).toBe("https://composio.dev/oauth/reauth");
    // Verify refresh was called twice — once silent, once with redirectUrl
    expect(mockComposio.connectedAccounts.refresh).toHaveBeenCalledTimes(2);
    expect(mockComposio.connectedAccounts.refresh).toHaveBeenLastCalledWith(
      "composio-1",
      expect.objectContaining({ redirectUrl: expect.any(String) }),
    );
  });

  it("marks connection as pending during re-auth (Finding 9)", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        refresh: vi.fn()
          .mockRejectedValueOnce(new Error("Token expired"))
          .mockResolvedValueOnce({
            redirect_url: "https://composio.dev/oauth/reauth",
          }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(updateConnectionStatus).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createReauthorizeConnectionTool(supabase, CLIENT_ID);
    await tools.reauthorize_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(updateConnectionStatus).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
      "pending",
    );
  });

  it("connection not found returns error", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(null);

    const supabase = createMockSupabase();
    const tools = createReauthorizeConnectionTool(supabase, CLIENT_ID);
    const result = await tools.reauthorize_connection.execute(
      { connectionId: "conn-999" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("pending connection returns error (cannot re-auth what has not been auth'd)", async () => {
    const pendingConn = { ...MOCK_CONNECTION, status: "pending" };
    vi.mocked(getConnectionById).mockResolvedValue(pendingConn as never);

    const supabase = createMockSupabase();
    const tools = createReauthorizeConnectionTool(supabase, CLIENT_ID);
    const result = await tools.reauthorize_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("pending");
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts
```
Expected: FAIL — `../reauthorize-connection` module does not exist.

### Step 3: Implement `createReauthorizeConnectionTool`

Create `src/lib/runner/tools/connections/reauthorize-connection.ts`:

```typescript
/**
 * reauthorize_connection tool — re-auth existing connection.
 * Tasklet spec: 23-reauthorize_connection.md
 * v1: tries credential refresh first, falls back to redirect-based re-auth via
 * refresh(id, { redirectUrl }). Never uses initiateOAuthFlow (Finding 9).
 * @module lib/runner/tools/connections/reauthorize-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import {
  getConnectionById,
  updateConnectionStatus,
} from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the reauthorize_connection tool.
 * Tries credential refresh first (no user interaction). Falls back to redirect-based
 * re-auth using the same Composio connected account (Finding 9 — never initiateOAuthFlow).
 */
export function createReauthorizeConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    reauthorize_connection: tool({
      description:
        "Re-authorizes an existing connection that has expired or needs new permissions.\nAttempts credential refresh first. If refresh fails, returns a re-authorization URL for the user.\n\nUse this tool if and only if there were authorization errors with a connection or the user explicitly asks you to.\nThe connection must already exist in the user's account.\nRe-authorizing cannot change which account the connection is logged into in the external service.",
      inputSchema: z.object({
        connectionId: z
          .string()
          .describe(
            "The connectionId to reauthorize. This must be a valid connectionId from the user's existing connections.",
          ),
      }),
      execute: async ({ connectionId }) => {
        const conn = await getConnectionById(supabase, clientId, connectionId);

        if (!conn) {
          return { success: false, error: "Connection not found." };
        }
        if (conn.status === "pending") {
          return {
            success: false,
            error:
              "Connection is still pending initial authorization.",
          };
        }

        const composio = getComposio();

        try {
          await composio.connectedAccounts.refresh(
            conn.composio_connected_account_id,
          );
          const refreshed = await composio.connectedAccounts.get(
            conn.composio_connected_account_id,
          );

          if (refreshed.status === "ACTIVE") {
            await updateConnectionStatus(
              supabase,
              clientId,
              connectionId,
              "active",
            );
            return {
              success: true,
              connectionId: conn.id,
              status: "reauthorized" as const,
              message: "Connection credentials refreshed successfully.",
            };
          }
        } catch {
          // Silent refresh failed, fall through to redirect-based re-auth
        }

        // Finding 9: Use refresh with redirectUrl — re-auths the SAME connected account.
        // Never use initiateOAuthFlow here (that creates a NEW Composio account).
        // Finding 8: process.env — tool functions have no request context.
        const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/callback`;
        const refreshResult = await composio.connectedAccounts.refresh(
          conn.composio_connected_account_id,
          { redirectUrl: callbackUrl },
        );

        await updateConnectionStatus(
          supabase,
          clientId,
          connectionId,
          "pending",
        );

        return {
          success: true,
          connectionId: conn.id,
          status: "pending_reauth" as const,
          redirectUrl: refreshResult.redirect_url,
          message:
            "Send this re-authorization link to the user. The connection account cannot change.",
        };
      },
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/reauthorize-connection.ts src/lib/runner/tools/connections/__tests__/reauthorize-connection.test.ts
git commit -m "feat(pr26d): reauthorize_connection tool with two-pass refresh strategy (Finding 9)"
```

---

## Task 5: `delete_connection` tool

**Files:**
- Create: `src/lib/runner/tools/connections/delete-connection.ts`
- Create: `src/lib/runner/tools/connections/__tests__/delete-connection.test.ts`

**Tasklet spec:** 24-delete_connection.md — destructive delete with confirmation. WARNING about not confusing with deactivation.

### Step 1: Write the failing test

Create `src/lib/runner/tools/connections/__tests__/delete-connection.test.ts`:

```typescript
/**
 * Tests for delete_connection tool.
 * @module lib/runner/tools/connections/__tests__/delete-connection
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

vi.mock("@/lib/connections/queries", () => ({
  getConnectionById: vi.fn(),
  deleteConnection: vi.fn(),
}));

import { getComposio } from "@/lib/composio/client";
import {
  deleteConnection,
  getConnectionById,
} from "@/lib/connections/queries";

import { createDeleteConnectionTool } from "../delete-connection";

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
  tool_count: 45,
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T00:00:00.000Z",
};

function createMockSupabase() {
  return {} as never;
}

describe("delete_connection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes both Composio account and local row", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(deleteConnection).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createDeleteConnectionTool(supabase, CLIENT_ID);
    const result = await tools.delete_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("gmail");
    expect(mockComposio.connectedAccounts.delete).toHaveBeenCalledWith(
      "composio-1",
    );
    expect(deleteConnection).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
    );
  });

  it("still deletes local row when Composio delete fails", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        delete: vi.fn().mockRejectedValue(new Error("Composio timeout")),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(deleteConnection).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createDeleteConnectionTool(supabase, CLIENT_ID);
    const result = await tools.delete_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(deleteConnection).toHaveBeenCalledWith(
      supabase,
      CLIENT_ID,
      "conn-1",
    );
  });

  it("connection not found returns error", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(null);

    const supabase = createMockSupabase();
    const tools = createDeleteConnectionTool(supabase, CLIENT_ID);
    const result = await tools.delete_connection.execute(
      { connectionId: "conn-999" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns deleted connection toolkit slug in message", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(MOCK_CONNECTION as never);
    const mockComposio = {
      connectedAccounts: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);
    vi.mocked(deleteConnection).mockResolvedValue(undefined);

    const supabase = createMockSupabase();
    const tools = createDeleteConnectionTool(supabase, CLIENT_ID);
    const result = await tools.delete_connection.execute(
      { connectionId: "conn-1" },
      { toolCallId: "test", messages: [] },
    );

    expect(result.message).toContain("gmail");
    expect(result.message).toContain("permanently deleted");
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/delete-connection.test.ts
```
Expected: FAIL — `../delete-connection` module does not exist.

### Step 3: Implement `createDeleteConnectionTool`

Create `src/lib/runner/tools/connections/delete-connection.ts`:

```typescript
/**
 * delete_connection tool — permanently deletes a connection.
 * Tasklet spec: 24-delete_connection.md
 * v1: chat-based confirmation (user confirms before agent calls tool).
 * @module lib/runner/tools/connections/delete-connection
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getComposio } from "@/lib/composio/client";
import {
  deleteConnection,
  getConnectionById,
} from "@/lib/connections/queries";
import type { Database } from "@/types/database";

/**
 * Creates the delete_connection tool.
 * WARNING in description about not confusing delete with deactivation.
 */
export function createDeleteConnectionTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    delete_connection: tool({
      description:
        'PERMANENTLY DELETES a connection from the user\'s account. This destroys the stored credentials and cannot be undone.\n\nWARNING: This is a destructive action. Only use when the user explicitly wants to DELETE the connection itself (e.g., "delete this connection", "remove from my account").\nDO NOT use this tool if the user wants to remove or deactivate tools from a connection (e.g., "remove {connection name}") → use manage_activated_tools_for_connections instead',
      inputSchema: z.object({
        connectionId: z
          .string()
          .describe(
            "The connectionId to delete. Must be a valid connectionId from the user's existing connections.",
          ),
      }),
      execute: async ({ connectionId }) => {
        const conn = await getConnectionById(supabase, clientId, connectionId);

        if (!conn) {
          return { success: false, error: "Connection not found." };
        }

        const composio = getComposio();

        // Finding 7: If Composio deletion fails, we still delete the local row.
        // This can leave an orphaned remote account. For v1, this is the better UX:
        // the user sees a clean local state. The alternative (keeping both) leaves
        // a broken connection the user can't fix. TODO: add a reconciliation job
        // or admin tool to clean up orphaned Composio accounts post-v1.
        try {
          await composio.connectedAccounts.delete(
            conn.composio_connected_account_id,
          );
        } catch (error) {
          console.error(
            "[delete_connection] Failed to delete Composio account:",
            error,
          );
        }

        await deleteConnection(supabase, clientId, connectionId);

        return {
          success: true,
          connectionId: conn.id,
          message: `Connection to ${conn.toolkit_slug} permanently deleted.`,
        };
      },
    }),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/delete-connection.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/delete-connection.ts src/lib/runner/tools/connections/__tests__/delete-connection.test.ts
git commit -m "feat(pr26d): delete_connection tool"
```

---

## Task 6: Wire mutation tools into barrel

**Files:**
- Modify: `src/lib/runner/tools/connections/index.ts`
- Modify: `src/lib/runner/tools/connections/__tests__/index.test.ts`

### Step 1: Update the barrel test to expect 8 tools with mutations enabled

Update the test in `src/lib/runner/tools/connections/__tests__/index.test.ts`:

Replace the test that currently says "returns 4 tools when mutations enabled (mutation tools not yet added)" with:

```typescript
  it("returns all 8 tools when mutations enabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "create_new_connections",
      "delete_connection",
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "manage_activated_tools_for_connections",
      "reauthorize_connection",
      "search_for_integrations",
    ]);
  });
```

Also update the "defaults to allowMutations: true" test to verify 8 tools.

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/index.test.ts
```
Expected: FAIL — only 4 tools returned (mutation tools not yet wired).

### Step 3: Update the barrel implementation

Update `src/lib/runner/tools/connections/index.ts` to import and spread mutation tools:

```typescript
/**
 * Connection tool factory barrel for runner registration.
 * @module lib/runner/tools/connections
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createCreateConnectionTool } from "./create-connection";
import { createDeleteConnectionTool } from "./delete-connection";
import { createGetConnectionDetailsTool } from "./get-connection-details";
import { createGetIntegrationCapabilitiesTool } from "./get-integration-capabilities";
import { createListConnectionsTool } from "./list-connections";
import { createManageToolsTool } from "./manage-tools";
import { createReauthorizeConnectionTool } from "./reauthorize-connection";
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

  return {
    ...readTools,
    ...createCreateConnectionTool(supabase, clientId),
    ...createManageToolsTool(supabase, clientId),
    ...createReauthorizeConnectionTool(supabase, clientId),
    ...createDeleteConnectionTool(supabase, clientId),
  };
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/tools/connections/__tests__/index.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/connections/index.ts src/lib/runner/tools/connections/__tests__/index.test.ts
git commit -m "feat(pr26d): wire mutation tools into connection barrel"
```

---

## Task 7: Replace `loadComposioTools` with `loadActivatedConnectionTools` in runner

**Files:**
- Modify: `src/lib/runner/run-agent.ts`

### Context

Currently `run-agent.ts` loads ALL Composio tools for active toolkits:

```typescript
// Lines 10-11:
import { loadComposioTools } from "@/lib/composio";
import { getActiveToolkitSlugs } from "@/lib/connections/queries";

// Lines 150-157:
let composioTools: ToolSet = {};
try {
  const activeToolkits = await getActiveToolkitSlugs(supabase, clientId);
  composioTools = await loadComposioTools(clientId, activeToolkits);
} catch (error) {
  console.error("[composio] Failed to resolve active connections for runner.", error);
}
```

After this change, the runner loads only **activated** tools per connection, prefixed with connection ID:

```typescript
import { loadActivatedConnectionTools } from "@/lib/composio/activated-tools";
import { getActiveConnections } from "@/lib/connections/queries";

// Replace lines 150-157:
let composioTools: ToolSet = {};
try {
  const connections = await getActiveConnections(supabase, clientId);
  composioTools = await loadActivatedConnectionTools(clientId, connections);
} catch (error) {
  console.error("[composio] Failed to load activated connection tools for runner.", error);
}
```

**Behavioral change:** Tools previously appeared as `GMAIL_SEND_EMAIL`. Now they appear as `conn-abc__GMAIL_SEND_EMAIL`. This is the Tasklet connection-ID-prefixed tool model. Only explicitly activated tools are loaded (not all tools for a toolkit).

### Step 1: Update imports in `run-agent.ts`

Replace:
```typescript
import { loadComposioTools } from "@/lib/composio";
import { getActiveToolkitSlugs } from "@/lib/connections/queries";
```

With:
```typescript
import { loadActivatedConnectionTools } from "@/lib/composio/activated-tools";
import { getActiveConnections } from "@/lib/connections/queries";
```

### Step 2: Replace the Composio tool loading block

Replace lines 150-157:
```typescript
    let composioTools: ToolSet = {};

    try {
      const activeToolkits = await getActiveToolkitSlugs(supabase, clientId);
      composioTools = await loadComposioTools(clientId, activeToolkits);
    } catch (error) {
      console.error("[composio] Failed to resolve active connections for runner.", error);
    }
```

With:
```typescript
    let composioTools: ToolSet = {};

    try {
      const connections = await getActiveConnections(supabase, clientId);
      composioTools = await loadActivatedConnectionTools(clientId, connections);
    } catch (error) {
      console.error(
        "[composio] Failed to load activated connection tools for runner.",
        error,
      );
    }
```

### Step 3: Run existing runner tests to verify no regressions

Run:
```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: ALL PASS. The existing `run-agent.test.ts` mocks the tool loading and doesn't test specific Composio tool names, so the behavioral change (tool name prefixing) doesn't break tests.

### Step 4: Also wire `loadActivatedConnectionTools` into `run-autopilot.ts` (Finding 5)

> **Review finding (Finding 5):** Autopilot runs (e.g. trigger-fired background tasks) also need activated connection tools. Without this, autopilot can't use Gmail, Slack, etc. for scheduled notifications or triggered workflows. Confirmed by Tasklet reference: parent LLM hardcodes connection IDs into subagent instructions precisely because autopilot agents use connection tools.

In `src/lib/runner/run-autopilot.ts`, apply the same replacement:

Replace imports:
```typescript
// Before:
import { loadComposioTools } from "@/lib/composio";
import { getActiveToolkitSlugs } from "@/lib/connections/queries";

// After:
import { loadActivatedConnectionTools } from "@/lib/composio/activated-tools";
import { getActiveConnections } from "@/lib/connections/queries";
```

Replace the Composio tool loading block (same pattern as `run-agent.ts`):
```typescript
    let composioTools: ToolSet = {};

    try {
      const connections = await getActiveConnections(supabase, clientId);
      composioTools = await loadActivatedConnectionTools(clientId, connections);
    } catch (error) {
      console.error(
        "[composio] Failed to load activated connection tools for autopilot.",
        error,
      );
    }
```

### Step 5: Run existing runner and autopilot tests to verify no regressions

Run:
```bash
npx vitest run src/lib/runner/__tests__/
```
Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/run-autopilot.ts
git commit -m "feat(pr26d): replace loadComposioTools with per-connection activated tool loader in runner and autopilot"
```

---

## Verification Checklist

- [ ] Tool names match Tasklet exactly: `create_new_connections`, `manage_activated_tools_for_connections`, `reauthorize_connection`, `delete_connection`
- [ ] All tools use `inputSchema` (codebase convention — 29 existing uses, 0 uses of `parameters`)
- [ ] Tool descriptions are Tasklet-faithful (adapted for v1 where needed — no UI cards, redirect URLs)
- [ ] `create_new_connections` accepts all 4 types (integrations/mcp/direct_api/computer_use)
- [ ] `create_new_connections` — `integrations` type: calls `initiateOAuthFlow`, inserts pending row, returns `redirectUrl`
- [ ] `create_new_connections` — `integrations` type: uses `getActiveConnectionsByToolkit` (plural) and informs about existing connections but does NOT block creation (Finding 7)
- [ ] `create_new_connections` pre-populates `activated_tools` from `toolsToActivate` in pending row
- [ ] `create_new_connections` — `mcp`/`direct_api` types: return stub messages (Finding 12 — explicit v1 stubs, not placeholders)
- [ ] `create_new_connections` — `computer_use` type: returns not-available message
- [ ] `create_new_connections` returns `pending_auth` + `redirectUrl` (v1 deviation from Tasklet blocking pattern — Finding 6)
- [ ] Callback route finds pending row by `composio_connected_account_id` and updates to active
- [ ] Callback route populates `tool_count` and `account_identifier` on activation (Finding 4a: uses deprecated `data`/`params` bags, not `metadata`)
- [ ] Callback route preserves `activated_tools` from pending row (does not overwrite)
- [ ] Callback route falls back to `insertConnection` when no pending row exists (Finding 8 — not `upsertConnection`)
- [ ] `manage_activated_tools_for_connections` operates per-connection with activate/deactivate arrays
- [ ] `manage_activated_tools_for_connections` validates tool names against Composio tool list
- [ ] `manage_activated_tools_for_connections` returns Tasklet-shaped response (userAction, tools.activated, tools.deactivated, skills)
- [ ] `manage_activated_tools_for_connections` activation is local-only (`activated_tools` array); does not sync to Composio `toolAccessConfig` (Finding 10 — sufficient for v1)
- [ ] `manage_activated_tools_for_connections` skills pointer: only on first activation (0 → N), uses `conn.id` (not toolkit_slug — matches PR 26e's `getConnectionSkillPath`), notes "not all connections have one" (Finding 11 + 13)
- [ ] `reauthorize_connection` tries silent `refresh()` first, falls back to `refresh(id, { redirectUrl })` — never `initiateOAuthFlow` (Finding 9)
- [ ] `reauthorize_connection` preserves connection identity (no new row, same connected account ID)
- [ ] `reauthorize_connection` rejects pending connections
- [ ] `delete_connection` description includes Tasklet WARNING about not confusing with deactivation
- [ ] `delete_connection` deletes both Composio account and local row (Finding 7: local-first — if Composio delete fails, local row still removed; orphan cleanup deferred post-v1)
- [ ] `delete_connection` continues local delete if Composio delete fails
- [ ] Barrel returns all 8 tools when `allowMutations: true`
- [ ] Barrel returns only 4 read tools when `allowMutations: false`
- [ ] Runner (`run-agent.ts`) uses `loadActivatedConnectionTools` (not `loadComposioTools`)
- [ ] Autopilot (`run-autopilot.ts`) uses `loadActivatedConnectionTools` (not `loadComposioTools`) (Finding 5)
- [ ] Both runner and autopilot load only activated tools per connection with connection-ID prefix
- [ ] All tests pass: `npx vitest run src/lib/runner/tools/connections/__tests__/ app/api/connections/callback/__tests__/ src/lib/runner/__tests__/`
