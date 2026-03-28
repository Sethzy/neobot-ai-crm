/**
 * Integration test: thread serialization (run lock) and queue drain pipeline.
 * Tests create_run_if_idle atomicity, enqueue/drain, and concurrent run rejection
 * against real Postgres via local Supabase.
 *
 * Skipped automatically when local Supabase is not running.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { createRun, completeRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { enqueueMessage, drainQueue, hasQueuedMessages } from "@/lib/runner/thread-queue";

import { cleanupAll, cleanupAuthUsers } from "./helpers/cleanup";
import { seedClient, seedThread, type SeededClient, type SeededThread } from "./helpers/seed";
import {
  createServiceClient,
  isSupabaseRunning,
  type TestSupabaseClient,
} from "./helpers/supabase-local";

const canRun = await isSupabaseRunning();

let supabase: TestSupabaseClient;
let client: SeededClient;
let thread: SeededThread;

beforeAll(async () => {
  supabase = createServiceClient();
});

afterAll(async () => {
  if (canRun) {
    await cleanupAll(supabase);
    await cleanupAuthUsers(supabase);
  }
});

beforeEach(async () => {
  if (!canRun) return;
  await cleanupAll(supabase);
  await cleanupAuthUsers(supabase);
  client = await seedClient(supabase);
  thread = await seedThread(supabase, client.clientId);
});

describe.runIf(canRun)("Thread Serialization — Run Lock", () => {
  it("creates a run when thread is idle", async () => {
    const result = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });

    expect(result.created).toBe(true);
    if (result.created) {
      expect(result.runId).toBeTruthy();
    }

    // Verify run exists in DB
    const { data } = await supabase
      .from("runs")
      .select("run_id, status, run_type")
      .eq("thread_id", thread.threadId)
      .eq("status", "running")
      .single();

    expect(data).toBeTruthy();
    expect(data!.status).toBe("running");
    expect(data!.run_type).toBe("chat");
  });

  it("rejects a second run on the same thread", async () => {
    const first = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(first.created).toBe(true);

    const second = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(second.created).toBe(false);
  });

  it("allows a new run after the first completes", async () => {
    const first = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(first.created).toBe(true);
    if (!first.created) throw new Error("Expected first run to be created");

    await completeRun(supabase, {
      runId: first.runId,
      status: "completed",
      model: "test-model",
      tokensIn: 100,
      tokensOut: 50,
    });

    const second = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(second.created).toBe(true);
  });

  it("marks stale runs as failed", async () => {
    // Insert a run with old created_at via raw query
    const { data: run } = await supabase
      .from("runs")
      .insert({
        thread_id: thread.threadId,
        client_id: client.clientId,
        status: "running",
        run_type: "chat",
        created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago
      })
      .select("run_id")
      .single();

    expect(run).toBeTruthy();

    const count = await markStaleRunsFailed(supabase, {
      threadId: thread.threadId,
      staleMinutes: 15,
    });

    expect(count).toBe(1);

    // Verify it's now failed
    const { data: updated } = await supabase
      .from("runs")
      .select("status")
      .eq("run_id", run!.run_id)
      .single();

    expect(updated!.status).toBe("failed");
  });

  it("sequential createRun calls — only first wins while running", async () => {
    const first = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(first.created).toBe(true);

    const second = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(second.created).toBe(false);

    const third = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(third.created).toBe(false);

    // Verify only one running row exists
    const { data } = await supabase
      .from("runs")
      .select("run_id")
      .eq("thread_id", thread.threadId)
      .eq("status", "running");

    expect(data).toHaveLength(1);
  });
});

describe.runIf(canRun)("Thread Queue — Enqueue and Drain", () => {
  it("enqueues a message and drains it", async () => {
    await enqueueMessage(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      content: "Hello from the queue",
    });

    const hasMessages = await hasQueuedMessages(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(hasMessages).toBe(true);

    const drained = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });

    expect(drained).toHaveLength(1);
    expect(drained[0].text).toBe("Hello from the queue");
    expect(drained[0].triggerType).toBe("chat");
  });

  it("drains multiple messages in FIFO order", async () => {
    for (const msg of ["first", "second", "third"]) {
      await enqueueMessage(supabase, {
        threadId: thread.threadId,
        clientId: client.clientId,
        content: msg,
      });
    }

    const drained = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });

    expect(drained).toHaveLength(3);
    expect(drained.map((d) => d.text)).toEqual(["first", "second", "third"]);
  });

  it("drain is atomic — second drain returns empty", async () => {
    await enqueueMessage(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      content: "once",
    });

    const first = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(first).toHaveLength(1);

    const second = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(second).toHaveLength(0);

    const hasMessages = await hasQueuedMessages(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(hasMessages).toBe(false);
  });

  it("preserves triggerType and channel in queued messages", async () => {
    await enqueueMessage(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      content: "cron message",
      channel: "telegram",
      triggerType: "cron",
    });

    const drained = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });

    expect(drained).toHaveLength(1);
    expect(drained[0].triggerType).toBe("cron");
    expect(drained[0].channel).toBe("telegram");
  });

  it("queue isolation — draining thread A doesn't affect thread B", async () => {
    const threadB = await seedThread(supabase, client.clientId, {
      title: "Thread B",
    });

    await enqueueMessage(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      content: "thread A message",
    });

    await enqueueMessage(supabase, {
      threadId: threadB.threadId,
      clientId: client.clientId,
      content: "thread B message",
    });

    const drainedA = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(drainedA).toHaveLength(1);
    expect(drainedA[0].text).toBe("thread A message");

    // Thread B still has its message
    const drainedB = await drainQueue(supabase, {
      threadId: threadB.threadId,
      clientId: client.clientId,
    });
    expect(drainedB).toHaveLength(1);
    expect(drainedB[0].text).toBe("thread B message");
  });
});

describe.runIf(canRun)("Full Serialization Pipeline", () => {
  it("run lock → enqueue while busy → complete → drain", async () => {
    // Start a run
    const run = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(run.created).toBe(true);
    if (!run.created) throw new Error("Expected run to be created");

    // Second message arrives while run is active — gets queued
    await enqueueMessage(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      content: "follow-up while busy",
    });

    // Complete the first run
    await completeRun(supabase, {
      runId: run.runId,
      status: "completed",
      model: "test-model",
      tokensIn: 100,
      tokensOut: 50,
    });

    // Drain the queue
    const drained = await drainQueue(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
    });
    expect(drained).toHaveLength(1);
    expect(drained[0].text).toBe("follow-up while busy");

    // Now a new run can be created for the drained message
    const followUpRun = await createRun(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      runType: "chat",
    });
    expect(followUpRun.created).toBe(true);
  });
});
