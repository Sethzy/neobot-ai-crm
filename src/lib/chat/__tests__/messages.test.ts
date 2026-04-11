/**
 * Tests conversation message data access functions.
 * @module lib/chat/__tests__/messages.test
 */
import { describe, expect, test } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  createMessage,
  createMessages,
  listMessages,
  upsertMessage,
} from "../messages";

function findMethodCall(
  client: ReturnType<typeof createMockSupabaseClient>,
  method: string,
): { method: string; args: unknown[] } | undefined {
  return client.calls.methods.find((call) => call.method === method);
}

describe("listMessages", () => {
  test("returns thread messages ordered chronologically", async () => {
    const rows = [
      {
        message_id: "message-1",
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: [{ type: "text", text: "Hello" }],
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        message_id: "message-2",
        thread_id: "thread-1",
        role: "assistant",
        content: "Hi there!",
        parts: [{ type: "text", text: "Hi there!" }],
        created_at: "2026-03-01T00:00:01Z",
      },
    ];

    const client = createMockSupabaseClient({
      selectResult: { data: rows, error: null },
    });

    await expect(listMessages(client as never, "thread-1")).resolves.toEqual(rows);
    expect(client.calls.from).toContain("conversation_messages");
    expect(findMethodCall(client, "eq")?.args).toEqual(["thread_id", "thread-1"]);
    expect(findMethodCall(client, "order")?.args).toEqual(["created_at", { ascending: true }]);
  });

  test("throws on query errors", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "thread not found" } },
    });

    await expect(listMessages(client as never, "thread-1")).rejects.toThrow("thread not found");
  });
});

describe("createMessage", () => {
  test("creates one message and returns it", async () => {
    const row = {
      message_id: "message-1",
      thread_id: "thread-1",
      role: "assistant",
      content: "Saved response",
      parts: [{ type: "text", text: "Saved response" }],
      created_at: "2026-03-01T00:00:01Z",
    };
    const client = createMockSupabaseClient({
      insertResult: { data: [row], error: null },
    });

    await expect(
      createMessage(client as never, {
        thread_id: "thread-1",
        role: "assistant",
        content: "Saved response",
        parts: [{ type: "text", text: "Saved response" }],
      }),
    ).resolves.toEqual(row);

    expect(findMethodCall(client, "insert")?.args).toEqual([
      {
        thread_id: "thread-1",
        role: "assistant",
        content: "Saved response",
        parts: [{ type: "text", text: "Saved response" }],
      },
    ]);
  });
});

describe("createMessages", () => {
  test("creates message batch and returns inserted rows", async () => {
    const rows = [
      {
        message_id: "message-1",
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: [{ type: "text", text: "Hello" }],
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        message_id: "message-2",
        thread_id: "thread-1",
        role: "assistant",
        content: "Hi there!",
        parts: [{ type: "text", text: "Hi there!" }],
        created_at: "2026-03-01T00:00:01Z",
      },
    ];
    const client = createMockSupabaseClient({
      insertResult: { data: rows, error: null },
    });

    const payload = [
      {
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        thread_id: "thread-1",
        role: "assistant",
        content: "Hi there!",
        parts: [{ type: "text", text: "Hi there!" }],
      },
    ];

    await expect(createMessages(client as never, payload)).resolves.toEqual(rows);
    expect(findMethodCall(client, "insert")?.args).toEqual([[
      expect.objectContaining(payload[0]),
      expect.objectContaining(payload[1]),
    ]]);
  });
});

describe("upsertMessage", () => {
  test("upserts a message keyed by source_event_id", async () => {
    const row = {
      message_id: "msg-1",
      thread_id: "thread-1",
      role: "assistant",
      content: null,
      parts: [{ type: "text", text: "Hello" }],
      source_event_id: "evt_terminal",
      created_at: "2026-04-11T00:00:00Z",
    };
    const client = createMockSupabaseClient({
      insertResult: { data: row, error: null },
    });

    const result = await upsertMessage(client as never, {
      thread_id: "thread-1",
      role: "assistant",
      content: null,
      parts: [{ type: "text", text: "Hello" }],
      source_event_id: "evt_terminal",
    });

    expect(result).toEqual(row);
    const upsertCall = findMethodCall(client, "upsert");
    expect(upsertCall).toBeDefined();
    // Verify the payload includes the source_event_id and that the
    // upsert call uses onConflict: "source_event_id" so reruns of the
    // same terminal event become a no-op rather than a duplicate row.
    expect(upsertCall?.args[0]).toMatchObject({
      thread_id: "thread-1",
      role: "assistant",
      source_event_id: "evt_terminal",
    });
    expect(upsertCall?.args[1]).toMatchObject({
      onConflict: "source_event_id",
      ignoreDuplicates: false,
    });
  });

  test("throws on database error", async () => {
    const client = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "RLS denied" } },
    });
    await expect(
      upsertMessage(client as never, {
        thread_id: "thread-1",
        role: "assistant",
        content: null,
        parts: [],
        source_event_id: "evt_1",
      }),
    ).rejects.toThrow(/RLS denied/);
  });
});
