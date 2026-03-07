# Block Storage + Context Management Alignment Implementation Plan

**PR:** PR 22c: Block Storage + Context Management Alignment (extends PR 22 — Context recovery + thread compaction)
**Decisions:** DATA-10, SESSION-07, RUNNER-03
**Goal:** Align with Tasklet's "store everything, always recoverable" block storage pattern while keeping our summarization-based compaction, so tool call data survives compaction and context truncation.

**Architecture:** All tool call args and results are persisted to Supabase Storage on every run (DATA-10). A mechanical block index is embedded in compaction summaries, mapping tool call IDs to their storage paths so the agent can recover any data after compaction (SESSION-07). The agent receives `<context-management>` instructions telling it how to use `read_file` for recovery, and `<autonomous-mode>` instructions for graceful error handling during trigger-initiated runs.

**Tech Stack:** TypeScript, Vitest, Supabase Storage, Vercel AI SDK (`generateText`)

**Note:** This is an extension of PR 22 (done). PR 22a (multimodal chat) and PR 22b (tool output rendering) are separate PRs — this work bridges block storage and compaction.

---

## Task 1: Block Index Utilities (`block-index.ts`)

Pure utility module for the block index that lives inside compaction summaries. No external dependencies — fully unit-testable.

**Files:**
- Create: `src/lib/runner/block-index.ts`
- Create: `src/lib/runner/__tests__/block-index.test.ts`

### Step 1: Write failing tests for `BlockIndexEntry` type and `BLOCK_INDEX_MAX_ENTRIES` constant

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Write the test file:

```typescript
// src/lib/runner/__tests__/block-index.test.ts
/**
 * Tests for block index utilities used in compaction summaries.
 * @module lib/runner/__tests__/block-index
 */
import { describe, expect, it } from "vitest";

import {
  BLOCK_INDEX_MAX_ENTRIES,
  type BlockIndexEntry,
  extractBlockEntriesFromParts,
  mergeBlockIndex,
  parseBlockIndex,
  serializeBlockIndex,
  stripBlockIndex,
} from "../block-index";

describe("BLOCK_INDEX_MAX_ENTRIES", () => {
  it("is a positive integer capped at 200", () => {
    expect(Number.isInteger(BLOCK_INDEX_MAX_ENTRIES)).toBe(true);
    expect(BLOCK_INDEX_MAX_ENTRIES).toBe(200);
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: FAIL — module `../block-index` does not exist.

### Step 3: Create minimal `block-index.ts` with constant and type

```typescript
// src/lib/runner/block-index.ts
/**
 * Block index utilities for embedding tool call recovery metadata in compaction summaries.
 * The block index is a compact, pipe-delimited list appended mechanically to summaries
 * so the agent can find and recover any tool call data after compaction.
 * @module lib/runner/block-index
 */

/** Maximum number of block index entries to retain across compactions. */
export const BLOCK_INDEX_MAX_ENTRIES = 200;

/** A single entry in the block index representing one stored tool call. */
export interface BlockIndexEntry {
  toolCallId: string;
  toolName: string;
  timestamp: string;
  argsStub: string;
}
```

Add stub exports so the test file compiles (we'll fill these in as we go):

```typescript
export function extractBlockEntriesFromParts(
  _parts: unknown,
  _messageTimestamp: string,
): BlockIndexEntry[] {
  return [];
}

export function parseBlockIndex(_summaryText: string): BlockIndexEntry[] {
  return [];
}

export function serializeBlockIndex(_entries: BlockIndexEntry[]): string {
  return "";
}

export function mergeBlockIndex(
  _existing: BlockIndexEntry[],
  _incoming: BlockIndexEntry[],
): BlockIndexEntry[] {
  return [];
}

