/**
 * Tests for persisted toolcall artifact handling.
 * @module lib/runner/__tests__/toolcall-artifacts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildContextRemovedMarker,
  saveToolcallArtifact,
  saveToolcallBlock,
  truncateOversizedParts,
} from "../toolcall-artifacts";

function createStorageSupabaseMock() {
  const upload = vi.fn();
  const from = vi.fn(() => ({ upload }));

  return {
    client: {
      storage: {
        from,
      },
    },
    upload,
    from,
  };
}

describe("saveToolcallArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads JSON content into the existing agent-files bucket and returns a workspace-relative path", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    const result = await saveToolcallArtifact(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-123",
      { success: true, deals: [] },
    );

    expect(result).toBe("toolcalls/call-123/result.json");
    expect(supabase.from).toHaveBeenCalledWith("agent-files");
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-123/result.json",
      JSON.stringify({ success: true, deals: [] }, null, 2),
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
      saveToolcallArtifact(
        supabase.client as never,
        "550e8400-e29b-41d4-a716-446655440000",
        "call-123",
        { success: true },
      ),
    ).rejects.toThrow("upload failed");
  });
});

describe("buildContextRemovedMarker", () => {
  it("produces a context-removed marker with size info and path", () => {
    const marker = buildContextRemovedMarker("toolcalls/call-abc/result.json", 50_000);

    expect(marker).toContain("<context-removed>");
    expect(marker).toContain("</context-removed>");
    expect(marker).toContain("Data truncated: 49KB -> 5KB");
    expect(marker).toContain("path: /agent/toolcalls/call-abc/result.json");
  });

  it("does not double-prefix already-absolute /agent/ paths", () => {
    const marker = buildContextRemovedMarker("/agent/toolcalls/call-abc/result.json", 50_000);

    expect(marker).toContain("path: /agent/toolcalls/call-abc/result.json");
    expect(marker).not.toContain("/agent//agent/");
  });
});

describe("saveToolcallBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads both args.json and result.json to the toolcalls directory", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      { query: "John" },
      { success: true, contacts: [{ name: "John Tan" }] },
    );

    expect(supabase.upload).toHaveBeenCalledTimes(2);
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-abc/args.json",
      expect.any(String),
      expect.objectContaining({ upsert: true }),
    );
    expect(supabase.upload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000/toolcalls/call-abc/result.json",
      expect.any(String),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("skips args upload when args is nullish", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      null,
      { success: true },
    );

    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledWith(
      expect.stringContaining("result.json"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("skips result upload when result is nullish", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      { query: "John" },
      null,
    );

    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledWith(
      expect.stringContaining("args.json"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("does nothing when both args and result are nullish", async () => {
    const supabase = createStorageSupabaseMock();

    await saveToolcallBlock(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      "call-abc",
      null,
      null,
    );

    expect(supabase.upload).not.toHaveBeenCalled();
  });
});

describe("truncateOversizedParts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves small tool outputs unchanged and returns no recovery paths", async () => {
    const supabase = createStorageSupabaseMock();
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-small",
        state: "output-available",
        output: { contacts: [{ name: "John Doe" }] },
      },
      { type: "text", text: "Done." },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    expect(result).toEqual({
      parts,
      recoveryPaths: [],
    });
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  it("replaces oversized tool outputs with a marker and reports recovery paths", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-large",
        state: "output-available",
        output: {
          blob: "x".repeat(6_000),
        },
      },
      { type: "text", text: "Done." },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    expect(result.recoveryPaths).toEqual(["toolcalls/call-large/result.json"]);
    expect(result.parts[0]).toEqual(expect.objectContaining({
      type: "tool-search_contacts",
      toolCallId: "call-large",
      state: "output-available",
      output: expect.stringContaining("path: /agent/toolcalls/call-large/result.json"),
    }));
    expect(parts[0]).toEqual(expect.objectContaining({
      output: {
        blob: "x".repeat(6_000),
      },
    }));
  });

  it("keeps the first ~5KB of content inline before the truncation marker (HEAD truncation)", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const oversizedContent = "LINE_" + "x".repeat(6_000);
    const parts = [
      {
        type: "tool-web_scrape",
        toolCallId: "call-scrape",
        state: "output-available",
        output: oversizedContent,
      },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    const truncatedOutput = result.parts[0].output as string;

    // Should contain the start of the original content (HEAD preserved)
    expect(truncatedOutput).toContain("LINE_");

    // Should still have the context-removed marker with recovery path
    expect(truncatedOutput).toContain("<context-removed>");
    expect(truncatedOutput).toContain("path: /agent/toolcalls/call-scrape/result.json");

    // The HEAD portion should be roughly 5KB — at least 4KB but not the full 6KB
    const markerStart = truncatedOutput.indexOf("<context-removed>");
    const headPortion = truncatedOutput.slice(0, markerStart);
    expect(headPortion.length).toBeGreaterThanOrEqual(4_000);
    expect(headPortion.length).toBeLessThanOrEqual(5_100);
  });

  it("HEAD truncation works with JSON object outputs", async () => {
    const supabase = createStorageSupabaseMock();
    supabase.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    const parts = [
      {
        type: "tool-search_contacts",
        toolCallId: "call-json",
        state: "output-available",
        output: {
          success: true,
          contacts: Array.from({ length: 200 }, (_, i) => ({
            name: `Contact ${i}`,
            phone: `+6591234${String(i).padStart(3, "0")}`,
          })),
        },
      },
    ];

    const result = await truncateOversizedParts(
      supabase.client as never,
      "550e8400-e29b-41d4-a716-446655440000",
      parts,
    );

    const truncatedOutput = result.parts[0].output as string;

    // Should contain the beginning of the JSON (HEAD preserved)
    expect(truncatedOutput).toContain('"success": true');
    expect(truncatedOutput).toContain("Contact 0");

    // Should end with the truncation marker
    expect(truncatedOutput).toContain("<context-removed>");
    expect(truncatedOutput).toContain("path: /agent/toolcalls/call-json/result.json");
  });
});
