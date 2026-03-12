# Excalidraw Diagram Tool Implementation Plan

**PR:** PR 8b: Excalidraw diagram tool (MCP-backed)
**Decisions:** TOOL-03, SERVICE-03
**Goal:** Give the agent a `create_diagram` tool that produces shareable hand-drawn diagrams via the free Excalidraw MCP server.

**Architecture:** Two stateless tools (`get_diagram_reference`, `create_diagram`) call the remote Excalidraw MCP at `mcp.excalidraw.com` over Streamable HTTP transport (JSON-RPC). Follows the same factory pattern as the existing web tools (PR 8a drive-time). `create_diagram` exports the diagram to a shareable excalidraw.com URL and persists the JSON to Supabase Storage. Chat UI detects excalidraw.com URLs in assistant messages and renders them as iframe embed cards.

**Tech Stack:** AI SDK `tool()`, Zod, Supabase Storage, Excalidraw MCP (remote, no auth, no cost), Streamdown (markdown renderer — existing)

---

## Relevant Files

**Create:**
- `src/lib/runner/tools/diagram/excalidraw-client.ts` — MCP HTTP client (JSON-RPC, caching)
- `src/lib/runner/tools/diagram/index.ts` — Tool factory (get_diagram_reference, create_diagram)
- `src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts`
- `src/lib/runner/tools/diagram/__tests__/index.test.ts`
- `src/components/chat/__tests__/excalidraw-embed.test.tsx`
- `src/components/chat/excalidraw-embed.tsx` — Iframe embed card component

**Modify:**
- `src/lib/runner/tools/index.ts` — Add barrel export
- `src/lib/runner/tool-registry.ts` — Register diagram tools in `createRunnerTools()`
- `src/lib/ai/system-prompt.ts` — Add `Diagrams` section to `<tool-usage>`
- `src/components/chat/message-bubble.tsx` — Detect excalidraw URLs in text parts and render embed card

**Reference (read but don't modify):**
- `src/lib/runner/tools/web/drive-time.ts` — Pattern reference (sibling tool, same factory style)
- `src/lib/runner/tools/web/__tests__/drive-time.test.ts` — Test pattern reference
- `src/lib/runner/tools/web/fetch-with-timeout.ts` — Reuse for HTTP calls
- `src/lib/runner/tools/web/search.ts` — Pattern reference (stateless tool factory)
- `src/components/chat/message-bubble.tsx` — Chat rendering (modify for embed)
- `src/components/ai-elements/message.tsx` — MessageResponse / Streamdown rendering
- `roadmap docs/Sunder - Source of Truth/services/01-Built-In Services (Imported from RE-AI-CRM).md` §14 — Product requirements

---

## Task 1: Excalidraw MCP HTTP Client

**Files:**
- Create: `src/lib/runner/tools/diagram/excalidraw-client.ts`
- Test: `src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts`
- Reuse: `src/lib/runner/tools/web/fetch-with-timeout.ts` (import `fetchWithTimeout`, `isAbortError`)

### Background

The Excalidraw MCP server at `mcp.excalidraw.com` speaks **MCP Streamable HTTP transport** — standard JSON-RPC 2.0 over HTTP POST. No auth required. CORS open. The endpoint is `POST https://mcp.excalidraw.com/mcp`.

We need two functions:
1. `getElementReference()` — calls the `read_me` MCP tool, caches result in-memory (it's static reference material ~4KB). Returns the Excalidraw element format guide (shapes, colors, arrows, examples).
2. `exportDiagram(json)` — calls the `export_to_excalidraw` MCP tool with the diagram JSON. Returns a shareable `excalidraw.com` URL.

Both use a shared `callExcalidrawMcp()` helper that sends JSON-RPC `tools/call` requests.

**MCP JSON-RPC request format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_me",
    "arguments": {}
  }
}
```

**MCP response format (SSE):** The server responds with `Content-Type: text/event-stream`. Parse the SSE stream to extract the JSON-RPC result. The result is in `data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"..."}]}}`. For simplicity, read the full response body, split on `data: `, and parse the last JSON-RPC result object.

### Step 1: Write the failing test for `callExcalidrawMcp`

```typescript
// src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts

