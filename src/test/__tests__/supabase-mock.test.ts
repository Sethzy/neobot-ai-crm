/**
 * Tests reusable Supabase mock client utilities.
 * @module test/__tests__/supabase-mock.test
 */
import { describe, expect, test } from "vitest";

import { createMockSupabaseClient } from "../mocks/supabase";

describe("createMockSupabaseClient", () => {
  test("returns a client with from()", () => {
    const client = createMockSupabaseClient();

    expect(typeof client.from).toBe("function");
  });

  test("returns configured select result", async () => {
    const rows = [{ thread_id: "thread-1", title: "Thread 1" }];
    const client = createMockSupabaseClient({
      selectResult: { data: rows, error: null },
    });

    const result = await client
      .from("conversation_threads")
      .select("*")
      .eq("client_id", "client-1")
      .order("updated_at", { ascending: false });

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
  });

  test("returns first row for single()", async () => {
    const rows = [{ thread_id: "thread-1", title: "Thread 1" }];
    const client = createMockSupabaseClient({
      insertResult: { data: rows, error: null },
    });

    const result = await client
      .from("conversation_threads")
      .insert({ client_id: "client-1", title: "Thread 1" })
      .select()
      .single();

    expect(result.data).toEqual(rows[0]);
    expect(result.error).toBeNull();
  });

  test("propagates configured errors", async () => {
    const client = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "RLS violation", code: "42501" } },
    });

    const result = await client.from("conversation_threads").select("*");

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: "RLS violation", code: "42501" });
  });

  test("supports configured rpc results", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        mark_stale_runs_failed: { data: 2, error: null },
      },
    });

    const result = await client.rpc("mark_stale_runs_failed", {
      p_thread_id: "thread-1",
      p_stale_minutes: 15,
    });

    expect(result.data).toBe(2);
    expect(result.error).toBeNull();
    expect(client.calls.rpc).toEqual([
      {
        fn: "mark_stale_runs_failed",
        args: { p_thread_id: "thread-1", p_stale_minutes: 15 },
      },
    ]);
  });
});