export function stripBlockIndex(_summaryText: string): string {
  return _summaryText;
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: PASS

### Step 5: Write failing tests for `serializeBlockIndex` and `parseBlockIndex`

Add to `block-index.test.ts`:

```typescript
describe("serializeBlockIndex", () => {
  it("returns an empty string for an empty array", () => {
    expect(serializeBlockIndex([])).toBe("");
  });

  it("wraps entries in <block-index> tags with pipe-delimited fields", () => {
    const entries: BlockIndexEntry[] = [
      {
        toolCallId: "call_abc",
        toolName: "search_contacts",
        timestamp: "2026-03-06T01:15:00Z",
        argsStub: '{"query":"John Tan"}',
      },
      {
        toolCallId: "call_def",
        toolName: "web_scrape",
        timestamp: "2026-03-06T01:16:00Z",
        argsStub: '{"url":"https://propertyguru.com"}',
      },
    ];

    const result = serializeBlockIndex(entries);
    expect(result).toContain("<block-index>");
    expect(result).toContain("</block-index>");
    expect(result).toContain("call_abc | search_contacts | 2026-03-06T01:15:00Z");
    expect(result).toContain("call_def | web_scrape | 2026-03-06T01:16:00Z");
  });
});

describe("parseBlockIndex", () => {
  it("returns an empty array when no block-index section exists", () => {
    expect(parseBlockIndex("Just a normal summary.")).toEqual([]);
  });

  it("parses pipe-delimited entries from a block-index section", () => {
    const summaryText = [
      "Summary of conversation.",
      "<block-index>",
      'call_abc | search_contacts | 2026-03-06T01:15:00Z | {"query":"John"}',
      'call_def | web_scrape | 2026-03-06T01:16:00Z | {"url":"https://pg.com"}',
      "</block-index>",
    ].join("\n");

    const entries = parseBlockIndex(summaryText);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      toolCallId: "call_abc",
      toolName: "search_contacts",
      timestamp: "2026-03-06T01:15:00Z",
      argsStub: '{"query":"John"}',
    });
    expect(entries[1]).toEqual({
      toolCallId: "call_def",
      toolName: "web_scrape",
      timestamp: "2026-03-06T01:16:00Z",
      argsStub: '{"url":"https://pg.com"}',
    });
  });

  it("skips blank lines inside the block-index section", () => {
    const summaryText = [
      "<block-index>",
      'call_abc | search_contacts | 2026-03-06T01:15:00Z | {"query":"John"}',
      "",
      "  ",
      "</block-index>",
    ].join("\n");

    expect(parseBlockIndex(summaryText)).toHaveLength(1);
  });

  it("skips malformed lines with too few pipe segments", () => {
    const summaryText = [
      "<block-index>",
      "call_abc | search_contacts",
      'call_def | web_scrape | 2026-03-06T01:16:00Z | {"url":"x"}',
      "</block-index>",
    ].join("\n");

    expect(parseBlockIndex(summaryText)).toHaveLength(1);
    expect(parseBlockIndex(summaryText)[0]?.toolCallId).toBe("call_def");
  });
});
```

### Step 6: Run test to verify failures

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: FAIL — `serializeBlockIndex` returns empty string, `parseBlockIndex` returns empty array.

### Step 7: Implement `serializeBlockIndex` and `parseBlockIndex`

Replace the stubs in `block-index.ts`:

```typescript
const BLOCK_INDEX_OPEN = "<block-index>";
const BLOCK_INDEX_CLOSE = "</block-index>";

/**
 * Serializes block index entries into a compact pipe-delimited format
 * wrapped in `<block-index>` XML tags for embedding in compaction summaries.
 */
export function serializeBlockIndex(entries: BlockIndexEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  const lines = entries.map(
    (e) => `${e.toolCallId} | ${e.toolName} | ${e.timestamp} | ${e.argsStub}`,
  );

  return [BLOCK_INDEX_OPEN, ...lines, BLOCK_INDEX_CLOSE].join("\n");
}

/**
 * Parses block index entries from a compaction summary string.
 * Returns an empty array if no `<block-index>` section is found.
 */
export function parseBlockIndex(summaryText: string): BlockIndexEntry[] {
  const openIndex = summaryText.indexOf(BLOCK_INDEX_OPEN);
  const closeIndex = summaryText.indexOf(BLOCK_INDEX_CLOSE);

  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return [];
  }

  const body = summaryText.slice(openIndex + BLOCK_INDEX_OPEN.length, closeIndex);

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const segments = line.split(" | ");
      if (segments.length < 4) {
        return null;
      }

      return {
        toolCallId: segments[0]!.trim(),
        toolName: segments[1]!.trim(),
        timestamp: segments[2]!.trim(),
        argsStub: segments.slice(3).join(" | ").trim(),
      };
    })
    .filter((entry): entry is BlockIndexEntry => entry !== null);
}
```

### Step 8: Run test to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: PASS

### Step 9: Write failing tests for `stripBlockIndex`

Add to `block-index.test.ts`:

```typescript
describe("stripBlockIndex", () => {
  it("returns the original text when no block-index exists", () => {
    expect(stripBlockIndex("Just a summary.")).toBe("Just a summary.");
  });

  it("removes the block-index section from a summary", () => {
    const input = [
      "Summary narrative here.",
      "",
      "<block-index>",
      'call_abc | search_contacts | 2026-03-06T01:15:00Z | {"query":"John"}',
      "</block-index>",
    ].join("\n");

    const result = stripBlockIndex(input);
    expect(result).toBe("Summary narrative here.");
    expect(result).not.toContain("<block-index>");
    expect(result).not.toContain("</block-index>");
  });

  it("trims trailing whitespace after stripping", () => {
    const input = "Narrative.\n\n<block-index>\nentry\n</block-index>\n\n";
    expect(stripBlockIndex(input)).toBe("Narrative.");
  });
});
```

### Step 10: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: FAIL — `stripBlockIndex` returns text unmodified.

### Step 11: Implement `stripBlockIndex`

Replace the stub:

```typescript
/**
 * Removes the `<block-index>...</block-index>` section from a summary string.
 * Used before passing the summary text to the summarizer LLM, since the block
 * index is managed mechanically and should not be seen by the model.
 */
export function stripBlockIndex(summaryText: string): string {
  const openIndex = summaryText.indexOf(BLOCK_INDEX_OPEN);

  if (openIndex === -1) {
    return summaryText;
  }

  const closeIndex = summaryText.indexOf(BLOCK_INDEX_CLOSE);
  if (closeIndex === -1) {
    return summaryText;
  }

  const before = summaryText.slice(0, openIndex);
  const after = summaryText.slice(closeIndex + BLOCK_INDEX_CLOSE.length);

  return (before + after).trim();
}
```

### Step 12: Run test to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: PASS

### Step 13: Write failing tests for `extractBlockEntriesFromParts`

Add to `block-index.test.ts`:

```typescript
describe("extractBlockEntriesFromParts", () => {
  it("returns an empty array for null/undefined parts", () => {
    expect(extractBlockEntriesFromParts(null, "2026-03-06T01:00:00Z")).toEqual([]);
    expect(extractBlockEntriesFromParts(undefined, "2026-03-06T01:00:00Z")).toEqual([]);
  });

  it("returns an empty array for non-array parts", () => {
    expect(extractBlockEntriesFromParts("text", "2026-03-06T01:00:00Z")).toEqual([]);
  });

  it("extracts entries from tool parts with output-available state", () => {
    const parts = [
      { type: "step-start" },
      {
        type: "tool-search_contacts",
        toolCallId: "call_abc",
        toolName: "search_contacts",
        state: "output-available",
        input: { query: "John Tan" },
        output: { success: true, contacts: [] },
      },
      { type: "text", text: "Found nothing." },
    ];

    const entries = extractBlockEntriesFromParts(parts, "2026-03-06T01:15:00Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      toolCallId: "call_abc",
      toolName: "search_contacts",
      timestamp: "2026-03-06T01:15:00Z",
      argsStub: '{"query":"John Tan"}',
    });
  });

  it("extracts toolName from type field when toolName property is absent", () => {
    const parts = [
      {
        type: "tool-web_scrape",
        toolCallId: "call_xyz",
        state: "output-available",
        input: { url: "https://example.com" },
        output: "<html>...</html>",
      },
    ];

    const entries = extractBlockEntriesFromParts(parts, "2026-03-06T01:20:00Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.toolName).toBe("web_scrape");
  });

  it("truncates argsStub to 100 characters", () => {
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call_long",
        state: "output-available",
        input: { query: "A".repeat(200) },
        output: { success: true },
      },
    ];

    const entries = extractBlockEntriesFromParts(parts, "2026-03-06T01:25:00Z");
    expect(entries[0]!.argsStub.length).toBeLessThanOrEqual(103); // 100 + "..."
  });

  it("skips parts without output-available state", () => {
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call_pending",
        state: "input-available",
        input: { query: "John" },
      },
    ];

    expect(extractBlockEntriesFromParts(parts, "2026-03-06T01:00:00Z")).toEqual([]);
  });
});
```

### Step 14: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: FAIL — `extractBlockEntriesFromParts` returns empty array.

### Step 15: Implement `extractBlockEntriesFromParts`

Replace the stub:

```typescript
const ARGS_STUB_MAX_LENGTH = 100;

/**
 * Extracts block index entries from persisted message parts (DB `parts` JSON column).
 * Scans for tool parts with `state === "output-available"` and creates an entry for each.
 */
export function extractBlockEntriesFromParts(
  parts: unknown,
  messageTimestamp: string,
): BlockIndexEntry[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  const entries: BlockIndexEntry[] = [];

  for (const part of parts) {
    if (typeof part !== "object" || part === null) {
      continue;
    }

    const p = part as Record<string, unknown>;

    if (p.state !== "output-available" || typeof p.toolCallId !== "string") {
      continue;
    }

    const typeStr = typeof p.type === "string" ? p.type : "";
    const toolName =
      typeof p.toolName === "string"
        ? p.toolName
        : typeStr.startsWith("tool-")
          ? typeStr.slice("tool-".length)
          : "unknown";

    let argsStub: string;
    try {
      argsStub = JSON.stringify(p.input ?? {});
    } catch {
      argsStub = "{}";
    }

    if (argsStub.length > ARGS_STUB_MAX_LENGTH) {
      argsStub = argsStub.slice(0, ARGS_STUB_MAX_LENGTH) + "...";
    }

    entries.push({
      toolCallId: p.toolCallId,
      toolName,
      timestamp: messageTimestamp,
      argsStub,
    });
  }

  return entries;
}
```

### Step 16: Run test to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: PASS

### Step 17: Write failing tests for `mergeBlockIndex`

Add to `block-index.test.ts`:

```typescript
describe("mergeBlockIndex", () => {
  it("combines two non-overlapping arrays", () => {
    const existing: BlockIndexEntry[] = [
      { toolCallId: "call_a", toolName: "search_contacts", timestamp: "2026-03-06T01:00:00Z", argsStub: "{}" },
    ];
    const incoming: BlockIndexEntry[] = [
      { toolCallId: "call_b", toolName: "web_scrape", timestamp: "2026-03-06T01:01:00Z", argsStub: "{}" },
    ];

    const merged = mergeBlockIndex(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((e) => e.toolCallId)).toEqual(["call_a", "call_b"]);
  });

  it("deduplicates by toolCallId, keeping the incoming entry", () => {
    const existing: BlockIndexEntry[] = [
      { toolCallId: "call_a", toolName: "search_contacts", timestamp: "2026-03-06T01:00:00Z", argsStub: '{"old":true}' },
    ];
    const incoming: BlockIndexEntry[] = [
      { toolCallId: "call_a", toolName: "search_contacts", timestamp: "2026-03-06T01:05:00Z", argsStub: '{"new":true}' },
    ];

    const merged = mergeBlockIndex(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.argsStub).toBe('{"new":true}');
  });

  it("caps the result at BLOCK_INDEX_MAX_ENTRIES, dropping oldest entries", () => {
    const existing: BlockIndexEntry[] = Array.from({ length: 190 }, (_, i) => ({
      toolCallId: `call_existing_${i}`,
      toolName: "search_contacts",
      timestamp: `2026-03-06T01:${String(i).padStart(2, "0")}:00Z`,
      argsStub: "{}",
    }));
    const incoming: BlockIndexEntry[] = Array.from({ length: 20 }, (_, i) => ({
      toolCallId: `call_incoming_${i}`,
      toolName: "web_scrape",
      timestamp: `2026-03-06T02:${String(i).padStart(2, "0")}:00Z`,
      argsStub: "{}",
    }));

    const merged = mergeBlockIndex(existing, incoming);
    expect(merged).toHaveLength(BLOCK_INDEX_MAX_ENTRIES);
    // Should have all 20 incoming entries (newest)
    expect(merged.filter((e) => e.toolCallId.startsWith("call_incoming_"))).toHaveLength(20);
    // Should have kept 180 of the 190 existing (dropped 10 oldest)
    expect(merged.filter((e) => e.toolCallId.startsWith("call_existing_"))).toHaveLength(180);
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(mergeBlockIndex([], [])).toEqual([]);
  });
});
```

### Step 18: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: FAIL — `mergeBlockIndex` returns empty array.

### Step 19: Implement `mergeBlockIndex`

Replace the stub:

```typescript
/**
 * Merges existing and incoming block index entries.
 * Deduplicates by `toolCallId` (incoming wins). Caps at `BLOCK_INDEX_MAX_ENTRIES`
 * by dropping the oldest entries (earliest in the merged array, which preserves
 * insertion order: existing first, then incoming).
 */
export function mergeBlockIndex(
  existing: BlockIndexEntry[],
  incoming: BlockIndexEntry[],
): BlockIndexEntry[] {
  const map = new Map<string, BlockIndexEntry>();

  for (const entry of existing) {
    map.set(entry.toolCallId, entry);
  }

  for (const entry of incoming) {
    map.set(entry.toolCallId, entry);
  }

  const merged = Array.from(map.values());

  if (merged.length <= BLOCK_INDEX_MAX_ENTRIES) {
    return merged;
  }

  return merged.slice(merged.length - BLOCK_INDEX_MAX_ENTRIES);
}
```

### Step 20: Run test to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: PASS

### Step 21: Run full block-index test suite

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts
```

Expected: All tests PASS.

### Step 22: Commit

```bash
git add src/lib/runner/block-index.ts src/lib/runner/__tests__/block-index.test.ts
git commit -m "feat(pr22c): add block index utilities for compaction summaries"
```

---

## Task 2: Expand Toolcall Artifacts — Store All Args + Results

Modify `toolcall-artifacts.ts` to save args for every tool call and results for every tool call (not just oversized ones). Keep the 5KB threshold for inline truncation. Add `BlockMetadataEntry` type.

**Files:**
- Modify: `src/lib/runner/toolcall-artifacts.ts`
- Modify: `src/lib/runner/__tests__/toolcall-artifacts.test.ts`

### Step 1: Write failing tests for `saveToolcallArgs`

Add to `toolcall-artifacts.test.ts`:

```typescript
import {
  buildContextRemovedMarker,
  saveToolcallArgs,
  saveToolcallArtifact,
  saveToolcallResult,
  shouldTruncateToolResult,
  truncateOversizedParts,
  type BlockMetadataEntry,
} from "../toolcall-artifacts";

// ... (existing tests stay unchanged, but update import: saveToolcallArtifact → saveToolcallResult)

describe("saveToolcallArgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads args JSON to the toolcalls/{id}/args.json path", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    const result = await saveToolcallArgs(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-456",
      { query: "John Tan" },
    );

    expect(result).toBe("toolcalls/call-456/args.json");
    expect(supabase.from).toHaveBeenCalledWith("agent-files");
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-456/args.json",
      JSON.stringify({ query: "John Tan" }, null, 2),
      expect.objectContaining({
        upsert: true,
        contentType: "application/json; charset=utf-8",
      }),
    );
  });

  it("throws when the storage upload fails", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({
      data: null,
      error: { message: "upload failed" },
    });

    await expect(
      saveToolcallArgs(
        supabase.client as never,
        "550e8400-e29b-41d4-a716-446655440000",
        "call-456",
        { query: "John" },
      ),
    ).rejects.toThrow("upload failed");
  });
});
```

### Step 2: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```

