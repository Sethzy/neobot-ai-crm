# PR 26b: Composio Helpers Implementation Plan

**PR:** PR 26b (sub-PR of PR 26: Connection tools)
**Decisions:** CONN-02, TOOL-04
**Goal:** Extract the OAuth initiation flow from PR 25's route into a reusable helper, create Composio catalog search/capabilities helpers, and build the connection-ID-prefixed activated tool loader. These are the SDK-level building blocks that the 8 connection tools (26c, 26d) consume.

**Architecture:** Three categories of Composio interaction: (1) OAuth flow extraction — proven logic from `app/api/connections/initiate/route.ts:55-71` into reusable `initiateOAuthFlow` helper. (2) Catalog search — `searchIntegrations` and `getToolkitCapabilities` for catalog-querying tools. (3) Activated tool loading — `loadActivatedConnectionTools` replaces `loadComposioTools` by loading only `activated_tools` per connection, prefixed with connection ID. Composio SDK type constraints are critical: `SearchOnlyParams = { search: string }` (no limit/toolkits), `ToolsOnlyParams = { tools: string[] }` (no other fields), `Tool.toolkit` is an OBJECT `{ slug, name, logo? }` not a string.

**Tech Stack:** Composio SDK (`@composio/core`, `@composio/vercel`), Vercel AI SDK (`ai` — `ToolSet` type), Vitest

---

## Relevant Files

### Create
- `src/lib/composio/connection-flow.ts`
- `src/lib/composio/__tests__/connection-flow.test.ts`
- `src/lib/composio/catalog.ts`
- `src/lib/composio/__tests__/catalog.test.ts`
- `src/lib/composio/activated-tools.ts`
- `src/lib/composio/__tests__/activated-tools.test.ts`

### Modify
- `app/api/connections/initiate/route.ts` — refactor to call `initiateOAuthFlow()`
- `src/lib/composio/index.ts` — add new exports

---

## Task 1: Extract shared OAuth initiation flow

**Files:**
- Create: `src/lib/composio/connection-flow.ts`
- Create: `src/lib/composio/__tests__/connection-flow.test.ts`

### Step 1: Write the failing test — `initiateOAuthFlow` returns redirect URL and connected account ID

Create `src/lib/composio/__tests__/connection-flow.test.ts`:

```typescript
/**
 * Tests for shared OAuth initiation flow helper.
 * @module lib/composio/__tests__/connection-flow
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import { initiateOAuthFlow } from "../connection-flow";

const MOCK_COMPOSIO_USER_ID = "client-123";
const MOCK_TOOLKIT_SLUG = "gmail";
const MOCK_CALLBACK_URL = "https://example.com/api/connections/callback";

function createMockComposio(overrides?: {
  authConfigItems?: Array<{ id: string; status: string }>;
  createAuthConfigId?: string;
  linkResult?: { redirectUrl?: string; id: string };
}) {
  const mockComposio = {
    authConfigs: {
      list: vi.fn().mockResolvedValue({
        items: overrides?.authConfigItems ?? [
          { id: "auth-config-existing", status: "ENABLED" },
        ],
      }),
      create: vi.fn().mockResolvedValue({
        id: overrides?.createAuthConfigId ?? "auth-config-new",
      }),
    },
    connectedAccounts: {
      link: vi.fn().mockResolvedValue(
        overrides?.linkResult ?? {
          redirectUrl: "https://composio.dev/oauth/redirect",
          id: "connected-account-456",
        },
      ),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("initiateOAuthFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns redirectUrl and connectedAccountId on success", async () => {
    createMockComposio();

    const result = await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(result).toEqual({
      redirectUrl: "https://composio.dev/oauth/redirect",
      connectedAccountId: "connected-account-456",
    });
  });

  it("reuses existing ENABLED auth config (does not create a new one)", async () => {
    const mock = createMockComposio({
      authConfigItems: [
        { id: "reusable-config", status: "ENABLED" },
        { id: "disabled-config", status: "DISABLED" },
      ],
    });

    await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(mock.authConfigs.create).not.toHaveBeenCalled();
    expect(mock.connectedAccounts.link).toHaveBeenCalledWith(
      MOCK_COMPOSIO_USER_ID,
      "reusable-config",
      { callbackUrl: MOCK_CALLBACK_URL },
    );
  });

  it("creates auth config when none exists", async () => {
    const mock = createMockComposio({
      authConfigItems: [],
      createAuthConfigId: "brand-new-config",
    });

    await initiateOAuthFlow({
      composioUserId: MOCK_COMPOSIO_USER_ID,
      toolkitSlug: MOCK_TOOLKIT_SLUG,
      callbackUrl: MOCK_CALLBACK_URL,
    });

    expect(mock.authConfigs.create).toHaveBeenCalledWith(MOCK_TOOLKIT_SLUG, {
      type: "use_composio_managed_auth",
      name: `${MOCK_TOOLKIT_SLUG} Auth Config`,
    });
    expect(mock.connectedAccounts.link).toHaveBeenCalledWith(
      MOCK_COMPOSIO_USER_ID,
      "brand-new-config",
      { callbackUrl: MOCK_CALLBACK_URL },
    );
  });

  it("throws when Composio returns no redirect URL", async () => {
    createMockComposio({
      linkResult: { redirectUrl: undefined, id: "connected-account-789" },
    });

    await expect(
      initiateOAuthFlow({
        composioUserId: MOCK_COMPOSIO_USER_ID,
        toolkitSlug: MOCK_TOOLKIT_SLUG,
        callbackUrl: MOCK_CALLBACK_URL,
      }),
    ).rejects.toThrow("Composio did not return a redirect URL.");
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/composio/__tests__/connection-flow.test.ts
```
Expected: FAIL — `../connection-flow` module does not exist.