/**
 * Tests for Excalidraw MCP HTTP client.
 * @module lib/runner/tools/diagram/__tests__/excalidraw-client
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportDiagram,
  getElementReference,
  resetCache,
} from "../excalidraw-client";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Helper: simulate MCP SSE response with a text content result. */
function mcpSseResponse(text: string) {
  return {
    ok: true,
    text: async () =>
      `data: ${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text }] },
      })}\n\n`,
  };
}

describe("excalidraw-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCache();
  });

  describe("getElementReference", () => {
    it("calls MCP read_me and returns the text content", async () => {
      mockFetch.mockResolvedValueOnce(mcpSseResponse("# Excalidraw Elements\n..."));

      const result = await getElementReference();

      expect(result).toBe("# Excalidraw Elements\n...");
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://mcp.excalidraw.com/mcp");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_me", arguments: {} },
      });
    });

    it("caches the result on subsequent calls", async () => {
      mockFetch.mockResolvedValueOnce(mcpSseResponse("cached content"));

      const first = await getElementReference();
      const second = await getElementReference();

      expect(first).toBe("cached content");
      expect(second).toBe("cached content");
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("resets cache via resetCache", async () => {
      mockFetch
        .mockResolvedValueOnce(mcpSseResponse("first"))
        .mockResolvedValueOnce(mcpSseResponse("second"));

      await getElementReference();
      resetCache();
      const result = await getElementReference();

      expect(result).toBe("second");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("exportDiagram", () => {
    it("calls MCP export_to_excalidraw and returns the URL", async () => {
      mockFetch.mockResolvedValueOnce(
        mcpSseResponse("https://excalidraw.com/#json=abc123,def456"),
      );

      const url = await exportDiagram('[{"type":"rectangle","x":0,"y":0}]');

      expect(url).toBe("https://excalidraw.com/#json=abc123,def456");

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.params).toEqual({
        name: "export_to_excalidraw",
        arguments: { json: '[{"type":"rectangle","x":0,"y":0}]' },
      });
    });
  });

  describe("error handling", () => {
    it("throws on non-ok HTTP response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      await expect(getElementReference()).rejects.toThrow(
        "Excalidraw MCP error: 502 Bad Gateway",
      );
    });

    it("throws on malformed SSE response (no data lines)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "invalid response body",
      });

      await expect(getElementReference()).rejects.toThrow(
        "Excalidraw MCP returned no result",
      );
    });

    it("throws on timeout (abort error)", async () => {
      const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(getElementReference()).rejects.toThrow("aborted");
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts
```

Expected: FAIL — `Cannot find module '../excalidraw-client'`

### Step 3: Write the implementation

```typescript
// src/lib/runner/tools/diagram/excalidraw-client.ts

/**
 * Thin HTTP client for the Excalidraw MCP server.
 *
 * Speaks MCP Streamable HTTP transport (JSON-RPC 2.0 over POST).
 * Endpoint: https://mcp.excalidraw.com/mcp — no auth required, free.
 *
 * @module lib/runner/tools/diagram/excalidraw-client
 */
import { fetchWithTimeout, isAbortError } from "../web/fetch-with-timeout";

const MCP_ENDPOINT =
  process.env.EXCALIDRAW_MCP_URL ?? "https://mcp.excalidraw.com/mcp";

/** In-memory cache for the element format reference (static, ~4KB). */
let cachedReference: string | null = null;

/**
 * Sends a JSON-RPC `tools/call` request to the Excalidraw MCP server.
 * Parses the SSE response and returns the text content from the result.
 */
async function callExcalidrawMcp(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const response = await fetchWithTimeout(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Excalidraw MCP error: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  const dataLines = body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6));

  if (dataLines.length === 0) {
    throw new Error("Excalidraw MCP returned no result");
  }

  // The last data line contains the final result.
  const parsed = JSON.parse(dataLines[dataLines.length - 1]) as {
    result?: { content?: Array<{ type: string; text?: string }> };
  };

  const textContent = parsed.result?.content?.find((c) => c.type === "text");
  if (!textContent?.text) {
    throw new Error("Excalidraw MCP returned no text content");
  }

  return textContent.text;
}

/**
 * Returns the Excalidraw element format reference (shapes, colors, arrows, examples).
 * Cached in-memory after first call — the reference is static.
 */
export async function getElementReference(): Promise<string> {
  if (cachedReference) {
    return cachedReference;
  }
  cachedReference = await callExcalidrawMcp("read_me");
  return cachedReference;
}

/**
 * Exports an Excalidraw diagram and returns a shareable excalidraw.com URL.
 *
 * @param json - Serialized JSON string of Excalidraw elements array.
 * @returns Shareable URL like `https://excalidraw.com/#json=abc123,def456`.
 */
export async function exportDiagram(json: string): Promise<string> {
  return callExcalidrawMcp("export_to_excalidraw", { json });
}

/** Resets the cached element reference. Exported for testing only. */
export function resetCache(): void {
  cachedReference = null;
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts
```

Expected: All 6 tests PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/diagram/excalidraw-client.ts src/lib/runner/tools/diagram/__tests__/excalidraw-client.test.ts
git commit -m "feat(pr8b): excalidraw MCP HTTP client with caching"
```

---

## Task 2: Diagram Tool Factory

**Files:**
- Create: `src/lib/runner/tools/diagram/index.ts`
- Test: `src/lib/runner/tools/diagram/__tests__/index.test.ts`
- Reference: `src/lib/runner/tools/web/drive-time.ts` (pattern — stateless tool factory)
- Reference: `src/lib/runner/tools/web/__tests__/drive-time.test.ts` (test pattern)

### Background

Two tools following the existing factory pattern:

1. **`get_diagram_reference`** — Returns the Excalidraw element format guide. The LLM calls this once before generating its first diagram to learn element types, color palette, sizing rules, and examples. No inputs.

2. **`create_diagram`** — Takes `title` (string) and `elements` (JSON string of Excalidraw elements array). Exports to a shareable excalidraw.com URL via the MCP client. Saves the raw JSON to Supabase Storage at `diagrams/{timestamp}-{slug}.excalidraw` for persistence. Returns `{ success, url, storage_path }`.

The factory takes `supabase` and `clientId` (for storage writes) — same closure pattern as CRM tools.

### Step 1: Write the failing test

```typescript
// src/lib/runner/tools/diagram/__tests__/index.test.ts

/**
 * Tests for diagram tool factory.
 * @module lib/runner/tools/diagram/__tests__/index
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the excalidraw client before importing the factory.
vi.mock("../excalidraw-client", () => ({
  getElementReference: vi.fn(),
  exportDiagram: vi.fn(),
}));

import { getElementReference, exportDiagram } from "../excalidraw-client";
import { createDiagramTools } from "../index";

const mockGetRef = vi.mocked(getElementReference);
const mockExport = vi.mocked(exportDiagram);

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

/** Minimal mock Supabase client with storage.from().upload(). */
const mockUpload = vi.fn();
const mockSupabase = {
  storage: {
    from: vi.fn(() => ({ upload: mockUpload })),
  },
} as unknown as Parameters<typeof createDiagramTools>[0];

const CLIENT_ID = "client-123";

describe("createDiagramTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("get_diagram_reference", () => {
    it("returns the cached element format reference", async () => {
      mockGetRef.mockResolvedValueOnce("# Excalidraw Elements\nShapes: rectangle, ellipse...");

      const { get_diagram_reference } = createDiagramTools(mockSupabase, CLIENT_ID);
      const result = await get_diagram_reference.execute({}, EXECUTION_OPTIONS);

      expect(result).toEqual({
        success: true,
        reference: "# Excalidraw Elements\nShapes: rectangle, ellipse...",
      });
      expect(mockGetRef).toHaveBeenCalledOnce();
    });

    it("returns error when MCP call fails", async () => {
      mockGetRef.mockRejectedValueOnce(new Error("MCP unreachable"));

      const { get_diagram_reference } = createDiagramTools(mockSupabase, CLIENT_ID);
      const result = await get_diagram_reference.execute({}, EXECUTION_OPTIONS);

      expect(result).toEqual({
        success: false,
        error: "MCP unreachable",
      });
    });
  });

  describe("create_diagram", () => {
    it("exports diagram to URL and saves to storage", async () => {
      mockExport.mockResolvedValueOnce("https://excalidraw.com/#json=abc,def");
      mockUpload.mockResolvedValueOnce({ error: null });

      const { create_diagram } = createDiagramTools(mockSupabase, CLIENT_ID);
      const result = await create_diagram.execute(
        {
          title: "Deal Timeline",
          elements: '[{"type":"rectangle","x":0,"y":0}]',
        },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      expect(result).toMatchObject({
        success: true,
        url: "https://excalidraw.com/#json=abc,def",
      });
      // Verify storage path format
      expect((result as { storage_path: string }).storage_path).toMatch(
        /^\/agent\/diagrams\/\d+-deal-timeline\.excalidraw$/,
      );

      // Verify storage upload was called with the right bucket and content
      expect(mockSupabase.storage.from).toHaveBeenCalledWith(CLIENT_ID);
      expect(mockUpload).toHaveBeenCalledOnce();
      const [storagePath, content] = mockUpload.mock.calls[0];
      expect(storagePath).toMatch(/^diagrams\/\d+-deal-timeline\.excalidraw$/);
      expect(content).toBe('[{"type":"rectangle","x":0,"y":0}]');
    });

    it("returns error when MCP export fails", async () => {
      mockExport.mockRejectedValueOnce(new Error("Export failed"));

      const { create_diagram } = createDiagramTools(mockSupabase, CLIENT_ID);
      const result = await create_diagram.execute(
        {
          title: "Test",
          elements: "[]",
        },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "Export failed",
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it("still returns success with URL even if storage upload fails", async () => {
      mockExport.mockResolvedValueOnce("https://excalidraw.com/#json=abc,def");
      mockUpload.mockResolvedValueOnce({ error: { message: "Storage full" } });

      const { create_diagram } = createDiagramTools(mockSupabase, CLIENT_ID);
      const result = await create_diagram.execute(
        {
          title: "Test Diagram",
          elements: "[]",
        },
        EXECUTION_OPTIONS,
      );

      // URL was created successfully — storage is best-effort
      expect(result.success).toBe(true);
      expect(result).toMatchObject({
        url: "https://excalidraw.com/#json=abc,def",
      });
    });

    it("slugifies the title for the storage path", async () => {
      mockExport.mockResolvedValueOnce("https://excalidraw.com/#json=x,y");
      mockUpload.mockResolvedValueOnce({ error: null });

      const { create_diagram } = createDiagramTools(mockSupabase, CLIENT_ID);
      await create_diagram.execute(
        {
          title: "Sarah's Noriega Deal — Timeline & Milestones!",
          elements: "[]",
        },
        EXECUTION_OPTIONS,
      );

      const [storagePath] = mockUpload.mock.calls[0];
      // Should be lowercased, non-alphanum replaced with dashes, truncated to 40 chars
      expect(storagePath).toMatch(/^diagrams\/\d+-sarah-s-noriega-deal-timeline-milest\.excalidraw$/);
    });

    it("validates the input schema", () => {
      const { create_diagram } = createDiagramTools(mockSupabase, CLIENT_ID);

      // Missing required fields
      expect(
        create_diagram.inputSchema.safeParse({}).success,
      ).toBe(false);

      // Missing elements
      expect(
        create_diagram.inputSchema.safeParse({ title: "Test" }).success,
      ).toBe(false);

      // Valid input
      expect(
        create_diagram.inputSchema.safeParse({
          title: "Test",
          elements: '[{"type":"rectangle"}]',
        }).success,
      ).toBe(true);
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/diagram/__tests__/index.test.ts
```

Expected: FAIL — `Cannot find module '../index'`

### Step 3: Write the implementation

```typescript
// src/lib/runner/tools/diagram/index.ts

/**
 * Diagram tool factory for the runner.
 *
 * Exposes two tools via the Excalidraw MCP server:
 * - get_diagram_reference: cached element format guide (call once per conversation)
 * - create_diagram: generates a hand-drawn diagram → shareable URL + storage backup
 *
 * Follows the same factory pattern as web tools (PR 8a). No DB migration needed —
 * diagrams are stored as files in Supabase Storage.
 *
 * @module lib/runner/tools/diagram
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";

import type { Database } from "@/types/database";

import { exportDiagram, getElementReference } from "./excalidraw-client";

/**
 * Converts a title to a URL-safe slug, truncated to maxLen characters.
 */
function slugify(title: string, maxLen = 40): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

/**
 * Creates diagram tools for the runner.
 */
export function createDiagramTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const get_diagram_reference = tool({
    description:
      "Get the Excalidraw element format reference. Call this ONCE before creating your first diagram in a conversation. Returns the element schema, color palette, sizing rules, and examples you need to generate valid Excalidraw elements.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const reference = await getElementReference();
        return { success: true as const, reference };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  const create_diagram = tool({
    description:
      "Create a hand-drawn style diagram. Pass a JSON array of Excalidraw elements (shapes, text, arrows). Returns a shareable URL and saves to storage. Call get_diagram_reference first to learn the element format.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(1)
        .describe("Short title for the diagram (used for filename)."),
      elements: z
        .string()
        .min(2)
        .describe(
          "JSON array string of Excalidraw elements. Must be valid JSON.",
        ),
    }),
    execute: async ({ title, elements }) => {
      try {
        const url = await exportDiagram(elements);

        // Best-effort persistence to Supabase Storage.
        const slug = slugify(title);
        const storagePath = `diagrams/${Date.now()}-${slug}.excalidraw`;
        await supabase.storage.from(clientId).upload(storagePath, elements, {
          contentType: "application/json",
          upsert: false,
        });

        return {
          success: true as const,
          url,
          storage_path: `/agent/${storagePath}`,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  return { get_diagram_reference, create_diagram };
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/diagram/__tests__/index.test.ts
```

Expected: All 6 tests PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/diagram/index.ts src/lib/runner/tools/diagram/__tests__/index.test.ts
git commit -m "feat(pr8b): diagram tool factory (get_diagram_reference + create_diagram)"
```

---

## Task 3: Tool Registration + System Prompt

**Files:**
- Modify: `src/lib/runner/tools/index.ts` (barrel export)
- Modify: `src/lib/runner/tool-registry.ts:32-77` (register diagram tools)
- Modify: `src/lib/ai/system-prompt.ts:34-66` (add Diagrams section to `<tool-usage>`)

### Background

Wire the diagram tools into the runner so the agent can use them. Three small edits:

1. **Barrel export** — Add `export { createDiagramTools } from "./diagram"` to `src/lib/runner/tools/index.ts`.
2. **Tool registry** — Import `createDiagramTools` and call it in `createRunnerTools()`. The diagram tools need `supabase` and `clientId` (for storage writes) but no special mode or config.
3. **System prompt** — Add a `Diagrams` section inside `<tool-usage>` telling the agent when and how to use diagrams.

### Step 1: Write a failing test that verifies diagram tools are registered

There's no dedicated test file for tool-registry.ts in the codebase — this is a wiring step. Instead, verify manually:

```bash
# After making the changes, run the existing test suite to make sure nothing breaks:
npx vitest run src/lib/runner/
```

Expected: All existing tests still pass. (We're only adding, not changing.)

### Step 2: Add barrel export

In `src/lib/runner/tools/index.ts`, add the diagram export:

```typescript
// Add this line after the existing exports:
export { createDiagramTools } from "./diagram";
```

The file should now have 8 exports total (connections, crm, diagram, storage, subagents, triggers, utility, web).

### Step 3: Register in tool-registry.ts

In `src/lib/runner/tool-registry.ts`:

1. Add `createDiagramTools` to the import:

```typescript
import {
  createConnectionTools,
  createCrmTools,
  createDiagramTools,  // ← add
  createStorageTools,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
```

2. In `createRunnerTools()`, create diagram tools and spread them into both return paths (subagent and non-subagent):

```typescript
// After: const webTools = createWebTools();
const diagramTools = createDiagramTools(supabase, clientId);

// In the subagent return:
return {
  ...crmTools,
  ...storageTools,
  ...webTools,
  ...diagramTools,  // ← add
  ...utilityTools,
  ...connectionTools,
};

// In the non-subagent return:
return {
  ...crmTools,
  ...storageTools,
  ...webTools,
  ...diagramTools,  // ← add
  ...utilityTools,
  ...triggerTools,
  ...connectionTools,
};
```

### Step 4: Add Diagrams section to system prompt

In `src/lib/ai/system-prompt.ts`, add inside `<tool-usage>` (after the Triggers section, before `</tool-usage>`):

```
Diagrams:
- Call get_diagram_reference ONCE at the start of a conversation where you need diagrams, to learn the Excalidraw element format.
- Use create_diagram for visual deliverables: transaction timelines, property comparisons, process flows, pipeline snapshots, commission breakdowns, neighborhood annotated maps.
- Keep diagrams focused: 4-8 key elements, clear labels, use the curated color palette from the reference.
- The returned URL is a shareable excalidraw.com link — interactive, editable, works on any device.
- Hand-drawn style feels personal and approachable, not corporate. Good for client-facing communication.
```

### Step 5: Run tests

```bash
npx vitest run src/lib/runner/
```

Expected: All existing tests pass. No regressions.

### Step 6: Commit

```bash
git add src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts src/lib/ai/system-prompt.ts
git commit -m "feat(pr8b): register diagram tools in runner + system prompt guidance"
```

---

## Task 4: Chat UI — Excalidraw Embed Card

**Files:**
- Create: `src/components/chat/excalidraw-embed.tsx`
- Create: `src/components/chat/__tests__/excalidraw-embed.test.tsx`
- Modify: `src/components/chat/message-bubble.tsx:119-123` (wrap text parts to detect excalidraw URLs)

### Background

When the agent's text response contains an `excalidraw.com` URL, render it as an iframe embed card instead of a plain text link. The card shows:
- An interactive iframe of the Excalidraw diagram (~400px tall)
- A footer with "Open in Excalidraw →" link

The detection is simple: look for `https://excalidraw.com/#json=` in the text content. Extract the URL, render the embed card, and pass the remaining text to the normal Streamdown renderer.

### Step 1: Write the failing test for the embed component

```tsx
// src/components/chat/__tests__/excalidraw-embed.test.tsx

/**
 * Tests for the Excalidraw iframe embed card.
 * @module components/chat/__tests__/excalidraw-embed
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ExcalidrawEmbed,
  extractExcalidrawUrl,
} from "../excalidraw-embed";

describe("extractExcalidrawUrl", () => {
  it("extracts an excalidraw.com URL from text", () => {
    const text =
      "Here's the timeline: https://excalidraw.com/#json=abc123,def456 — let me know!";
    expect(extractExcalidrawUrl(text)).toBe(
      "https://excalidraw.com/#json=abc123,def456",
    );
  });

  it("returns null when no excalidraw URL is present", () => {
    expect(extractExcalidrawUrl("No diagrams here")).toBeNull();
    expect(extractExcalidrawUrl("https://google.com")).toBeNull();
  });

  it("handles URL at end of text without trailing characters", () => {
    expect(
      extractExcalidrawUrl("Diagram: https://excalidraw.com/#json=x,y"),
    ).toBe("https://excalidraw.com/#json=x,y");
  });
});

describe("ExcalidrawEmbed", () => {
  it("renders an iframe with the correct src", () => {
    render(
      <ExcalidrawEmbed url="https://excalidraw.com/#json=abc,def" />,
    );

    const iframe = screen.getByTitle("Excalidraw diagram");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      "https://excalidraw.com/#json=abc,def",
    );
  });

  it("renders an Open in Excalidraw link", () => {
    render(
      <ExcalidrawEmbed url="https://excalidraw.com/#json=abc,def" />,
    );

    const link = screen.getByRole("link", { name: /open in excalidraw/i });
    expect(link).toHaveAttribute(
      "href",
      "https://excalidraw.com/#json=abc,def",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/components/chat/__tests__/excalidraw-embed.test.tsx
```

Expected: FAIL — `Cannot find module '../excalidraw-embed'`

### Step 3: Write the ExcalidrawEmbed component

```tsx
// src/components/chat/excalidraw-embed.tsx

/**
 * Iframe embed card for Excalidraw diagrams.
 * Renders an interactive diagram preview with an "Open in Excalidraw" link.
 * @module components/chat/excalidraw-embed
 */
"use client";

const EXCALIDRAW_URL_REGEX =
  /https:\/\/excalidraw\.com\/#json=[A-Za-z0-9_-]+,[A-Za-z0-9_-]+/;

/**
 * Extracts the first excalidraw.com shareable URL from a text string.
 * Returns null if no URL is found.
 */
export function extractExcalidrawUrl(text: string): string | null {
  const match = EXCALIDRAW_URL_REGEX.exec(text);
  return match ? match[0] : null;
}

interface ExcalidrawEmbedProps {
  url: string;
}

/** Renders an Excalidraw diagram as an interactive iframe card. */
export function ExcalidrawEmbed({ url }: ExcalidrawEmbedProps) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border">
      <iframe
        src={url}
        title="Excalidraw diagram"
        className="h-[400px] w-full border-0"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
      <div className="flex items-center justify-end border-t px-3 py-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Open in Excalidraw &rarr;
        </a>
      </div>
    </div>
  );
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/components/chat/__tests__/excalidraw-embed.test.tsx
```

Expected: All 5 tests PASS.

### Step 5: Wire into message-bubble.tsx

In `src/components/chat/message-bubble.tsx`:

1. Add the import at the top:

```typescript
import { ExcalidrawEmbed, extractExcalidrawUrl } from "./excalidraw-embed";
```

2. Replace the text parts rendering block (around line 119-123):

```tsx
{/* Before: */}
{textParts.map((part, i) => (
  <MessageResponse key={`${message.id}-text-${i}`}>
    {part.text}
  </MessageResponse>
))}

{/* After: */}
{textParts.map((part, i) => {
  const excalidrawUrl = extractExcalidrawUrl(part.text);
  return (
    <div key={`${message.id}-text-${i}`}>
      <MessageResponse>{part.text}</MessageResponse>
      {excalidrawUrl && <ExcalidrawEmbed url={excalidrawUrl} />}
    </div>
  );
})}
```

### Step 6: Run the full test suite

```bash
npx vitest run src/components/chat/
```

Expected: All tests pass (existing message-bubble tests + new excalidraw-embed tests).

### Step 7: Commit

```bash
git add src/components/chat/excalidraw-embed.tsx src/components/chat/__tests__/excalidraw-embed.test.tsx src/components/chat/message-bubble.tsx
git commit -m "feat(pr8b): chat UI excalidraw iframe embed card"
```

---

## Task 5: Integration Smoke Test + Final Commit

**Files:** None new. This is a verification task.

### Step 1: Run the full test suite

```bash
npx vitest run
```

Expected: All tests pass. Zero regressions.

### Step 2: Run TypeScript type check

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Run linter

```bash
npx next lint
```

Expected: No lint errors in new files.

### Step 4: Manual smoke test (optional but recommended)

1. Start the dev server: `npm run dev`
2. Open the chat and ask: "Draw me a transaction timeline for a deal closing May 10"
3. Verify:
   - Agent calls `get_diagram_reference` (visible in steps summary)
   - Agent calls `create_diagram` with Excalidraw elements JSON
   - Chat shows the diagram as an iframe embed card
   - "Open in Excalidraw" link opens the diagram in a new tab
   - Diagram JSON is saved to Supabase Storage under `diagrams/`

### Step 5: Final commit (if any fixups)

```bash
git add -A
git commit -m "feat(pr8b): excalidraw diagram tool — integration fixes"
```

---

## Notes

- **No database migration needed.** Diagrams are stored as files in Supabase Storage, not in a table.
- **No new env vars required.** The MCP endpoint has no auth. An optional `EXCALIDRAW_MCP_URL` override is available if you self-host later.
- **The `fetchWithTimeout` utility** from `src/lib/runner/tools/web/fetch-with-timeout.ts` is reused. Default 15s timeout. If the MCP server is slow, this will abort cleanly.
- **Subagents get diagram tools too** — they're read + create, no approval needed, no external-facing risk.
- **SSE parsing** is deliberately simple (split on `data: ` lines). The Excalidraw MCP returns well-formed SSE. If the response format changes, the `callExcalidrawMcp` parser is the only place to update.
- **The iframe sandbox** attribute is set to `allow-scripts allow-same-origin` — enough for Excalidraw to render, but blocks top-navigation and form submission.