Expected: FAIL — `saveToolcallArgs` is not exported.

### Step 3: Implement `saveToolcallArgs` and rename `saveToolcallArtifact` → `saveToolcallResult`

In `toolcall-artifacts.ts`:

1. Rename `saveToolcallArtifact` to `saveToolcallResult` (keep the same body).
2. Add `saveToolcallArgs`:

```typescript
/**
 * Saves tool call arguments to the tenant workspace for context recovery.
 */
export async function saveToolcallArgs(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  args: unknown,
): Promise<string> {
  const content = getSerializedArtifact(args);
  if (content == null) {
    throw new Error("Cannot save empty toolcall args.");
  }

  const workspacePath = `toolcalls/${toolCallId}/args.json`;
  const storagePath = `${clientId}/${workspacePath}`;
  const { error } = await supabase.storage.from(AGENT_FILES_BUCKET_ID).upload(
    storagePath,
    content,
    {
      upsert: true,
      contentType: "application/json; charset=utf-8",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return workspacePath;
}
```

3. Also export `saveToolcallResult` as the renamed version, and keep `saveToolcallArtifact` as a re-export alias for backward compatibility:

```typescript
/** @deprecated Use saveToolcallResult instead. */
export const saveToolcallArtifact = saveToolcallResult;
```

### Step 4: Update existing `saveToolcallArtifact` tests to also import `saveToolcallResult`

