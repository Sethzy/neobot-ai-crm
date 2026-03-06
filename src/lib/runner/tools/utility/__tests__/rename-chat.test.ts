/**
 * Tests for the rename_chat tool.
 * @module lib/runner/tools/utility/__tests__/rename-chat
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createRenameChatTool } from "../rename-chat";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined,
} as never;

describe("rename_chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a tool with execute function", () => {
    const supabase = createMockSupabaseClient();
    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);

    expect(tool).toHaveProperty("rename_chat");
    expect(tool.rename_chat).toHaveProperty("execute");
  });

  it("updates the thread title on success", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            thread_id: THREAD_ID,
            is_pinned: false,
          },
        ],
        error: null,
      },
      updateResult: {
        data: [
          {
            thread_id: THREAD_ID,
            client_id: CLIENT_ID,
            title: "Market Analysis Bishan",
            created_at: "2026-03-05T10:00:00Z",
            updated_at: "2026-03-05T12:00:00Z",
          },
        ],
        error: null,
      },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "Market Analysis Bishan" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      title: "Market Analysis Bishan",
    });
    expect(supabase.calls.from).toEqual(["conversation_threads", "conversation_threads"]);
  });

  it("returns error on update failure", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            thread_id: THREAD_ID,
            is_pinned: false,
          },
        ],
        error: null,
      },
      updateResult: { data: null, error: { message: "update failed" } },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "New Title" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "update failed",
    });
  });

  it("returns not-found error when no thread row is updated", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "New Title" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Thread not found or access denied",
    });
  });

  it("rejects renaming the pinned autopilot thread", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [
          {
            thread_id: THREAD_ID,
            is_pinned: true,
          },
        ],
        error: null,
      },
    });

    const tool = createRenameChatTool(supabase as never, CLIENT_ID, THREAD_ID);
    const result = await tool.rename_chat.execute(
      { new_title: "Different Title" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Pinned threads cannot be renamed",
    });
  });
});
