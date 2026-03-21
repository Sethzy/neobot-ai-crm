/**
 * Tests for thread queue data access.
 * @module lib/runner/__tests__/thread-queue
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { drainQueue, enqueueMessage, hasQueuedMessages } from "../thread-queue";

describe("enqueueMessage", () => {
  it("inserts a queue row with JSONB content payload", async () => {
    const client = createMockSupabaseClient({
      insertResult: { data: [], error: null },
    });

    await enqueueMessage(client as never, {
      threadId: "thread-1",
      clientId: "client-1",
      content: "Follow up on this",
      channel: "web",
    });

    const insertCall = client.calls.methods.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      thread_id: "thread-1",
      client_id: "client-1",
      channel: "web",
      content: { text: "Follow up on this", channel: "web" },
    });
  });

  it("persists trigger metadata for queued cron runs", async () => {
    const client = createMockSupabaseClient({
      insertResult: { data: [], error: null },
    });

    await enqueueMessage(client as never, {
      threadId: "thread-1",
      clientId: "client-1",
      content: "Process the most recent trigger event for this thread.",
      channel: "web",
      triggerType: "cron",
    });

    const insertCall = client.calls.methods.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      thread_id: "thread-1",
      client_id: "client-1",
      channel: "web",
      content: {
        text: "Process the most recent trigger event for this thread.",
        channel: "web",
        triggerType: "cron",
      },
    });
  });

  it("persists queued chat file parts alongside the text payload", async () => {
    const client = createMockSupabaseClient({
      insertResult: { data: [], error: null },
    });

    await enqueueMessage(client as never, {
      threadId: "thread-1",
      clientId: "client-1",
      content: "Review this screenshot",
      fileParts: [
        {
          type: "file",
          filename: "shot.png",
          mediaType: "image/png",
          url: "https://storage.example.com/chat-attachments/client-1/shot.png",
        },
      ],
    });

    const insertCall = client.calls.methods.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      thread_id: "thread-1",
      client_id: "client-1",
      channel: "web",
      content: {
        text: "Review this screenshot",
        channel: "web",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
    });
  });

  it("throws on insert failure", async () => {
    const client = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    await expect(
      enqueueMessage(client as never, {
        threadId: "thread-1",
        clientId: "client-1",
        content: "test",
      }),
    ).rejects.toThrow("Failed to enqueue message: insert failed");
  });
});

describe("drainQueue", () => {
  it("drains queued payloads via atomic rpc and preserves trigger metadata", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        drain_thread_queue: {
          data: [
            { queue_id: "q1", content: { text: "First message" }, created_at: "2026-03-01T00:00:01Z" },
            {
              queue_id: "q2",
              content: {
                text: "Process the most recent trigger event for this thread.",
                triggerType: "cron",
              },
              created_at: "2026-03-01T00:00:02Z",
            },
          ],
          error: null,
        },
      },
    });

    await expect(
      drainQueue(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toEqual([
      { text: "First message", triggerType: "chat" },
      {
        text: "Process the most recent trigger event for this thread.",
        triggerType: "cron",
      },
    ]);
  });

  it("returns empty array when queue has no rows", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        drain_thread_queue: { data: [], error: null },
      },
    });

    await expect(
      drainQueue(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toEqual([]);
  });

  it("hydrates queued chat file parts when draining rows", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        drain_thread_queue: {
          data: [
            {
              queue_id: "q1",
              content: {
                text: "Review this screenshot",
                fileParts: [
                  {
                    type: "file",
                    filename: "shot.png",
                    mediaType: "image/png",
                    url: "https://storage.example.com/chat-attachments/client-1/shot.png",
                  },
                ],
              },
              created_at: "2026-03-01T00:00:01Z",
            },
          ],
          error: null,
        },
      },
    });

    await expect(
      drainQueue(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toEqual([
      {
        text: "Review this screenshot",
        triggerType: "chat",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
    ]);
  });

  it("hydrates the queued channel when draining external chat rows", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        drain_thread_queue: {
          data: [
            {
              queue_id: "q1",
              content: {
                text: "Telegram follow up",
                channel: "telegram",
              },
              created_at: "2026-03-01T00:00:01Z",
            },
          ],
          error: null,
        },
      },
    });

    await expect(
      drainQueue(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toEqual([
      {
        text: "Telegram follow up",
        triggerType: "chat",
        channel: "telegram",
      },
    ]);
  });
});

describe("hasQueuedMessages", () => {
  it("returns true when queue has records", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: [{ queue_id: "q1" }], error: null },
    });

    await expect(
      hasQueuedMessages(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toBe(true);
  });

  it("returns false when queue is empty", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      hasQueuedMessages(client as never, { threadId: "thread-1", clientId: "client-1" }),
    ).resolves.toBe(false);
  });
});