Existing tests can stay as-is since `saveToolcallArtifact` is a re-export. Add a quick check:

```typescript
describe("saveToolcallResult", () => {
  it("is the same function as saveToolcallArtifact (backward compat)", () => {
    expect(saveToolcallResult).toBe(saveToolcallArtifact);
  });
});
```

### Step 5: Run tests to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```

Expected: PASS

### Step 6: Write failing tests for `BlockMetadataEntry` return from `truncateOversizedParts`

Add to `toolcall-artifacts.test.ts`:

```typescript
describe("truncateOversizedParts — blockMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns blockMetadata for all tool parts with output-available state", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-small",
        toolName: "search_contacts",
        state: "output-available",
        input: { query: "John" },
        output: { contacts: [{ name: "John Doe" }] },
      },
      { type: "text", text: "Done." },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    expect(result.blockMetadata).toHaveLength(1);
    expect(result.blockMetadata[0]).toEqual(expect.objectContaining({
      toolCallId: "call-small",
      toolName: "search_contacts",
      truncated: false,
    }));
    expect(result.blockMetadata[0]!.resultSizeBytes).toBeGreaterThan(0);
  });

  it("saves args and results for ALL tool parts, not just oversized ones", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-small",
        toolName: "search_contacts",
        state: "output-available",
        input: { query: "John" },
        output: { contacts: [] },
      },
    ];

    await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    // Should have uploaded BOTH args.json and result.json for the small result
    const uploadPaths = supabase.upload.mock.calls.map((c: unknown[]) => c[0]);
    expect(uploadPaths).toContain(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-small/args.json",
    );
    expect(uploadPaths).toContain(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-small/result.json",
    );
  });

  it("marks oversized results as truncated in blockMetadata", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const parts = [
      {
        type: "tool-web_scrape",
        toolCallId: "call-large",
        toolName: "web_scrape",
        state: "output-available",
        input: { url: "https://example.com" },
        output: { blob: "x".repeat(6_000) },
      },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    expect(result.blockMetadata).toHaveLength(1);
    expect(result.blockMetadata[0]?.truncated).toBe(true);
  });
});
```

### Step 7: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```

Expected: FAIL — `blockMetadata` not in result.

### Step 8: Implement expanded `truncateOversizedParts`

Update the `TruncateOversizedPartsResult` interface and `truncateOversizedParts` function in `toolcall-artifacts.ts`:

```typescript
/** Metadata about a stored tool call block, returned alongside truncation results. */
export interface BlockMetadataEntry {
  toolCallId: string;
  toolName: string;
  argsStub: string;
  resultSizeBytes: number;
  truncated: boolean;
}

export interface TruncateOversizedPartsResult {
  parts: PersistedPart[];
  recoveryPaths: string[];
  blockMetadata: BlockMetadataEntry[];
}
```

Update `truncateOversizedParts` to:
1. Save args for EVERY tool part with `state === "output-available"` (fire-and-forget)
2. Save result for EVERY tool part with `state === "output-available"` (fire-and-forget)
3. Still only replace inline output with marker for parts >= 5KB
4. Build and return `blockMetadata` array

