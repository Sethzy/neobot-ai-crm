/**
 * Tests conversation thread data access functions.
 * @module lib/chat/__tests__/threads.test
 */
import { describe, expect, test } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  archiveThread,
  createThread,
  ensureMainThreadForClient,
  getPrimaryThread,
  getThread,
  listThreads,
  markThreadRead,
  updateThreadTitle,
} from "../threads";

function findMethodCall(
  client: ReturnType<typeof createMockSupabaseClient>,
  method: string,
): { method: string; args: unknown[] } | undefined {
  return client.calls.methods.find((call) => call.method === method);
}

describe("listThreads", () => {
  test("returns threads for a client ordered with primary first, then pinned, then updated_at desc", async () => {
    const rows = [
      {
        thread_id: "thread-primary",
        client_id: "client-1",
        title: "Main",
        is_primary: true,
        is_pinned: true,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T02:00:00Z",
      },
      {
        thread_id: "thread-1",
        client_id: "client-1",
        title: "Thread 1",
        is_primary: false,
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
    expect(client.calls.methods.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["is_primary", { ascending: false }] },
      { method: "order", args: ["is_pinned", { ascending: false }] },
      { method: "order", args: ["updated_at", { ascending: false }] },
    ]);
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

describe("getPrimaryThread", () => {
  test("returns the primary thread for a client", async () => {
    const row = {
      thread_id: "thread-primary",
      client_id: "client-1",
      title: "Agent",
      is_primary: true,
      is_pinned: true,
      is_archived: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const client = createMockSupabaseClient({
      selectResult: { data: [row], error: null },
    });

    await expect(getPrimaryThread(client as never, "client-1")).resolves.toEqual(row);
    expect(client.calls.from).toContain("conversation_threads");
    const eqCalls = client.calls.methods.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["client_id", "client-1"] });
    expect(eqCalls).toContainEqual({ method: "eq", args: ["is_primary", true] });
  });

  test("returns null when no primary thread exists", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(getPrimaryThread(client as never, "client-1")).resolves.toBeNull();
  });

  test("throws on query errors", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "DB error" } },
    });

    await expect(getPrimaryThread(client as never, "client-1")).rejects.toThrow("DB error");
  });
});

describe("ensureMainThreadForClient", () => {
  test("repairs or creates the main thread through the bootstrap rpc and returns the row", async () => {
    const row = {
      thread_id: "thread-primary",
      client_id: "client-1",
      title: "Main",
      is_primary: true,
      is_pinned: true,
      is_archived: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const client = createMockSupabaseClient({
      rpcResults: {
        ensure_main_thread_for_client: { data: "thread-primary", error: null },
      },
      selectResult: { data: [row], error: null },
    });

    await expect(ensureMainThreadForClient(client as never, "client-1")).resolves.toEqual(row);
    expect(client.calls.rpc).toContainEqual({
      fn: "ensure_main_thread_for_client",
      args: { p_client_id: "client-1" },
    });
  });
});

describe("listThreads - primary inclusion", () => {
  test("does not filter the primary thread out of the query", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await listThreads(client as never, "client-1");
    const eqCalls = client.calls.methods.filter((c) => c.method === "eq");
    expect(eqCalls).not.toContainEqual({ method: "eq", args: ["is_primary", false] });
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

describe("markThreadRead", () => {
  test("updates last_read_at and returns the updated row", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Chat",
      is_primary: false,
      is_pinned: false,
      is_archived: false,
      source_type: "chat",
      last_read_at: "2026-04-22T10:05:00Z",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-04-22T10:00:00Z",
    };
    const client = createMockSupabaseClient({
      updateResult: { data: [row], error: null },
    });

    await expect(
      markThreadRead(client as never, "thread-1", "2026-04-22T10:05:00Z"),
    ).resolves.toEqual(row);

    expect(findMethodCall(client, "update")?.args).toEqual([
      { last_read_at: "2026-04-22T10:05:00Z" },
    ]);
  });
});
