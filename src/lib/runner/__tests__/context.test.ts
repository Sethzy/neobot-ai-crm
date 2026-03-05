/**
 * Tests for runner context assembly.
 * @module lib/runner/__tests__/context
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { assembleContext } from "../context";

const {
  mockBootstrapMemoryFiles,
  mockLoadMemoryContext,
  mockBuildSystemReminder,
  mockFetchThreadCompactionState,
} = vi.hoisted(() => ({
  mockBootstrapMemoryFiles: vi.fn().mockResolvedValue(undefined),
  mockLoadMemoryContext: vi.fn().mockResolvedValue({
    soul: "soul-content",
    user: "user-content",
    memory: "memory-content",
  }),
  mockBuildSystemReminder: vi.fn().mockResolvedValue(
    "<system-reminder>\nCurrent time: 2026-03-05 14:30:00 UTC\nOpen todos: 0\n</system-reminder>",
  ),
  mockFetchThreadCompactionState: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));

vi.mock("@/lib/memory/loader", () => ({
  loadMemoryContext: mockLoadMemoryContext,
}));

vi.mock("@/lib/runner/system-reminder", () => ({
  buildSystemReminder: mockBuildSystemReminder,
}));

vi.mock("@/lib/runner/compaction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runner/compaction")>();
  return {
    ...actual,
    fetchThreadCompactionState: mockFetchThreadCompactionState,
  };
});

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

  it("assembles system string in 7-layer order when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    const platformIdx = result.system.indexOf("<platform-instructions>");
    const sunderIdx = result.system.indexOf("You are Sunder");
    const soulIdx = result.system.indexOf("<soul>");
    const userIdx = result.system.indexOf("<user-profile>");
    const memoryIdx = result.system.indexOf("<working-memory>");
    const reminderIdx = result.system.indexOf("<system-reminder>");

    expect(platformIdx).toBeLessThan(sunderIdx);
    expect(sunderIdx).toBeLessThan(soulIdx);
    expect(soulIdx).toBeLessThan(userIdx);
    expect(userIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(reminderIdx);
  });

  it("includes platform instructions before system prompt when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    const platformIndex = result.system.indexOf("<platform-instructions>");
    const systemPromptIndex = result.system.indexOf("You are Sunder");

    expect(platformIndex).toBeGreaterThanOrEqual(0);
    expect(systemPromptIndex).toBeGreaterThan(platformIndex);
  });

  it("includes system-reminder at the end of the system string when clientId is provided", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).toContain("<system-reminder>");

    const reminderIndex = result.system.indexOf("<system-reminder>");
    const memoryIndex = result.system.indexOf("<working-memory>");
    expect(reminderIndex).toBeGreaterThan(memoryIndex);
  });

  it("injects a compaction summary between working memory and the system reminder", async () => {
    mockFetchThreadCompactionState.mockResolvedValueOnce({
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: "Older thread summary",
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-3-flash",
      compaction_summary_tokens_used: 99,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    const memoryIndex = result.system.indexOf("<working-memory>");
    const compactionIndex = result.system.indexOf("<compaction-summary>");
    const reminderIndex = result.system.indexOf("<system-reminder>");

    expect(compactionIndex).toBeGreaterThan(memoryIndex);
    expect(compactionIndex).toBeLessThan(reminderIndex);
    expect(result.system).toContain("Older thread summary");
  });

  it("does not inject a compaction block when the thread has no summary", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(result.system).not.toContain("<compaction-summary>");
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

  it("passes clientId and threadId to buildSystemReminder", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(mockBuildSystemReminder).toHaveBeenCalledWith(
      expect.anything(),
      "client-123",
      "thread-1",
    );
    expect(mockFetchThreadCompactionState).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
    );
  });

  it("does not include platform instructions or system-reminder when clientId is omitted", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
    });

    expect(result.system).not.toContain("<platform-instructions>");
    expect(result.system).not.toContain("<system-reminder>");
    expect(mockBuildSystemReminder).not.toHaveBeenCalled();
  });

  it("injects run-specific instructions after the system prompt and before memory layers", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
      instructions: "Custom autopilot instructions",
    });

    const systemPromptIndex = result.system.indexOf("You are Sunder");
    const instructionsIndex = result.system.indexOf("Custom autopilot instructions");
    const soulIndex = result.system.indexOf("<soul>");

    expect(instructionsIndex).toBeGreaterThan(systemPromptIndex);
    expect(instructionsIndex).toBeLessThan(soulIndex);
  });

  it("injects run-specific instructions when memory is not loaded", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      instructions: "Custom autopilot instructions",
    });

    expect(result.system).toContain("Custom autopilot instructions");
  });

  it("caps history query to the latest 50 messages", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "order", args: ["created_at", { ascending: false }] },
        { method: "order", args: ["message_id", { ascending: false }] },
        { method: "limit", args: [50] },
      ]),
    );
  });

  it("queries messages from the compaction cutoff timestamp onward when a summary exists", async () => {
    mockFetchThreadCompactionState.mockResolvedValueOnce({
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: "Older thread summary",
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-3-flash",
      compaction_summary_tokens_used: 99,
    });
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "Hello!",
      clientId: "client-123",
    });

    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "gte", args: ["created_at", "2026-03-06T02:00:00.000Z"] },
      ]),
    );
  });

  it("enforces a maximum history window of 50 messages even if more rows are returned", async () => {
    const historyRows = Array.from({ length: 60 }, (_, index) => {
      const newestFirstIndex = 60 - index;
      return {
        role: newestFirstIndex % 2 === 0 ? "assistant" : "user",
        content: `Message ${newestFirstIndex}`,
        parts: null,
      };
    });

    const supabase = createMockSupabaseClient({
      selectResult: {
        data: historyRows,
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
      clientId: "client-123",
    });

    expect(result.messages).toHaveLength(50);
    expect(result.messages[0]).toEqual({ role: "user", content: "Message 11" });
    expect(result.messages[49]).toEqual({ role: "assistant", content: "Message 60" });
  });

  it("includes thread history before the current message", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "assistant", content: "Hello! How can I help?", parts: null },
          { role: "user", content: "Hi", parts: null },
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

  it("filters out the compacted-through boundary message while keeping later messages at the same timestamp", async () => {
    mockFetchThreadCompactionState.mockResolvedValueOnce({
      thread_id: "thread-1",
      client_id: "client-123",
      compaction_summary: "Older thread summary",
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "message-2",
      compaction_summary_model: "google/gemini-3-flash",
      compaction_summary_tokens_used: 99,
    });
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            message_id: "message-4",
            created_at: "2026-03-06T02:05:00.000Z",
            role: "assistant",
            content: "Newest response",
            parts: null,
          },
          {
            message_id: "message-3",
            created_at: "2026-03-06T02:00:00.000Z",
            role: "user",
            content: "Keep me",
            parts: null,
          },
          {
            message_id: "message-2",
            created_at: "2026-03-06T02:00:00.000Z",
            role: "assistant",
            content: "Drop me",
            parts: null,
          },
        ],
        error: null,
      },
    });

    const result = await assembleContext({
      supabase: supabase as never,
      threadId: "thread-1",
      currentMessage: "",
      clientId: "client-123",
    });

    expect(result.messages).toEqual([
      { role: "user", content: "Keep me" },
      { role: "assistant", content: "Newest response" },
    ]);
  });

  it("does not append a synthetic user message when currentMessage is empty", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          { role: "assistant", content: "Existing response", parts: null },
          { role: "user", content: "Persisted inbound message", parts: null },
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