```typescript
const ARGS_STUB_MAX_LENGTH = 100;

export async function truncateOversizedParts(
  supabase: ChatSupabaseClient,
  clientId: string,
  parts: ReadonlyArray<PersistedPart>,
): Promise<TruncateOversizedPartsResult> {
  const blockMetadata: BlockMetadataEntry[] = [];

  const truncatedParts = await Promise.all(parts.map(async (part) => {
    if (
      part.state !== "output-available" ||
      typeof part.toolCallId !== "string" ||
      !Object.prototype.hasOwnProperty.call(part, "output")
    ) {
      return part;
    }

    const toolCallId = part.toolCallId as string;
    const output = part.output;
    const input = part.input;
    const originalSizeBytes = getSerializedSizeBytes(output);

    // Derive toolName from part.toolName or part.type ("tool-search_contacts" → "search_contacts")
    const typeStr = typeof part.type === "string" ? (part.type as string) : "";
    const toolName =
      typeof part.toolName === "string"
        ? (part.toolName as string)
        : typeStr.startsWith("tool-")
          ? typeStr.slice("tool-".length)
          : "unknown";

    // Build argsStub for block metadata
    let argsStub: string;
    try {
      argsStub = JSON.stringify(input ?? {});
    } catch {
      argsStub = "{}";
    }
    if (argsStub.length > ARGS_STUB_MAX_LENGTH) {
      argsStub = argsStub.slice(0, ARGS_STUB_MAX_LENGTH) + "...";
    }

    // Save args (fire-and-forget)
    if (input != null) {
      void saveToolcallArgs(supabase, clientId, toolCallId, input).catch((err) => {
        console.error(`[toolcall-artifacts] failed to save args for ${toolCallId}:`, err);
      });
    }

    // Save result (fire-and-forget for small, awaited for oversized since we need the path)
    const isOversized = shouldTruncateToolResult(output);

    if (isOversized) {
      const recoveryPath = await saveToolcallResult(
        supabase,
        clientId,
        toolCallId,
        output,
      );

      blockMetadata.push({
        toolCallId,
        toolName,
        argsStub,
        resultSizeBytes: originalSizeBytes,
        truncated: true,
      });

      return {
        ...part,
        output: buildContextRemovedMarker(recoveryPath, originalSizeBytes),
        recoveryPath,
      };
    }

    // Small result — still save to storage, but keep inline
    void saveToolcallResult(supabase, clientId, toolCallId, output).catch((err) => {
      console.error(`[toolcall-artifacts] failed to save result for ${toolCallId}:`, err);
    });

    blockMetadata.push({
      toolCallId,
      toolName,
      argsStub,
      resultSizeBytes: originalSizeBytes,
      truncated: false,
    });

    return part;
  }));

  const recoveryPaths = truncatedParts
    .filter(
      (part): part is PersistedPart & { recoveryPath: string } =>
        typeof part.recoveryPath === "string",
    )
    .map((part) => part.recoveryPath);

  return {
    parts: truncatedParts.map((part) => (
      typeof part.recoveryPath !== "string"
        ? part
        : Object.fromEntries(
          Object.entries(part).filter(([key]) => key !== "recoveryPath"),
        )
    )),
    recoveryPaths,
    blockMetadata,
  };
}
```

### Step 9: Run tests to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/toolcall-artifacts.test.ts
```

Expected: PASS

### Step 10: Commit

```bash
git add src/lib/runner/toolcall-artifacts.ts src/lib/runner/__tests__/toolcall-artifacts.test.ts
git commit -m "feat(pr22c): store all tool call args + results, add blockMetadata"
```

---

## Task 3: Add `<context-management>` to Platform Instructions

Add context recovery instructions to `PLATFORM_INSTRUCTIONS` so the agent knows how to recover truncated tool data.

**Files:**
- Modify: `src/lib/ai/platform-instructions.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`

### Step 1: Write failing test

Add to `system-prompt.test.ts` (which tests the assembled prompt — `PLATFORM_INSTRUCTIONS` is part of the system context):

```typescript
import { PLATFORM_INSTRUCTIONS } from "@/lib/ai/platform-instructions";

describe("PLATFORM_INSTRUCTIONS", () => {
  it("contains a context-management section", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("<context-management>");
    expect(PLATFORM_INSTRUCTIONS).toContain("</context-management>");
  });

  it("instructs agent to use read_file for context recovery", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("read_file");
    expect(PLATFORM_INSTRUCTIONS).toContain("context-removed");
  });

  it("documents args.json and result.json recovery paths", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("args.json");
    expect(PLATFORM_INSTRUCTIONS).toContain("result.json");
  });

  it("mentions block-index for post-compaction recovery", () => {
    expect(PLATFORM_INSTRUCTIONS).toContain("block-index");
  });
});
```

### Step 2: Run test to verify failure

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — `context-management` not found.

### Step 3: Add `<context-management>` section to `platform-instructions.ts`

Add the new section before `<tasks>` in `PLATFORM_INSTRUCTIONS`:

```typescript
export const PLATFORM_INSTRUCTIONS = `<platform-instructions>
<context-management>
To manage context size, some tool call data may be truncated or removed.
Truncated data is marked with a <context-removed> tag.

You MUST use read_file to recover the full data if you need it to complete your work.

When a tool result has been truncated:
  read_file(path: "toolcalls/{toolCallId}/result.json")

To read the original arguments:
  read_file(path: "toolcalls/{toolCallId}/args.json")

After thread compaction, a <block-index> section in the compaction summary lists
tool calls from prior conversation history with their IDs and tool names.
Use it to find and recover data that is no longer in context.
</context-management>

<tasks>
...rest stays the same...
```