### Step 3: Implement `initiateOAuthFlow`

Create `src/lib/composio/connection-flow.ts`:

```typescript
/**
 * Shared OAuth initiation flow for Composio connections.
 * Extracted from app/api/connections/initiate/route.ts for reuse by connection tools.
 * @module lib/composio/connection-flow
 */
import { getComposio } from "./client";

export interface InitiateOAuthFlowParams {
  composioUserId: string;
  toolkitSlug: string;
  callbackUrl: string;
}

export interface InitiateOAuthFlowResult {
  redirectUrl: string;
  connectedAccountId: string;
}

/**
 * Initiates an OAuth flow via Composio.
 * Reuses an existing ENABLED auth config if available, otherwise creates one.
 */
export async function initiateOAuthFlow(
  params: InitiateOAuthFlowParams,
): Promise<InitiateOAuthFlowResult> {
  const composio = getComposio();
  const authConfigs = await composio.authConfigs.list({
    toolkit: params.toolkitSlug,
    isComposioManaged: true,
  });
  const reusableAuthConfig = authConfigs.items.find(
    (ac) => ac.status === "ENABLED",
  );
  const authConfigId =
    reusableAuthConfig?.id ??
    (
      await composio.authConfigs.create(params.toolkitSlug, {
        type: "use_composio_managed_auth",
        name: `${params.toolkitSlug} Auth Config`,
      })
    ).id;

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

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/composio/__tests__/connection-flow.test.ts
```
Expected: ALL PASS.

### Step 5: Refactor `initiate/route.ts` to use the helper

In `app/api/connections/initiate/route.ts`, replace the inline Composio SDK calls (lines 55-77) with a call to `initiateOAuthFlow`:

```typescript
// Before (lines 9-10):
import { getComposio } from "@/lib/composio";
import { getActiveConnectionByToolkit } from "@/lib/connections/queries";

// After:
import { initiateOAuthFlow } from "@/lib/composio/connection-flow";
// Note: getActiveConnectionByToolkit import removed — pending-only guard uses inline query (inherited from PR 26a)
```

Replace the try block body (lines 55-77) with:

```typescript
    const { redirectUrl } = await initiateOAuthFlow({
      composioUserId: clientId,
      toolkitSlug: toolkit,
      callbackUrl: new URL("/api/connections/callback", request.url).toString(),
    });

    return Response.json({ redirectUrl });
```

