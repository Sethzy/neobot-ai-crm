/**
 * Integration test: thread compaction state persistence and boundary filtering.
 * Tests fetchThreadCompactionState, persistThreadCompactionState,
 * and isAfterThreadCompactionBoundary against real Postgres.
 *
 * Skipped automatically when local Supabase is not running.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import {
  fetchThreadCompactionState,
  persistThreadCompactionState,
  isAfterThreadCompactionBoundary,
  SUMMARY_PREFIX,
} from "@/lib/runner/compaction";

import { cleanupAll, cleanupAuthUsers } from "./helpers/cleanup";
import {
  seedClient,
  seedThread,
  seedMessages,
  type SeededClient,
  type SeededThread,
} from "./helpers/seed";
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

describe.runIf(canRun)("Compaction State — Persistence", () => {
  it("fetchThreadCompactionState returns null for a fresh thread", async () => {
    const state = await fetchThreadCompactionState(supabase, thread.threadId);
    expect(state).toBeNull();
  });

  it("persistThreadCompactionState writes and returns valid state", async () => {
    // Insert a message to use as compaction boundary
    await seedMessages(supabase, thread.threadId, [
      { role: "user", content: "Hello" },
    ]);

    // Get the message's created_at
    const { data: msg } = await supabase
      .from("conversation_messages")
      .select("created_at")
      .eq("message_id", messageIds[0])
      .single();

    const state = await persistThreadCompactionState(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      summaryText: `${SUMMARY_PREFIX}\n## User Instructions\nTest summary`,
      compactedThroughAt: msg!.created_at,
      compactedThroughMessageId: messageIds[0],
      model: "test-model",
      tokensUsed: 500,
    });

    expect(state.thread_id).toBe(thread.threadId);
    expect(state.client_id).toBe(client.clientId);
    expect(state.compaction_summary).toContain("Test summary");
    expect(state.compaction_compacted_through_message_id).toBe(messageIds[0]);
    expect(state.compaction_summary_model).toBe("test-model");
    expect(state.compaction_summary_tokens_used).toBe(500);
  });

  it("fetchThreadCompactionState reads back persisted state", async () => {
    await seedMessages(supabase, thread.threadId, [
      { role: "user", content: "Hello" },
    ]);

    const { data: msg } = await supabase
      .from("conversation_messages")
      .select("created_at")
      .eq("message_id", messageIds[0])
      .single();

    await persistThreadCompactionState(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      summaryText: `${SUMMARY_PREFIX}\nPersisted summary`,
      compactedThroughAt: msg!.created_at,
      compactedThroughMessageId: messageIds[0],
      model: "gemini-flash",
      tokensUsed: 1200,
    });

    const fetched = await fetchThreadCompactionState(supabase, thread.threadId);
    expect(fetched).not.toBeNull();
    expect(fetched!.compaction_summary).toContain("Persisted summary");
    expect(fetched!.compaction_summary_model).toBe("gemini-flash");
    expect(fetched!.compaction_summary_tokens_used).toBe(1200);
  });

  it("persistThreadCompactionState updates existing state (rolling forward)", async () => {
    await seedMessages(supabase, thread.threadId, [
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Reply 1" },
      { role: "user", content: "Message 2" },
    ]);

    const { data: msgs } = await supabase
      .from("conversation_messages")
      .select("message_id, created_at")
      .eq("thread_id", thread.threadId)
      .order("created_at", { ascending: true });

    // First compaction — through message 1
    await persistThreadCompactionState(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      summaryText: `${SUMMARY_PREFIX}\nFirst compaction`,
      compactedThroughAt: msgs![0].created_at,
      compactedThroughMessageId: msgs![0].message_id,
      model: "test-model",
      tokensUsed: 300,
    });

    // Second compaction — through message 2 (rolls forward)
    await persistThreadCompactionState(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      summaryText: `${SUMMARY_PREFIX}\nRolled forward compaction`,
      compactedThroughAt: msgs![1].created_at,
      compactedThroughMessageId: msgs![1].message_id,
      model: "test-model",
      tokensUsed: 600,
    });

    const fetched = await fetchThreadCompactionState(supabase, thread.threadId);
    expect(fetched!.compaction_summary).toContain("Rolled forward");
    expect(fetched!.compaction_compacted_through_message_id).toBe(msgs![1].message_id);
    expect(fetched!.compaction_summary_tokens_used).toBe(600);
  });
});

describe.runIf(canRun)("Compaction Boundary — Message Filtering", () => {
  it("isAfterThreadCompactionBoundary filters messages correctly", async () => {
    // Seed messages with explicit timestamps to control ordering
    const baseTime = new Date("2026-01-15T10:00:00Z");
    await seedMessages(supabase, thread.threadId, [
      { role: "user", content: "Old message 1", created_at: new Date(baseTime.getTime()).toISOString() },
      { role: "assistant", content: "Old reply", created_at: new Date(baseTime.getTime() + 1000).toISOString() },
      { role: "user", content: "Boundary message", created_at: new Date(baseTime.getTime() + 2000).toISOString() },
      { role: "assistant", content: "New reply", created_at: new Date(baseTime.getTime() + 3000).toISOString() },
      { role: "user", content: "Newest message", created_at: new Date(baseTime.getTime() + 4000).toISOString() },
    ]);

    // Get all messages with their timestamps
    const { data: allMsgs } = await supabase
      .from("conversation_messages")
      .select("message_id, created_at, content")
      .eq("thread_id", thread.threadId)
      .order("created_at", { ascending: true });

    // Set compaction boundary at the 3rd message (index 2)
    const boundaryMsg = allMsgs![2];
    await persistThreadCompactionState(supabase, {
      threadId: thread.threadId,
      clientId: client.clientId,
      summaryText: `${SUMMARY_PREFIX}\nTest boundary`,
      compactedThroughAt: boundaryMsg.created_at,
      compactedThroughMessageId: boundaryMsg.message_id,
      model: "test-model",
      tokensUsed: 100,
    });

    const compactionState = await fetchThreadCompactionState(supabase, thread.threadId);
    expect(compactionState).not.toBeNull();

    // Messages before boundary — should be filtered out
    expect(
      isAfterThreadCompactionBoundary(allMsgs![0], compactionState),
    ).toBe(false);
    expect(
      isAfterThreadCompactionBoundary(allMsgs![1], compactionState),
    ).toBe(false);

    // Boundary message itself — should be filtered out (not strictly after)
    expect(
      isAfterThreadCompactionBoundary(allMsgs![2], compactionState),
    ).toBe(false);

    // Messages after boundary — should pass through
    expect(
      isAfterThreadCompactionBoundary(allMsgs![3], compactionState),
    ).toBe(true);
    expect(
      isAfterThreadCompactionBoundary(allMsgs![4], compactionState),
    ).toBe(true);
  });

  it("all messages pass when no compaction state exists", async () => {
    const messageIds = await seedMessages(supabase, thread.threadId, [
      { role: "user", content: "Message" },
    ]);

    const { data: msg } = await supabase
      .from("conversation_messages")
      .select("message_id, created_at")
      .eq("message_id", messageIds[0])
      .single();

    expect(isAfterThreadCompactionBoundary(msg!, null)).toBe(true);
    expect(isAfterThreadCompactionBoundary(msg!, undefined)).toBe(true);
  });
});

describe.runIf(canRun)("Compaction State — DB Constraint", () => {
  it("rejects partial compaction state (consistency constraint)", async () => {
    // Try to set only compaction_summary without the other fields
    const { error } = await supabase
      .from("conversation_threads")
      .update({ compaction_summary: "orphan summary" })
      .eq("thread_id", thread.threadId);

    // Should fail the conversation_threads_compaction_state_consistent CHECK constraint
    expect(error).toBeTruthy();
    expect(error!.message).toContain("conversation_threads_compaction_state_consistent");
  });
});