### Step 4: Run test to verify passes

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/ai/platform-instructions.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr22c): add context-management instructions to platform instructions"
```

---

## Task 4: Update `run-persistence.ts` — Remove Recovery Note

The block index replaces `appendArtifactRecoveryNote`. Remove it and simplify.

**Files:**
- Modify: `src/lib/runner/run-persistence.ts`
- Check: `src/lib/runner/__tests__/serialization.test.ts` (if it tests `appendArtifactRecoveryNote`)

### Step 1: Check for existing tests of `appendArtifactRecoveryNote`

Search for usage of `appendArtifactRecoveryNote` in test files:

```bash
pnpm vitest run src/lib/runner/__tests__/serialization.test.ts
```

If tests exist for this function, note them. We'll update or remove them.

### Step 2: Remove `appendArtifactRecoveryNote` export and its usage

In `run-persistence.ts`:

1. Delete the `appendArtifactRecoveryNote` function (lines 47-65).
2. Update `finalizeRun` to remove the `recoveryPaths` variable and the call to `appendArtifactRecoveryNote`:

```typescript
export async function finalizeRun({
  supabase,
  clientId,
  threadId,
  runId,
  modelId,
  steps,
  text,
  totalUsage,
  logLabel,
}: FinalizeRunInput): Promise<void> {
  const rawParts = buildAssistantPartsFromSteps(steps);
  let parts: PersistedPart[] = rawParts;

  try {
    const truncatedResult = await truncateOversizedParts(supabase, clientId, rawParts);
    parts = truncatedResult.parts;
  } catch (artifactError) {
    console.error(`[${logLabel}] toolcall artifact persistence failed:`, artifactError);
  }

  const contentTextFromParts = getAssistantTextFromParts(parts);
  const fallbackContentText = typeof text === "string" ? text.trim() : "";
  const contentText = contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
  const hasNonStepParts = parts.some((part) => part.type !== "step-start");

  if (hasNonStepParts || contentText.length > 0) {
    await createMessages(supabase, [
      {
        thread_id: threadId,
        role: "assistant",
        content: contentText,
        parts: hasNonStepParts
          ? (parts as Json)
          : ([{ type: "text", text: contentText }] as Json),
      },
    ]);
  }

  await completeRun(supabase, {
    runId,
    status: "completed",
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    stepCount: steps.length,
  });

  await drainAndContinue(supabase, { clientId, threadId });
  void maybeCompactThread(supabase, clientId, threadId).catch((compactionError) => {
    console.error(`[${logLabel}] post-run compaction failed:`, compactionError);
  });
}
```

### Step 3: Update any tests that reference `appendArtifactRecoveryNote`

If `serialization.test.ts` tests this function, remove those tests. Search:

```bash
grep -r "appendArtifactRecoveryNote" src/
```

Remove all references.

### Step 4: Run all runner tests to verify nothing breaks

```bash
pnpm vitest run src/lib/runner/__tests__/
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/runner/run-persistence.ts
git commit -m "refactor(pr22c): remove appendArtifactRecoveryNote, replaced by block index"
```

---

## Task 5: Update Compaction — Block Index Integration

The core bridge between summarization and block recovery. Extract block entries from compacted messages, merge with existing index, embed in summary.

**Files:**
- Modify: `src/lib/runner/compaction.ts`
- Modify: `src/lib/runner/__tests__/compaction.test.ts`

### Step 1: Write failing test — block index extraction during compaction

Add to `compaction.test.ts`:

```typescript
import {
  parseBlockIndex,
} from "../block-index";

// Inside the "maybeCompactThread" describe block, add:

it("extracts block entries from tool parts in compacted rows and embeds them in the summary", async () => {
  mockGenerateText.mockResolvedValue({
    text: "Compacted narrative summary",
    usage: { totalTokens: 456 },
  });

  // Create 201+ rows, some with tool parts
  const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 1);
  // Add tool parts to an early message (will be in compacted range)
  messageRows[5] = {
    ...messageRows[5]!,
    parts: [
      {
        type: "tool-search_contacts",
        toolCallId: "call_abc",
        state: "output-available",
        input: { query: "John" },
        output: { contacts: [] },
      },
    ],
  };

  const supabase = createCompactionSupabaseMock({
    threadRow: {
      thread_id: createUuid(90),
      client_id: createUuid(91),
      compaction_summary: null,
      compaction_compacted_through_at: null,
      compaction_compacted_through_message_id: null,
      compaction_summary_model: null,
      compaction_summary_tokens_used: null,
    },
    messageRows,
  });

  await maybeCompactThread(
    supabase.client as never,
    createUuid(91),
    createUuid(90),
  );

  // Verify the persisted summary contains a block-index section
  const updateCall = supabase.calls.methods.find((m) => m.method === "update");
  const summaryPayload = (updateCall?.args[0] as Record<string, unknown>)?.compaction_summary as string;
  expect(summaryPayload).toContain("<block-index>");
  expect(summaryPayload).toContain("call_abc");
  expect(summaryPayload).toContain("search_contacts");
});

it("strips existing block index before passing summary to the LLM", async () => {
  mockGenerateText.mockResolvedValue({
    text: "Re-compacted summary",
    usage: { totalTokens: 222 },
  });

  const messageRows = createMessageRows(230, { sameTimestampFrom: 20 });
  const boundaryMessageId = createUuid(20);

  const existingSummaryWithIndex = [
    `${SUMMARY_PREFIX}`,
    "Earlier narrative.",
    "<block-index>",
    'call_old | search_contacts | 2026-03-06T01:00:00Z | {"query":"old"}',
    "</block-index>",
  ].join("\n");

  const supabase = createCompactionSupabaseMock({
    threadRow: {
      thread_id: createUuid(90),
      client_id: createUuid(91),
      compaction_summary: existingSummaryWithIndex,
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: boundaryMessageId,
      compaction_summary_model: "google/gemini-2.5-flash-lite",
      compaction_summary_tokens_used: 100,
    },
    messageRows,
  });

  await maybeCompactThread(
    supabase.client as never,
    createUuid(91),
    createUuid(90),
  );

  // LLM should NOT see the block-index tags
  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    prompt: expect.not.stringContaining("<block-index>"),
  }));

  // But the persisted summary SHOULD contain the merged block index
  const updateCall = supabase.calls.methods.find((m) => m.method === "update");
  const summaryPayload = (updateCall?.args[0] as Record<string, unknown>)?.compaction_summary as string;

  // Should preserve old entries
  const blockEntries = parseBlockIndex(summaryPayload);
  expect(blockEntries.some((e) => e.toolCallId === "call_old")).toBe(true);
});

it("includes block index ignore instruction in the summarizer system prompt", async () => {
  mockGenerateText.mockResolvedValue({
    text: "Summary",
    usage: { totalTokens: 100 },
  });

  const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 1);
  const supabase = createCompactionSupabaseMock({
    threadRow: {
      thread_id: createUuid(90),
      client_id: createUuid(91),
      compaction_summary: null,
      compaction_compacted_through_at: null,
      compaction_compacted_through_message_id: null,
      compaction_summary_model: null,
      compaction_summary_tokens_used: null,
    },
    messageRows,
  });

  await maybeCompactThread(
    supabase.client as never,
    createUuid(91),
    createUuid(90),
  );

  expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
    system: expect.stringContaining("Ignore any <block-index> section"),
  }));
});
```

### Step 2: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```

Expected: FAIL — summary does not contain `<block-index>`, LLM does see block-index.

### Step 3: Implement block index integration in `compaction.ts`

Add imports at top of `compaction.ts`:

```typescript
import {
  extractBlockEntriesFromParts,
  mergeBlockIndex,
  parseBlockIndex,
  serializeBlockIndex,
  stripBlockIndex,
} from "@/lib/runner/block-index";
```

Add new constant for the summarizer prompt:

