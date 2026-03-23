/**
 * Tests for block storage of tool call args and results.
 * @module lib/storage/__tests__/tool-blocks
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveToolcallBlock, serializeToolOutput } from "@/lib/storage/tool-blocks";

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

describe("serializeToolOutput", () => {
  it("returns string as-is", () => {
    expect(serializeToolOutput("hello")).toBe("hello");
  });

  it("returns null for null input", () => {
    expect(serializeToolOutput(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(serializeToolOutput(undefined)).toBeNull();
  });

  it("JSON-serializes objects with indentation", () => {
    const result = serializeToolOutput({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
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