> **Review finding (Finding 3):** PR 26a already relaxes the duplicate guard to pending-only (blocks double-initiation but allows multi-connection). PR 26b must NOT reintroduce the old 409 "Service already connected" guard — that contradicts multi-connection support. The refactored try block inherits PR 26a's pending-only guard as-is and only replaces inline Composio SDK calls with `initiateOAuthFlow`.

The full updated try block becomes:

```typescript
  try {
    const clientId = await resolveClientId(supabase, userId);
    const { toolkit } = bodyResult.data;

    // Pending-only guard inherited from PR 26a — blocks double-initiation,
    // NOT multi-connection. Do NOT add an active-connection 409 guard here.
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

    const { redirectUrl } = await initiateOAuthFlow({
      composioUserId: clientId,
      toolkitSlug: toolkit,
      callbackUrl: new URL("/api/connections/callback", request.url).toString(),
    });

    return Response.json({ redirectUrl });
  } catch (error) {
    console.error("Failed to initiate Composio connection.", error);
    return jsonError("Failed to initiate connection.", 500);
  }
```

Remove the `getActiveConnectionByToolkit` import — it is no longer used in this file after this refactor.

### Step 6: Run all composio tests to verify no regressions

Run:
```bash
npx vitest run src/lib/composio/__tests__/
```
Expected: ALL PASS.

### Step 7: Commit

```bash
git add src/lib/composio/connection-flow.ts src/lib/composio/__tests__/connection-flow.test.ts app/api/connections/initiate/route.ts
git commit -m "feat(pr26b): extract shared OAuth initiation flow from PR 25 route"
```

---

## Task 2: Composio catalog helpers

**Files:**
- Create: `src/lib/composio/catalog.ts`
- Create: `src/lib/composio/__tests__/catalog.test.ts`

Two helpers for the catalog-querying tools: `searchIntegrations` (uses `SearchOnlyParams = { search: string }` — NO limit, NO toolkits) and `getToolkitCapabilities` (uses `ToolkitsOnlyParams = { toolkits: [slug] }`).

**CRITICAL SDK constraint:** `Tool.toolkit` is an OBJECT `{ slug: string; name: string; logo?: string }`, NOT a string. Access via `tool.toolkit?.slug`.

### Step 1: Write the failing test — `searchIntegrations` returns deduped results with correct shape

Create `src/lib/composio/__tests__/catalog.test.ts`:

```typescript
/**
 * Tests for Composio catalog search and capabilities helpers.
 * @module lib/composio/__tests__/catalog
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import {
  getToolkitCapabilities,
  searchIntegrations,
} from "../catalog";

/** Tool.toolkit is an OBJECT { slug, name, logo? }, NOT a string. */
function createMockTool(
  slug: string,
  toolkitSlug: string,
  toolkitName: string,
) {
  return {
    slug,
    name: slug.replace(/_/g, " "),
    description: `Description for ${slug}`,
    tags: ["test"],
    toolkit: { slug: toolkitSlug, name: toolkitName },
  };
}

function createMockComposio(toolsByCall: Array<Array<ReturnType<typeof createMockTool>>>) {
  let callIndex = 0;
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockImplementation(() => {
        const result = toolsByCall[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
      }),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("searchIntegrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns deduped integrations with correct shape", async () => {
    createMockComposio([
      [
        createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail"),
        createMockTool("GMAIL_READ_EMAIL", "gmail", "Gmail"),
        createMockTool("SLACK_SEND_MESSAGE", "slack", "Slack"),
      ],
    ]);

    const result = await searchIntegrations("email");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      integrationId: "gmail",
      name: "Gmail",
      description: "Description for GMAIL_SEND_EMAIL",
      quality: "UNKNOWN",
      builder: "Composio",
      context: "",
    });
    expect(result[1]).toEqual({
      integrationId: "slack",
      name: "Slack",
      description: "Description for SLACK_SEND_MESSAGE",
      quality: "UNKNOWN",
      builder: "Composio",
      context: "",
    });
  });

  it("uses SearchOnlyParams — passes only { search } to SDK", async () => {
    const mock = createMockComposio([[]]);

    await searchIntegrations("calendar");

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      search: "calendar",
    });
  });

  it("returns empty array when no results", async () => {
    createMockComposio([[]]);

    const result = await searchIntegrations("nonexistent");

    expect(result).toEqual([]);
  });

  it("handles tools with no toolkit gracefully", async () => {
    const toolWithoutToolkit = {
      slug: "ORPHAN_TOOL",
      name: "Orphan",
      description: "No toolkit",
      tags: [],
      toolkit: undefined,
    };
    createMockComposio([[toolWithoutToolkit as never]]);

    const result = await searchIntegrations("orphan");

    expect(result).toEqual([]);
  });
});

describe("getToolkitCapabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tools array for each integration", async () => {
    createMockComposio([
      [
        createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail"),
        createMockTool("GMAIL_READ_EMAIL", "gmail", "Gmail"),
      ],
    ]);

    const result = await getToolkitCapabilities(["gmail"]);

    expect(result).toHaveLength(1);
    expect(result[0].integrationId).toBe("gmail");
    expect(result[0].name).toBe("Gmail");
    expect(result[0].tools).toHaveLength(2);
    expect(result[0].tools[0]).toEqual({
      slug: "GMAIL_SEND_EMAIL",
      name: "GMAIL SEND EMAIL",
      description: "Description for GMAIL_SEND_EMAIL",
      tags: ["test"],
    });
  });

  it("uses ToolkitsOnlyParams — passes { toolkits: [slug] } to SDK", async () => {
    const mock = createMockComposio([[]]);

    await getToolkitCapabilities(["gmail"]);

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["gmail"],
    });
  });

  it("returns quality=UNKNOWN and notes=empty (v1 defaults)", async () => {
    createMockComposio([
      [createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail")],
    ]);

    const result = await getToolkitCapabilities(["gmail"]);

    expect(result[0].quality).toBe("UNKNOWN");
    expect(result[0].notes).toBe("");
  });

  it("handles multiple toolkit slugs", async () => {
    createMockComposio([
      [createMockTool("GMAIL_SEND_EMAIL", "gmail", "Gmail")],
      [createMockTool("SLACK_SEND_MESSAGE", "slack", "Slack")],
    ]);

    const result = await getToolkitCapabilities(["gmail", "slack"]);

    expect(result).toHaveLength(2);
    expect(result[0].integrationId).toBe("gmail");
    expect(result[1].integrationId).toBe("slack");
  });

  it("returns empty array for empty input", async () => {
    createMockComposio([]);

    const result = await getToolkitCapabilities([]);

    expect(result).toEqual([]);
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/composio/__tests__/catalog.test.ts
```
Expected: FAIL — `../catalog` module does not exist.

### Step 3: Implement `searchIntegrations` and `getToolkitCapabilities`

Create `src/lib/composio/catalog.ts`:

```typescript
/**
 * Composio catalog search and toolkit capabilities helpers.
 * Used by search_for_integrations and get_integrations_capabilities tools.
 * @module lib/composio/catalog
 */
import { getComposio } from "./client";

export interface CatalogIntegration {
  integrationId: string;
  name: string;
  description: string;
  /** v1: always "UNKNOWN" — Composio does not expose quality scores. */
  quality: string;
  /** v1: always "Composio". */
  builder: string;
  /** v1: always "". */
  context: string;
}

/**
 * Searches the Composio integration catalog by keyword.
 * Uses SearchOnlyParams: `{ search: string }` — NO limit, NO toolkits.
 * Deduplicates results by toolkit slug (multiple tools per toolkit).
 *
 * CRITICAL: `Tool.toolkit` is an OBJECT `{ slug, name, logo? }`, NOT a string.
 */
export async function searchIntegrations(
  keyword: string,
): Promise<CatalogIntegration[]> {
  const composio = getComposio();
  const tools = await composio.tools.getRawComposioTools({ search: keyword });

  const seenToolkits = new Map<string, CatalogIntegration>();

  for (const tool of tools) {
    const slug = tool.toolkit?.slug;

    if (!slug || seenToolkits.has(slug)) continue;

    seenToolkits.set(slug, {
      integrationId: slug,
      name: tool.toolkit?.name ?? slug,
      description: tool.description ?? "",
      quality: "UNKNOWN",
      builder: "Composio",
      context: "",
    });
  }

  return Array.from(seenToolkits.values());
}

export interface ToolkitCapability {
  integrationId: string;
  name: string;
  description: string;
  /** v1: always "UNKNOWN". */
  quality: string;
  /** v1: always "". */
  notes: string;
  tools: Array<{
    slug: string;
    name: string;
    description: string;
    tags: string[];
  }>;
}

/**
 * Returns full capabilities (tool list + metadata) for each toolkit slug.
 * Uses ToolkitsOnlyParams: `{ toolkits: [slug] }`.
 *
 * CRITICAL: `Tool.toolkit` is an OBJECT `{ slug, name, logo? }`, NOT a string.
 */
export async function getToolkitCapabilities(
  toolkitSlugs: string[],
): Promise<ToolkitCapability[]> {
  const composio = getComposio();
  const results: ToolkitCapability[] = [];

  for (const slug of toolkitSlugs) {
    const tools = await composio.tools.getRawComposioTools({
      toolkits: [slug],
    });

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

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/composio/__tests__/catalog.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/composio/catalog.ts src/lib/composio/__tests__/catalog.test.ts
git commit -m "feat(pr26b): Composio catalog helpers with correct SDK types"
```

---

## Task 3: Connection-ID-prefixed activated tool loader

**Files:**
- Create: `src/lib/composio/activated-tools.ts`
- Create: `src/lib/composio/__tests__/activated-tools.test.ts`

Replaces `loadComposioTools` behavior. Loads only the `activated_tools` for each connection and prefixes tool names with connection ID (`{connectionId}__TOOL_SLUG`). Uses `ToolsOnlyParams = { tools: string[] }` — NO other fields.

### Step 1: Write the failing test — activated tool loader

Create `src/lib/composio/__tests__/activated-tools.test.ts`:

