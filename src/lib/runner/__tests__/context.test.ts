/**
 * Tests for runner context assembly.
 * @module lib/runner/__tests__/context
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { assembleContext } from "../context";

const { mockBootstrapMemoryFiles, mockLoadMemoryContext } = vi.hoisted(() => ({
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
  mockLoadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
}));

vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));

vi.mock("@/lib/memory/loader", () => ({
  loadMemoryContext: mockLoadMemoryContext,
}));

describe("assembleContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("injects memory sections when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<soul>");
    expect(result.system).toContain("soul-content");
    expect(result.system).toContain("<user-profile>");
    expect(result.system).toContain("user-content");
    expect(result.system).toContain("<working-memory>");
    expect(result.system).toContain("memory-content");
  });

  it("bootstraps before loading memory when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(mockBootstrapMemoryFiles).toHaveBeenCalledWith(expect.anything(), "client-123");
    expect(mockLoadMemoryContext).toHaveBeenCalledWith(expect.anything(), "client-123");
    expect(mockBootstrapMemoryFiles.mock.invocationCallOrder[0]).toBeLessThan(
      mockLoadMemoryContext.mock.invocationCallOrder[0],
    );
  });

  it("does not load memory when clientId is omitted", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(mockBootstrapMemoryFiles).not.toHaveBeenCalled();
    expect(mockLoadMemoryContext).not.toHaveBeenCalled();
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

  it("does not append a synthetic user message when currentMessage is empty", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "user", content: "Persisted inbound message", parts: null },
          { role: "assistant", content: "Existing response", parts: null },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
    });

    expect(result.messages).toEqual([
      { role: "user", content: "Persisted inbound message" },
      { role: "assistant", content: "Existing response" },
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
