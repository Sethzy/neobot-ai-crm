/**
 * Tests for persisted toolcall artifact handling.
 * @module lib/runner/__tests__/toolcall-artifacts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildContextRemovedMarker,
  saveToolcallArtifact,
  shouldTruncateToolResult,
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

describe("shouldTruncateToolResult", () => {
  it("returns false for nullish values", () => {
    expect(shouldTruncateToolResult(null)).toBe(false);
    expect(shouldTruncateToolResult(undefined)).toBe(false);
  });

  it("returns false for small string and object payloads", () => {
    expect(shouldTruncateToolResult("short")).toBe(false);
    expect(shouldTruncateToolResult({ ok: true, contacts: [] })).toBe(false);
  });

  it("returns true when a payload reaches the artifact threshold", () => {
    expect(shouldTruncateToolResult("x".repeat(5_000))).toBe(true);
  });
});

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
  it("includes the recovery path and reason", () => {
    const marker = buildContextRemovedMarker("toolcalls/call-123/result.json", 6_200);

    expect(marker).toContain("<context-removed");
    expect(marker).toContain('path="toolcalls/call-123/result.json"');
    expect(marker).toContain("6200 bytes");
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
      output: expect.stringContaining('path="toolcalls/call-large/result.json"'),
    }));
    expect(parts[0]).toEqual(expect.objectContaining({
      output: {
        blob: "x".repeat(6_000),
      },
    }));
  });
});
