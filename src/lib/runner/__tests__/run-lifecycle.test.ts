/**
 * Tests run lifecycle data access helpers.
 * @module lib/runner/__tests__/run-lifecycle
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { completeRun, createRun, markStaleRunsFailed } from "../run-lifecycle";

describe("createRun", () => {
  it("returns created run id when lock can be claimed", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        create_run_if_idle: { data: "run-1", error: null },
      },
    });

    await expect(
      createRun(client as never, {
        threadId: "thread-1",
        clientId: "client-1",
      }),
    ).resolves.toEqual({ created: true, runId: "run-1" });
  });

  it("returns created false when thread is already running", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        create_run_if_idle: { data: null, error: null },
      },
    });

    await expect(
      createRun(client as never, {
        threadId: "thread-1",
        clientId: "client-1",
      }),
    ).resolves.toEqual({ created: false });
  });

  it("throws on create_run_if_idle rpc failure", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        create_run_if_idle: { data: null, error: { message: "rpc failed" } },
      },
    });

    await expect(
      createRun(client as never, {
        threadId: "thread-1",
        clientId: "client-1",
      }),
    ).rejects.toThrow("Failed to create run: rpc failed");
  });
});

describe("completeRun", () => {
  it("updates run status, usage, and completed timestamp", async () => {
    const client = createMockSupabaseClient({
      updateResult: { data: [], error: null },
    });

    await completeRun(client as never, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
    });

    expect(client.calls.from).toContain("runs");
    const updateCall = client.calls.methods.find((call) => call.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        model: "google/gemini-3-flash",
        tokens_in: 100,
        tokens_out: 50,
      }),
    );
  });

  it("throws on update failure", async () => {
    const client = createMockSupabaseClient({
      updateResult: { data: null, error: { message: "not found" } },
    });

    await expect(
      completeRun(client as never, {
        runId: "run-1",
        status: "failed",
        model: "google/gemini-3-flash",
        tokensIn: 0,
        tokensOut: 0,
      }),
    ).rejects.toThrow("Failed to complete run: not found");
  });
});

describe("markStaleRunsFailed", () => {
  it("calls stale cleanup rpc for one thread", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        mark_stale_runs_failed: { data: 2, error: null },
      },
    });

    await expect(markStaleRunsFailed(client as never, { threadId: "thread-1" })).resolves.toBe(2);
    expect(client.calls.rpc).toContainEqual({
      fn: "mark_stale_runs_failed",
      args: { p_thread_id: "thread-1", p_stale_minutes: 15 },
    });
  });

  it("throws on stale cleanup rpc failure", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        mark_stale_runs_failed: { data: null, error: { message: "fn missing" } },
      },
    });

    await expect(markStaleRunsFailed(client as never, { threadId: "thread-1" })).rejects.toThrow(
      "Failed to mark stale runs: fn missing",
    );
  });
});