```typescript
/**
 * Extra instruction appended to the summarizer system prompt to prevent
 * the LLM from incorporating the mechanical block-index metadata in its summary.
 */
export const COMPACTION_BLOCK_INDEX_INSTRUCTIONS =
  "IMPORTANT: Ignore any <block-index> section in the existing summary. " +
  "It is managed mechanically and will be appended automatically. " +
  "Focus only on summarizing the narrative conversation content.";
```

Modify `generateCompactionSummary` to include the block index instructions:

```typescript
export async function generateCompactionSummary(
  input: GenerateCompactionSummaryInput,
): Promise<GeneratedCompactionSummary> {
  const prompt = buildCompactionPrompt(input);

  if (prompt.trim().length === 0) {
    return {
      summaryText: "",
      tokensUsed: 0,
      model: COMPACTION_MODEL,
    };
  }

  const result = await generateText({
    model: gateway(COMPACTION_MODEL),
    system: `${SUMMARIZATION_PROMPT}\n\n${CRM_COMPACTION_INSTRUCTIONS}\n\n${COMPACTION_BLOCK_INDEX_INSTRUCTIONS}`,
    prompt,
  });

  return {
    summaryText: result.text,
    tokensUsed: result.usage?.totalTokens ?? 0,
    model: COMPACTION_MODEL,
  };
}
```

Modify `maybeCompactThread` to extract, merge, and embed block index:

```typescript
export async function maybeCompactThread(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
): Promise<boolean> {
  const compactionState = await fetchThreadCompactionState(supabase, threadId);

  let messageQuery = supabase
    .from("conversation_messages")
    .select("message_id, created_at, role, content, parts")
    .eq("thread_id", threadId);

  if (compactionState) {
    messageQuery = messageQuery.gte(
      "created_at",
      compactionState.compaction_compacted_through_at,
    );
  }

  const { data, error } = await messageQuery
    .order("created_at", { ascending: true })
    .order("message_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load thread messages for compaction: ${error.message}`);
  }

  const uncompactedRows = ((data as CompactionMessageRow[] | null) ?? [])
    .filter((row) => isAfterThreadCompactionBoundary(row, compactionState));

  if (uncompactedRows.length <= COMPACTION_MESSAGE_THRESHOLD) {
    return false;
  }

  const rowsToCompact = uncompactedRows.slice(
    0,
    Math.max(0, uncompactedRows.length - COMPACTION_KEEP_RECENT),
  );
  const lastCompactedRow = rowsToCompact.at(-1);

  if (!lastCompactedRow) {
    return false;
  }

  // Extract block entries from rows being compacted
  const incomingBlockEntries = rowsToCompact.flatMap((row) =>
    extractBlockEntriesFromParts(row.parts, row.created_at),
  );

  // Parse existing block index from prior compaction summary
  const existingBlockEntries = compactionState?.compaction_summary
    ? parseBlockIndex(compactionState.compaction_summary)
    : [];

  // Strip block index from existing summary before passing to summarizer LLM
  const existingSummaryForLLM = compactionState?.compaction_summary
    ? stripBlockIndex(compactionState.compaction_summary)
    : "";

  const summary = await generateCompactionSummary({
    existingSummary: existingSummaryForLLM,
    messages: rowsToCompact
      .map((row) => ({
        role: row.role,
        content: row.content ?? getTextFromParts(row.parts),
      }))
      .filter((row) => row.content.trim().length > 0),
  });

  if (summary.summaryText.trim().length === 0) {
    return false;
  }

  // Merge old + new block entries
  const mergedBlockEntries = mergeBlockIndex(existingBlockEntries, incomingBlockEntries);
  const serializedBlockIndex = serializeBlockIndex(mergedBlockEntries);

  // Build final summary: narrative prefix + LLM summary + block index
  const narrativeSummary = addSummaryPrefix(summary.summaryText);
  const prefixedSummary = serializedBlockIndex.length > 0
    ? `${narrativeSummary}\n\n${serializedBlockIndex}`
    : narrativeSummary;

  await persistThreadCompactionState(supabase, {
    threadId,
    clientId,
    summaryText: prefixedSummary,
    compactedThroughAt: lastCompactedRow.created_at,
    compactedThroughMessageId: lastCompactedRow.message_id,
    model: summary.model,
    tokensUsed: summary.tokensUsed,
  });

  return true;
}
```

### Step 4: Run tests to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/compaction.test.ts
```

Expected: PASS (all existing tests + new ones).

### Step 5: Run all runner tests to check for regressions

```bash
pnpm vitest run src/lib/runner/__tests__/
```

Expected: PASS

### Step 6: Commit

```bash
git add src/lib/runner/compaction.ts src/lib/runner/__tests__/compaction.test.ts
git commit -m "feat(pr22c): embed block index in compaction summaries"
```

---

## Task 6: Surface `<context-removed>` Markers in Text Reconstruction

Update `getTextFromParts` in `message-utils.ts` to include truncated tool output markers so the model can see which results were truncated in the live (non-compacted) window.

**Files:**
- Modify: `src/lib/runner/message-utils.ts`
- Modify: `src/lib/runner/__tests__/message-utils.test.ts`

### Step 1: Write failing test

Add to `message-utils.test.ts`:

```typescript
import { getTextFromParts } from "../message-utils";

describe("getTextFromParts", () => {
  it("extracts text from type=text parts", () => {
    const parts = [
      { type: "text", text: "Hello" },
      { type: "step-start" },
      { type: "text", text: "World" },
    ];

    expect(getTextFromParts(parts)).toBe("Hello\nWorld");
  });

  it("returns empty string for null or non-array", () => {
    expect(getTextFromParts(null)).toBe("");
    expect(getTextFromParts("not-an-array")).toBe("");
  });

  it("includes context-removed markers from truncated tool outputs", () => {
    const parts = [
      { type: "text", text: "Looking up contacts..." },
      {
        type: "tool-web_scrape",
        toolCallId: "call-large",
        state: "output-available",
        output: '<context-removed path="toolcalls/call-large/result.json" reason="Result exceeded size threshold (15000 bytes). Use read_file to recover the full content." />',
      },
      { type: "text", text: "Done." },
    ];

    const result = getTextFromParts(parts);
    expect(result).toContain("context-removed");
    expect(result).toContain("call-large");
    expect(result).toContain("Looking up contacts...");
    expect(result).toContain("Done.");
  });

  it("does not include non-truncated tool outputs in text reconstruction", () => {
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-small",
        state: "output-available",
        output: { contacts: [{ name: "John" }] },
      },
    ];

    const result = getTextFromParts(parts);
    expect(result).toBe("");
  });
});
```