```typescript
/**
 * Tests for connection-ID-prefixed activated tool loader.
 * @module lib/composio/__tests__/activated-tools
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  getComposio: vi.fn(),
}));

import { getComposio } from "../client";

import { loadActivatedConnectionTools } from "../activated-tools";

import type { ConnectionRow } from "@/lib/connections/schemas";

const COMPOSIO_USER_ID = "client-123";

function createMockConnection(
  overrides: Partial<ConnectionRow> & { id: string; toolkit_slug: string },
): ConnectionRow {
  return {
    client_id: "client-123",
    composio_connected_account_id: `composio-${overrides.id}`,
    display_name: null,
    account_identifier: null,
    status: "active",
    activated_tools: [],
    tool_count: 0,
    created_at: "2026-03-07T00:00:00.000Z",
    updated_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Creates a mock Composio client with `tools.getRawComposioTools` and `tools.execute`.
 * Finding 2: Uses `getRawComposioTools` (returns raw `Tool[]`) not `tools.get` (provider-wrapped).
 * `tools.execute` records calls for assertion and returns a success stub.
 *
 * Each entry in `toolsByCall` is an array of raw tool objects with `slug`,
 * `description`, and `inputParameters` — matching the SDK's `Tool` shape.
 */
function createMockComposio(toolsByCall: Array<Array<{ slug: string; description?: string; inputParameters?: Record<string, unknown> }>>) {
  let callIndex = 0;
  const mockComposio = {
    tools: {
      getRawComposioTools: vi.fn().mockImplementation(() => {
        const result = toolsByCall[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
      }),
      execute: vi.fn().mockResolvedValue({ success: true }),
    },
  };

  vi.mocked(getComposio).mockReturnValue(mockComposio as never);
  return mockComposio;
}

describe("loadActivatedConnectionTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty ToolSet when no connections have activated tools", async () => {
    const connections = [
      createMockConnection({
        id: "conn-1",
        toolkit_slug: "gmail",
        activated_tools: [],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(result).toEqual({});
  });

  it("returns empty ToolSet when all connections are inactive", async () => {
    const connections = [
      createMockConnection({
        id: "conn-1",
        toolkit_slug: "gmail",
        status: "inactive",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(result).toEqual({});
  });

  it("prefixes tool names with connection ID", async () => {
    createMockComposio([
      [
        { slug: "GMAIL_SEND_EMAIL", description: "Send email", inputParameters: { type: "object", properties: { to: { type: "string" } } } },
        { slug: "GMAIL_READ_EMAIL", description: "Read email", inputParameters: { type: "object", properties: {} } },
      ],
    ]);

    const connections = [
      createMockConnection({
        id: "conn-abc",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(Object.keys(result).sort()).toEqual([
      "conn-abc__GMAIL_READ_EMAIL",
      "conn-abc__GMAIL_SEND_EMAIL",
    ]);
  });

  it("loads tools for multiple connections, each with own prefix", async () => {
    createMockComposio([
      [{ slug: "GMAIL_SEND_EMAIL", description: "Send email", inputParameters: { type: "object", properties: {} } }],
      [{ slug: "SLACK_SEND_MESSAGE", description: "Send Slack message", inputParameters: { type: "object", properties: {} } }],
    ]);

    const connections = [
      createMockConnection({
        id: "conn-abc",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
      createMockConnection({
        id: "conn-def",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(Object.keys(result).sort()).toEqual([
      "conn-abc__GMAIL_SEND_EMAIL",
      "conn-def__SLACK_SEND_MESSAGE",
    ]);
  });

  it("uses ToolsOnlyParams — passes { tools: [...] } to SDK for schema fetch", async () => {
    const mock = createMockComposio([
      [{ slug: "GMAIL_SEND_EMAIL", description: "Send email", inputParameters: { type: "object", properties: {} } }],
    ]);

    const connections = [
      createMockConnection({
        id: "conn-abc",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ];

    await loadActivatedConnectionTools(COMPOSIO_USER_ID, connections);

    expect(mock.tools.getRawComposioTools).toHaveBeenCalledWith({
      tools: ["GMAIL_SEND_EMAIL"],
    });
  });

  it("binds connectedAccountId when executing tools (Finding 4)", async () => {
    const mock = createMockComposio([
      [{ slug: "GMAIL_SEND_EMAIL", description: "Send email", inputParameters: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to"] } }],
    ]);

    const connections = [
      createMockConnection({
        id: "conn-abc",
        toolkit_slug: "gmail",
        composio_connected_account_id: "ca_personal_gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ];

    const result = await loadActivatedConnectionTools(COMPOSIO_USER_ID, connections);

    // Execute the wrapped tool — it should call composio.tools.execute with connectedAccountId
    const wrappedTool = result["conn-abc__GMAIL_SEND_EMAIL"];
    expect(wrappedTool).toBeDefined();

    // Invoke the tool's execute function
    await (wrappedTool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute({
      to: "user@example.com",
      body: "Hello",
    });

    expect(mock.tools.execute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
      connectedAccountId: "ca_personal_gmail",
      arguments: { to: "user@example.com", body: "Hello" },
      dangerouslySkipVersionCheck: true,
    });
  });

  it("handles Composio error for one connection gracefully (partial results)", async () => {
    let callIndex = 0;
    const mockComposio = {
      tools: {
        getRawComposioTools: vi.fn().mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) {
            return Promise.reject(new Error("Composio timeout"));
          }
          return Promise.resolve([
            { slug: "SLACK_SEND_MESSAGE", description: "Send Slack message", inputParameters: { type: "object", properties: {} } },
          ]);
        }),
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    vi.mocked(getComposio).mockReturnValue(mockComposio as never);

    const connections = [
      createMockConnection({
        id: "conn-abc",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
      createMockConnection({
        id: "conn-def",
        toolkit_slug: "slack",
        activated_tools: ["SLACK_SEND_MESSAGE"],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(Object.keys(result)).toEqual(["conn-def__SLACK_SEND_MESSAGE"]);
  });

  it("skips pending connections", async () => {
    const connections = [
      createMockConnection({
        id: "conn-pending",
        toolkit_slug: "gmail",
        status: "pending",
        activated_tools: ["GMAIL_SEND_EMAIL"],
      }),
    ];

    const result = await loadActivatedConnectionTools(
      COMPOSIO_USER_ID,
      connections,
    );

    expect(result).toEqual({});
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
```
Expected: FAIL — `../activated-tools` module does not exist.

