/**
 * Tests for runner context assembly.
 * @module lib/runner/__tests__/context
 */
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { assembleContext } from "../context";

describe("assembleContext", () => {
  it("returns the system prompt and current message when no history exists", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(result.system).toBe(SYSTEM_PROMPT);
    expect(result.messages).toEqual([{ role: "user", content: "Hello!" }]);
  });

  it("includes thread history before the current message", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "user", content: "Hi", parts: null },
          { role: "assistant", content: "Hello! How can I help?", parts: null },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Create a follow-up reminder",
    });

    expect(result.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello! How can I help?" },
      { role: "user", content: "Create a follow-up reminder" },
    ]);
  });

  it("falls back to text part content when row content is null", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            role: "assistant",
            content: null,
            parts: [{ type: "text", text: "Rendered from parts" }],
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Thanks",
    });

    expect(result.messages[0]).toEqual({
      role: "assistant",
      content: "Rendered from parts",
    });
  });

  it("throws when history query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "connection refused" } },
    });

    await expect(
      assembleContext({
        supabase: supabase as never,
        threadId: "thread-1",
        currentMessage: "Hello!",
      }),
    ).rejects.toThrow("Failed to load thread history: connection refused");
  });
});
