import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { webSearchTool } from "../search";

afterEach(() => {
  delete process.env.BRAVE_SEARCH_API_KEY;
  vi.unstubAllGlobals();
});

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: "client-1",
    isChatContext: true,
  };
}

describe("webSearchTool", () => {
  it("returns Brave results", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: { results: [{ title: "Result", url: "https://example.com", description: "Snippet" }] },
      }),
    }));

    const result = await webSearchTool.execute({ query: "test" }, makeContext());

    expect(result).toEqual({
      success: true,
      results: [{ title: "Result", url: "https://example.com", snippet: "Snippet" }],
      count: 1,
    });
  });
});