### Step 3: Implement `loadActivatedConnectionTools`

> **Review finding (Finding 4):** The `@composio/vercel` wrapper's `wrapTool()` calls `executeTool(slug, input)` without passing `connectedAccountId` — meaning tool execution always hits the "most recently connected account" default. For multi-connection support, we MUST bypass the Vercel wrapper and call `composio.tools.execute(slug, { connectedAccountId, arguments })` directly.
>
> **Confirmed via Composio SDK source:** `ToolExecuteParamsSchema` includes `connectedAccountId: z.string().optional()`. The `tools.execute()` method accepts it in the body.

Create `src/lib/composio/activated-tools.ts`:

```typescript
/**
 * Connection-ID-prefixed activated tool loader.
 * Replaces loadComposioTools by loading only activated tools per connection.
 *
 * IMPORTANT: We bypass @composio/vercel's wrapTool() because it does NOT
 * pass connectedAccountId to tool execution. Instead, we:
 * 1. Fetch tool definitions (schema only) via composio.tools.get()
 * 2. Create custom AI SDK tool wrappers that call composio.tools.execute()
 *    with explicit connectedAccountId binding per connection.
 *
 * @module lib/composio/activated-tools
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { ConnectionRow } from "@/lib/connections/schemas";

import { getComposio } from "./client";

/**
 * Converts a Composio JSON Schema parameter definition into a Zod schema
 * for use with AI SDK's `tool()`. Handles the common JSON Schema types.
 */
function jsonSchemaToZod(jsonSchema: Record<string, unknown>): z.ZodType {
  const properties = (jsonSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (jsonSchema.required ?? []) as string[];

  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let fieldSchema: z.ZodType;
    switch (prop.type) {
      case "string":
        fieldSchema = z.string();
        break;
      case "number":
      case "integer":
        fieldSchema = z.number();
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "array":
        fieldSchema = z.array(z.unknown());
        break;
      default:
        fieldSchema = z.unknown();
    }
    if (prop.description) {
      fieldSchema = fieldSchema.describe(prop.description as string);
    }
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }
    shape[key] = fieldSchema;
  }
  return z.object(shape);
}

/**
 * Loads only the activated tools for each connection, prefixed with connection ID.
 * Each tool wrapper calls `composio.tools.execute()` with explicit `connectedAccountId`
 * to ensure execution is bound to the correct OAuth account.
 *
 * Finding 2: Uses `getRawComposioTools()` (returns raw `Tool[]`) not `tools.get()` (returns
 * provider-wrapped `ToolSet`). Raw tools have `inputParameters` and `slug` directly.
 * Finding 3: Passes `dangerouslySkipVersionCheck: true` to `tools.execute()` — without
 * `toolkitVersions` in client config, manual execution throws `ComposioToolVersionRequiredError`.
 *
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
      // Step 1: Fetch raw tool definitions (schemas only)
      // Finding 2: Use getRawComposioTools (returns Tool[]) not tools.get (returns provider-wrapped ToolSet).
      const rawTools = await composio.tools.getRawComposioTools({
        tools: conn.activated_tools,
      });

      // Step 2: Create custom wrappers that bind connectedAccountId
      for (const rawTool of rawTools) {
        const inputSchema = jsonSchemaToZod(rawTool.inputParameters ?? {});

        allTools[`${conn.id}__${rawTool.slug}`] = tool({
          description: rawTool.description ?? rawTool.slug,
          // Finding 6: AI SDK v6 uses `inputSchema`, not `parameters`.
          inputSchema,
          execute: async (args) => {
            // Finding 3: dangerouslySkipVersionCheck required — our client has no toolkitVersions.
            return composio.tools.execute(rawTool.slug, {
              connectedAccountId: conn.composio_connected_account_id,
              arguments: args,
              dangerouslySkipVersionCheck: true,
            });
          },
        });
      }
    } catch (error) {
      console.error(
        `[composio] Failed to load tools for connection ${conn.id}:`,
        error,
      );
    }
  }

  return allTools;
}
```

