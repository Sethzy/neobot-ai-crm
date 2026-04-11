import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { webScrapeTool } from "../scrape";

afterEach(() => {
  delete process.env.EXA_API_KEY;
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

describe("webScrapeTool", () => {
  it("returns extracted content", async () => {
    process.env.EXA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", title: "Example", text: "Hello" }],
      }),
    }));

    const result = await webScrapeTool.execute(
      { url: "https://example.com" },
      makeContext(),
    );

    expect(result).toEqual({
      success: true,
      url: "https://example.com",
      title: "Example",
      content: "Hello",
    });
  });
});
