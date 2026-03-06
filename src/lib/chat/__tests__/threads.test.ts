/**
 * Tests conversation thread data access functions.
 * @module lib/chat/__tests__/threads.test
 */
import { describe, expect, test } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  archiveThread,
  createThread,
  getThread,
  listThreads,
  updateThreadTitle,
} from "../threads";

function findMethodCall(
  client: ReturnType<typeof createMockSupabaseClient>,
  method: string,
): { method: string; args: unknown[] } | undefined {
  return client.calls.methods.find((call) => call.method === method);
}

describe("listThreads", () => {
  test("returns threads for a client ordered by updated_at desc", async () => {
    const rows = [
      {
        thread_id: "thread-1",
        client_id: "client-1",
        title: "Thread 1",
        is_pinned: false,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T01:00:00Z",
      },
    ];
    const client = createMockSupabaseClient({
      selectResult: { data: rows, error: null },
    });

    await expect(listThreads(client as never, "client-1")).resolves.toEqual(rows);
    expect(client.calls.from).toContain("conversation_threads");
    expect(findMethodCall(client, "eq")?.args).toEqual(["client_id", "client-1"]);
    expect(findMethodCall(client, "order")?.args).toEqual(["updated_at", { ascending: false }]);
  });

  test("throws on query errors", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "RLS violation" } },
    });

    await expect(listThreads(client as never, "client-1")).rejects.toThrow("RLS violation");
  });
});

describe("createThread", () => {
  test("creates a thread with explicit title", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "New Thread",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const client = createMockSupabaseClient({
      insertResult: { data: [row], error: null },
    });

    await expect(createThread(client as never, "client-1", "New Thread")).resolves.toEqual(row);
    expect(findMethodCall(client, "insert")?.args).toEqual([{ client_id: "client-1", title: "New Thread" }]);
  });

  test("creates a thread with null title by default", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: null,
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const client = createMockSupabaseClient({
      insertResult: { data: [row], error: null },
    });

    await expect(createThread(client as never, "client-1")).resolves.toEqual(row);
    expect(findMethodCall(client, "insert")?.args).toEqual([{ client_id: "client-1", title: null }]);
  });
});

describe("getThread", () => {
  test("returns thread by id", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Thread 1",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const client = createMockSupabaseClient({
      selectResult: { data: [row], error: null },
    });

    await expect(getThread(client as never, "thread-1")).resolves.toEqual(row);
    expect(findMethodCall(client, "eq")?.args).toEqual(["thread_id", "thread-1"]);
  });
});

describe("updateThreadTitle", () => {
  test("updates title and returns updated row", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Renamed",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T02:00:00Z",
    };
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ thread_id: "thread-1", is_pinned: false }],
        error: null,
      },
      updateResult: { data: [row], error: null },
    });

    await expect(updateThreadTitle(client as never, "thread-1", "Renamed")).resolves.toEqual(row);
    expect(findMethodCall(client, "update")?.args).toEqual([{ title: "Renamed" }]);
    expect(client.calls.from).toEqual(["conversation_threads", "conversation_threads"]);
  });

  test("rejects renaming pinned threads", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ thread_id: "thread-1", is_pinned: true }],
        error: null,
      },
    });

    await expect(updateThreadTitle(client as never, "thread-1", "Renamed")).rejects.toThrow(
      "Pinned threads cannot be renamed",
    );
  });
});

describe("archiveThread", () => {
  test("archives a non-pinned thread", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Chat",
      is_pinned: false,
      is_archived: true,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T02:00:00Z",
    };
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ thread_id: "thread-1", is_pinned: false }],
        error: null,
      },
      updateResult: { data: [row], error: null },
    });

    await expect(archiveThread(client as never, "thread-1")).resolves.toEqual(row);
    expect(findMethodCall(client, "update")?.args).toEqual([{ is_archived: true }]);
    expect(client.calls.from).toEqual(["conversation_threads", "conversation_threads"]);
  });

  test("rejects archiving pinned threads", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ thread_id: "thread-1", is_pinned: true }],
        error: null,
      },
    });

    await expect(archiveThread(client as never, "thread-1")).rejects.toThrow(
      "Pinned threads cannot be archived",
    );
  });
});