### Step 4: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/composio/activated-tools.ts src/lib/composio/__tests__/activated-tools.test.ts
git commit -m "feat(pr26b): connection-ID-prefixed activated tool loader"
```

---

## Task 4: Export barrel update

**Files:**
- Modify: `src/lib/composio/index.ts`

### Step 1: Update the barrel

Update `src/lib/composio/index.ts` to add exports for the three new modules:

```typescript
/**
 * Barrel exports for Composio integration helpers.
 * @module lib/composio
 */
export { getComposio } from "./client";
export { loadComposioTools } from "./tools";
export {
  initiateOAuthFlow,
  type InitiateOAuthFlowParams,
  type InitiateOAuthFlowResult,
} from "./connection-flow";
export {
  searchIntegrations,
  getToolkitCapabilities,
  type CatalogIntegration,
  type ToolkitCapability,
} from "./catalog";
export { loadActivatedConnectionTools } from "./activated-tools";
```

### Step 2: Run all composio tests to verify no regressions

Run:
```bash
npx vitest run src/lib/composio/__tests__/
```
Expected: ALL PASS.

### Step 3: Commit

```bash
git add src/lib/composio/index.ts
git commit -m "feat(pr26b): export new Composio helpers from barrel"
```

---

## Verification Checklist

- [ ] `initiateOAuthFlow` extracts the proven PR 25 flow into a reusable helper
- [ ] `initiateOAuthFlow` returns `{ redirectUrl, connectedAccountId }`
- [ ] `initiateOAuthFlow` reuses ENABLED auth configs, creates if none exist
- [ ] `initiateOAuthFlow` throws when no redirect URL returned
- [ ] `initiate/route.ts` refactored to call `initiateOAuthFlow()` — pending-only guard, NO active-connection 409 guard (Finding 3)
- [ ] `searchIntegrations` uses `SearchOnlyParams` (`{ search }` only — no `limit`, no `toolkits`)
- [ ] `searchIntegrations` accesses `tool.toolkit?.slug` (object, not string)
- [ ] `searchIntegrations` deduplicates by toolkit slug
- [ ] `getToolkitCapabilities` uses `ToolkitsOnlyParams` (`{ toolkits: [slug] }`)
- [ ] `getToolkitCapabilities` returns tools array with slug, name, description, tags
- [ ] `getToolkitCapabilities` returns quality="UNKNOWN" and notes="" (v1 defaults)
- [ ] `loadActivatedConnectionTools` fetches schemas via `tools.getRawComposioTools({ tools: [...] })` — NOT `tools.get()` which returns provider-wrapped ToolSet (Finding 2)
- [ ] `loadActivatedConnectionTools` creates custom AI SDK tool wrappers using `inputSchema` (not `parameters`) (Finding 6, bypasses `@composio/vercel`)
- [ ] `loadActivatedConnectionTools` tool execution calls `composio.tools.execute(slug, { connectedAccountId, arguments, dangerouslySkipVersionCheck: true })` (Findings 3+4)
- [ ] `loadActivatedConnectionTools` prefixes tools with `{connectionId}__`
- [ ] `loadActivatedConnectionTools` filters to `status === "active"` only
- [ ] `loadActivatedConnectionTools` isolates per-connection errors (partial results)
- [ ] `loadComposioTools` still exists and works (backward compat until runner wiring in 26c)
- [ ] All new modules exported from `src/lib/composio/index.ts`
- [ ] All tests pass: `npx vitest run src/lib/composio/__tests__/`