### Step 2: Run test to verify failure

```bash
pnpm vitest run src/lib/runner/__tests__/message-utils.test.ts
```

Expected: FAIL — `getTextFromParts` does not include context-removed markers.

### Step 3: Implement the change

Update `getTextFromParts` in `message-utils.ts`:

```typescript
/**
 * Extracts text content from persisted DB message parts (Json column).
 * Used by context assembly and compaction to reconstruct message text from the `parts` column.
 * Also surfaces `<context-removed>` markers from truncated tool outputs so the model
 * can see which tool results were truncated within the live message window.
 */
export function getTextFromParts(parts: Json | null): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const textSegments: string[] = [];

  for (const part of parts) {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      continue;
    }

    const p = part as Record<string, unknown>;

    // Standard text parts
    if (p.type === "text" && typeof p.text === "string") {
      textSegments.push(p.text);
      continue;
    }

    // Truncated tool outputs — surface the context-removed marker
    if (
      typeof p.output === "string" &&
      p.output.includes("<context-removed")
    ) {
      textSegments.push(p.output);
    }
  }

  return textSegments.join("\n");
}
```

### Step 4: Run test to verify passes

```bash
pnpm vitest run src/lib/runner/__tests__/message-utils.test.ts
```

Expected: PASS

### Step 5: Run full runner test suite for regressions

```bash
pnpm vitest run src/lib/runner/__tests__/
```

Expected: PASS

### Step 6: Commit

```bash
git add src/lib/runner/message-utils.ts src/lib/runner/__tests__/message-utils.test.ts
git commit -m "feat(pr22c): surface context-removed markers in text reconstruction"
```

---

## Task 7: Add `<autonomous-mode>` to System Prompt

Add autonomous-mode instructions for graceful error handling during trigger-initiated runs.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`

### Step 1: Write failing test

Add to `system-prompt.test.ts`:

```typescript
describe("SYSTEM_PROMPT autonomous mode", () => {
  it("contains an autonomous-mode section", () => {
    expect(SYSTEM_PROMPT).toContain("<autonomous-mode>");
    expect(SYSTEM_PROMPT).toContain("</autonomous-mode>");
  });

  it("instructs to use send_message on persistent error", () => {
    expect(SYSTEM_PROMPT).toContain("send_message");
  });

  it("instructs to create a todo with resume details", () => {
    expect(SYSTEM_PROMPT).toContain("todo");
    expect(SYSTEM_PROMPT).toContain("resume");
  });

  it("instructs NOT to delete or disable the trigger", () => {
    expect(SYSTEM_PROMPT).toContain("Do NOT delete or disable the trigger");
  });

  it("instructs NOT to send more than one notification for the same issue", () => {
    expect(SYSTEM_PROMPT).toContain("Do NOT send more than one notification");
  });
});
```

### Step 2: Run test to verify failure

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — `autonomous-mode` not found.

### Step 3: Add `<autonomous-mode>` section to `SYSTEM_PROMPT`

Add after the closing `</memory-system>` tag in `system-prompt.ts`:

```typescript
// At the end of SYSTEM_PROMPT, before the closing backtick:

<autonomous-mode>
When running from a trigger (not interactive chat), you may not be able to
ask the user for help. If you encounter a persistent error:
1. Call send_message once with a clear description of what failed and what action is needed.
2. Create a todo with resume details so the next run can pick up where you left off.
3. Do NOT delete or disable the trigger.
4. Do NOT send more than one notification for the same issue.
</autonomous-mode>
```

### Step 4: Run test to verify passes

```bash
pnpm vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr22c): add autonomous-mode instructions to system prompt"
```

---

## Task 8: Final Integration Verification

Run the full test suite and verify all changes work together.

**Files:** None — verification only.

### Step 1: Run all affected test suites

```bash
pnpm vitest run src/lib/runner/__tests__/block-index.test.ts src/lib/runner/__tests__/toolcall-artifacts.test.ts src/lib/runner/__tests__/compaction.test.ts src/lib/runner/__tests__/message-utils.test.ts src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: All PASS.

### Step 2: Run full runner test suite

```bash
pnpm vitest run src/lib/runner/__tests__/
```

Expected: All PASS.

### Step 3: Run full AI test suite

```bash
pnpm vitest run src/lib/ai/__tests__/
```

Expected: All PASS.

### Step 4: TypeScript type check

```bash
pnpm tsc --noEmit
```

Expected: No type errors.

### Step 5: Final commit (if any adjustments were needed)

```bash
git add -A
git commit -m "chore(pr22c): final integration fixes"
```

---

## Relevant Files

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/runner/block-index.ts` | Create | Block index utilities |
| `src/lib/runner/__tests__/block-index.test.ts` | Create | Block index tests |
| `src/lib/runner/toolcall-artifacts.ts` | Modify | Store all args + results |
| `src/lib/runner/__tests__/toolcall-artifacts.test.ts` | Modify | Updated tests |
| `src/lib/ai/platform-instructions.ts` | Modify | `<context-management>` section |
| `src/lib/runner/run-persistence.ts` | Modify | Remove recovery note |
| `src/lib/runner/compaction.ts` | Modify | Block index integration |
| `src/lib/runner/__tests__/compaction.test.ts` | Modify | Block index compaction tests |
| `src/lib/runner/message-utils.ts` | Modify | Surface `<context-removed>` markers |
| `src/lib/runner/__tests__/message-utils.test.ts` | Modify | Updated tests |
| `src/lib/ai/system-prompt.ts` | Modify | `<autonomous-mode>` section |
| `src/lib/ai/__tests__/system-prompt.test.ts` | Modify | Updated tests |

## Reference Docs

- Architecture decision DATA-10: `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`
- Architecture decision SESSION-07: same file
- Tasklet context recovery: `roadmap docs/Sunder - Source of Truth/references/tasklet/11-sunder-verified-behavior-context-and-task-list.md`
- Codex compaction patterns: `roadmap docs/Sunder - Source of Truth/references/compacting/04-codex-compaction-patterns-analysis.md`
- Vercel AI SDK context management: `roadmap docs/Sunder - Source of Truth/references/compacting/03-vercel-ai-sdk-context-management.md`
