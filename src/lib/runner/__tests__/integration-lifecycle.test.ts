/**
 * Integration tests for the full runner lifecycle pipeline.
 *
 * Exercises: runAgent → streamText → finalizeRun → drainAndContinue → maybeCompactThread
 * with real module wiring and a stateful in-memory Supabase mock. Only external
 * boundaries (AI SDK, analytics, composio, env flags) are mocked.
 *
 * @module lib/runner/__tests__/integration-lifecycle
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Json } from "@/types/database";

// ---------------------------------------------------------------------------
// 1) Stateful in-memory Supabase mock
// ---------------------------------------------------------------------------

interface InMemoryRow {
  [key: string]: unknown;
}

interface InMemoryTables {
  runs: InMemoryRow[];
  conversation_messages: InMemoryRow[];
  thread_queue_records: InMemoryRow[];
  conversation_threads: InMemoryRow[];
}

function createUuid(): string {
  return crypto.randomUUID();
}

/**
 * Creates a stateful in-memory Supabase client that tracks table rows and
 * implements RPCs with realistic locking/drain semantics.
 */
function createStatefulSupabase(seed?: Partial<InMemoryTables>) {
  const tables: InMemoryTables = {
    runs: [],
    conversation_messages: [],
    thread_queue_records: [],
    conversation_threads: [],
    ...seed,
  };

  /** Build a chainable query builder for a specific table. */
  function buildChain(tableName: keyof InMemoryTables) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let insertPayload: InMemoryRow[] = [];
    let updatePayload: InMemoryRow = {};
    let filters: Array<{ column: string; op: string; value: unknown }> = [];
    let selectColumns = "*";
    let orderBy: Array<{ column: string; ascending: boolean }> = [];
    let limitN: number | null = null;

    function applyFilters(rows: InMemoryRow[]): InMemoryRow[] {
      let result = rows;
      for (const f of filters) {
        result = result.filter((row) => {
          if (f.op === "eq") return row[f.column] === f.value;
          if (f.op === "neq") return row[f.column] !== f.value;
          if (f.op === "gte") return (row[f.column] as string) >= (f.value as string);
          if (f.op === "is") return row[f.column] === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(row[f.column]);
          return true;
        });
      }
      return result;
    }

    function applyOrderAndLimit(rows: InMemoryRow[]): InMemoryRow[] {
      let result = [...rows];
      for (const o of orderBy) {
        result.sort((a, b) => {
          const va = String(a[o.column] ?? "");
          const vb = String(b[o.column] ?? "");
          return o.ascending ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }
      if (limitN !== null) {
        result = result.slice(0, limitN);
      }
      return result;
    }

    const chain: Record<string, unknown> = {
      select: (cols?: string) => { selectColumns = cols ?? "*"; return chain; },
      insert: (rows: InMemoryRow | InMemoryRow[]) => {
        op = "insert";
        insertPayload = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      update: (payload: InMemoryRow) => {
        op = "update";
        updatePayload = payload;
        return chain;
      },
      delete: () => { op = "delete"; return chain; },
      eq: (col: string, val: unknown) => { filters.push({ column: col, op: "eq", value: val }); return chain; },
      neq: (col: string, val: unknown) => { filters.push({ column: col, op: "neq", value: val }); return chain; },
      gte: (col: string, val: unknown) => { filters.push({ column: col, op: "gte", value: val }); return chain; },
      is: (col: string, val: unknown) => { filters.push({ column: col, op: "is", value: val }); return chain; },
      in: (col: string, val: unknown[]) => { filters.push({ column: col, op: "in", value: val }); return chain; },
      not: () => chain,
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy.push({ column: col, ascending: opts?.ascending ?? true });
        return chain;
      },
      limit: (n: number) => { limitN = n; return chain; },
      range: () => chain,
      single: async () => {
        const result = await resolveQuery();
        const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data: row, error: result.error };
      },
      maybeSingle: async () => {
        const result = await resolveQuery();
        const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data: row, error: null };
      },
      then: async (onfulfilled?: (value: { data: unknown; error: null }) => unknown) => {
        const result = await resolveQuery();
        if (!onfulfilled) return result;
        return onfulfilled(result as { data: unknown; error: null });
      },
    };

    async function resolveQuery() {
      const table = tables[tableName];

      if (op === "insert") {
        const inserted: InMemoryRow[] = [];
        for (const row of insertPayload) {
          const newRow: InMemoryRow = {
            ...row,
            created_at: row.created_at ?? new Date().toISOString(),
          };
          // Auto-generate primary keys
          if (tableName === "conversation_messages" && !newRow.message_id) {
            newRow.message_id = createUuid();
          }
          if (tableName === "thread_queue_records" && !newRow.queue_id) {
            newRow.queue_id = createUuid();
          }
          if (tableName === "runs" && !newRow.run_id) {
            newRow.run_id = createUuid();
          }
          table.push(newRow);
          inserted.push(newRow);
        }
        return { data: inserted, error: null };
      }

      if (op === "update") {
        const matched = applyFilters(table);
        for (const row of matched) {
          Object.assign(row, updatePayload);
        }
        return { data: matched, error: null };
      }

      if (op === "delete") {
        const before = table.length;
        const keep: InMemoryRow[] = [];
        const removed: InMemoryRow[] = [];
        for (const row of table) {
          if (applyFilters([row]).length > 0) {
            removed.push(row);
          } else {
            keep.push(row);
          }
        }
        tables[tableName] = keep;
        return { data: removed, error: null };
      }

      // select
      const filtered = applyFilters(table);
      const ordered = applyOrderAndLimit(filtered);
      return { data: ordered, error: null };
    }

    return chain;
  }

  /** Implements the three critical RPC functions with realistic behavior. */
  async function rpc(fn: string, args?: Record<string, unknown>) {
    if (fn === "create_run_if_idle") {
      const threadId = args?.p_thread_id as string;
      const clientId = args?.p_client_id as string;
      const runType = args?.p_run_type as string;
      const hasActiveRun = tables.runs.some(
        (r) => r.thread_id === threadId && r.status === "running",
      );
      if (hasActiveRun) {
        return { data: null, error: null };
      }
      const runId = createUuid();
      tables.runs.push({
        run_id: runId,
        thread_id: threadId,
        client_id: clientId,
        run_type: runType ?? "chat",
        status: "running",
        created_at: new Date().toISOString(),
        completed_at: null,
        model: null,
        tokens_in: null,
        tokens_out: null,
        step_count: null,
        prompt_tokens: null,
        parent_run_id: null,
      });
      return { data: runId, error: null };
    }

    if (fn === "mark_stale_runs_failed") {
      const threadId = args?.p_thread_id as string | undefined;
      const staleMinutes = (args?.p_stale_minutes as number) ?? 15;
      const cutoff = Date.now() - staleMinutes * 60 * 1000;
      let count = 0;
      for (const r of tables.runs) {
        if (
          r.status === "running" &&
          (!threadId || r.thread_id === threadId) &&
          new Date(r.created_at as string).getTime() < cutoff
        ) {
          r.status = "failed";
          r.completed_at = new Date().toISOString();
          count++;
        }
      }
      return { data: count, error: null };
    }

    if (fn === "drain_thread_queue") {
      const threadId = args?.p_thread_id as string;
      const clientId = args?.p_client_id as string;
      const matched = tables.thread_queue_records.filter(
        (r) => r.thread_id === threadId && r.client_id === clientId,
      );
      // Sort by created_at
      matched.sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)),
      );
      // Remove drained rows
      tables.thread_queue_records = tables.thread_queue_records.filter(
        (r) => !(r.thread_id === threadId && r.client_id === clientId),
      );
      return {
        data: matched.map((r) => ({
          queue_id: r.queue_id,
          content: r.content,
          created_at: r.created_at,
        })),
        error: null,
      };
    }

    return { data: null, error: null };
  }

  const client = {
    from: (tableName: string) => buildChain(tableName as keyof InMemoryTables),
    rpc,
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        download: async () => ({ data: null, error: { message: "not found" } }),
        upload: async () => ({ data: { path: "mock" }, error: null }),
      }),
    },
    /** Direct access to in-memory tables for test assertions. */
    _tables: tables,
  };

  return client;
}

// ---------------------------------------------------------------------------
// 2) External boundary mocks (AI SDK, analytics, composio, env)
// ---------------------------------------------------------------------------

/** Captures the onFinish/onError callbacks so tests can trigger them manually. */
let capturedOnFinish: ((...args: unknown[]) => Promise<void>) | null = null;
let capturedOnError: ((...args: unknown[]) => Promise<void>) | null = null;

const mockStreamText = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
  capturedOnFinish = opts.onFinish as typeof capturedOnFinish;
  capturedOnError = opts.onError as typeof capturedOnError;
  // Return a minimal stream result that mimics the AI SDK shape
  return {
    textStream: (async function* () { yield "Hello"; })(),
    text: Promise.resolve("Hello from Sunder"),
    toDataStreamResponse: () => new Response("stream"),
    consumeStream: async () => {},
  };
});
const mockStepCountIs = vi.fn(() => vi.fn(() => true));
const mockGateway = vi.fn(() => "mock-model");
const mockGetLanguageModel = vi.fn((modelId: string) => `language-model:${modelId}`);
const mockGenerateText = vi.fn().mockResolvedValue({
  text: "## User Instructions\nNone\n## Workflow\nTest summary\n## Resources\nNone\n## Current Focus\nContinue",
  usage: { totalTokens: 500 },
});
const mockLoadSystemPromptState = vi.fn().mockResolvedValue({
  userSkills: [],
  compactionState: null,
});
const mockGetServerEnv = vi.fn();
const mockCaptureServerEvent = vi.fn().mockResolvedValue(undefined);
const mockCaptureServerEvents = vi.fn().mockResolvedValue(undefined);

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: (...args: unknown[]) => mockStepCountIs(...args),
  hasToolCall: () => () => false,
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  convertToModelMessages: (msgs: unknown[]) =>
    (msgs as { role: string; content: string }[]).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content,
    })),
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: (...args: unknown[]) => mockGateway(...args),
  getLanguageModel: (...args: unknown[]) => mockGetLanguageModel(...args),
  gatewayProviderOptions: {},
  TIER_1_MODEL: "google/gemini-3-flash",
  COMPACTION_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: (...args: unknown[]) => mockCaptureServerEvents(...args),
  getPostHogServer: () => null,
}));

vi.mock("@/lib/runner/context", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    system: "You are Sunder, a helpful AI agent.",
    messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  }),
  loadSystemPromptState: (...args: unknown[]) => mockLoadSystemPromptState(...args),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: (...args: unknown[]) => mockGetServerEnv(...args),
  _resetForTesting: vi.fn(),
}));

vi.mock("@/lib/runner/tool-registry", () => ({
  createRunnerTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: vi.fn(() => ({})),
  createConnectionTools: vi.fn(() => ({})),
  createMarketTools: vi.fn(() => ({})),
  createListingTools: vi.fn(() => ({})),
  createBrowserTools: vi.fn(() => ({})),
  createStorageTools: vi.fn(() => ({})),
  createSubagentTool: vi.fn(() => ({})),
  createWebTools: vi.fn(() => ({})),
  createUtilityTools: vi.fn(() => ({})),
  createTriggerTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/crm/config", () => ({
  loadCrmConfig: vi.fn().mockResolvedValue({ config: {} }),
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveConnections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/composio", () => ({
  loadActivatedConnectionTools: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/supabase/property-env", () => ({
  isPropertySupabaseConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/browser-use/client", () => ({
  isBrowserUseConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/usage/message-quota", () => ({
  consumeMessageQuota: vi.fn().mockResolvedValue({ allowed: true, clientId: "c1", periodStart: "2026-03-01" }),
  releaseMessageQuota: vi.fn().mockResolvedValue(undefined),
  messageQuotaErrorCodes: { limitReached: "message-quota-exceeded", loadFailed: "message-quota-load-failed" },
  MessageQuotaError: class MessageQuotaError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
  hasExternalDeliverables: vi.fn(() => false),
}));

vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: vi.fn().mockResolvedValue({ success: true, status: "created" }),
  expireApprovalEvent: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/storage/tool-blocks", () => ({
  saveToolcallBlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/tracing", () => ({
  propagateAttributes: vi.fn((_attrs: unknown, fn: () => unknown) => fn()),
  getActiveTraceId: () => "mock-trace-id",
}));

vi.mock("@json-render/core", () => ({
  SPEC_DATA_PART_TYPE: "data-spec",
}));

// ---------------------------------------------------------------------------
// 3) Import real modules under test (after all mocks)
// ---------------------------------------------------------------------------
const { runAgent } = await import("@/lib/runner/run-agent");
type RunnerPayload = import("@/lib/runner/schemas").RunnerPayload;

// ---------------------------------------------------------------------------
// 4) Test constants
// ---------------------------------------------------------------------------
const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

function makePayload(overrides: Partial<RunnerPayload> = {}): RunnerPayload {
  return {
    clientId: CLIENT_ID,
    threadId: THREAD_ID,
    triggerType: "chat",
    input: "Hello, Sunder!",
    ...overrides,
  };
}

/** Flush microtask queue to let fire-and-forget promises settle. */
function flushPromises(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedThread(supabase: ReturnType<typeof createStatefulSupabase>) {
  supabase._tables.conversation_threads.push({
    thread_id: THREAD_ID,
    client_id: CLIENT_ID,
    title: "Test thread",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_archived: false,
    is_pinned: false,
    is_primary: true,
    context_reset_at: null,
    compaction_summary: null,
    compaction_compacted_through_at: null,
    compaction_compacted_through_message_id: null,
    compaction_summary_model: null,
    compaction_summary_tokens_used: 0,
  });
}

// ---------------------------------------------------------------------------
// 5) Tests
// ---------------------------------------------------------------------------

describe("Runner Integration: full lifecycle", () => {
  let supabase: ReturnType<typeof createStatefulSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({ SANDBOX_GOLDEN_SNAPSHOT_ID: "" });
    capturedOnFinish = null;
    capturedOnError = null;
    supabase = createStatefulSupabase();
    seedThread(supabase);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path: runAgent → streamText → onFinish → finalizeRun → complete
  // -------------------------------------------------------------------------
  it("completes full run lifecycle: lock → stream → finalize → complete", async () => {
    const result = await runAgent(makePayload(), supabase as never);

    expect(result.status).toBe("streaming");

    // A running row should exist
    const runningRuns = supabase._tables.runs.filter((r) => r.status === "running");
    expect(runningRuns).toHaveLength(1);
    const runId = runningRuns[0]!.run_id as string;

    // User message should be persisted
    const userMessages = supabase._tables.conversation_messages.filter(
      (m) => m.role === "user",
    );
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]!.thread_id).toBe(THREAD_ID);

    // Simulate streamText finishing successfully
    expect(capturedOnFinish).not.toBeNull();
    await capturedOnFinish!({
      text: "Hello! How can I help you today?",
      steps: [{ text: "Hello! How can I help you today?", toolCalls: [], toolResults: [] }],
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    });

    // Run should be completed
    const completedRun = supabase._tables.runs.find((r) => r.run_id === runId);
    expect(completedRun!.status).toBe("completed");
    expect(completedRun!.tokens_in).toBe(100);
    expect(completedRun!.tokens_out).toBe(50);
    expect(completedRun!.step_count).toBe(1);

    // Assistant message should be persisted
    const assistantMessages = supabase._tables.conversation_messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]!.content).toBe("Hello! How can I help you today?");

    // Queue should be empty (drainAndContinue found nothing)
    expect(supabase._tables.thread_queue_records).toHaveLength(0);

    // Analytics captured
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "agent_run_completed",
        properties: expect.objectContaining({ run_id: runId }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Thread serialization: second call queued, drain starts follow-up
  // -------------------------------------------------------------------------
  it("queues second message when thread is busy, then drains on completion", async () => {
    // First run — acquires the lock
    const result1 = await runAgent(makePayload({ input: "First message" }), supabase as never);
    expect(result1.status).toBe("streaming");
    expect(supabase._tables.runs.filter((r) => r.status === "running")).toHaveLength(1);

    // Second call while first run is active — should be queued
    const result2 = await runAgent(
      makePayload({ input: "Second message" }),
      supabase as never,
    );
    expect(result2.status).toBe("queued");
    expect(supabase._tables.thread_queue_records).toHaveLength(1);
    expect(supabase._tables.thread_queue_records[0]!.content).toEqual(
      expect.objectContaining({ text: "Second message" }),
    );

    // No second running row — lock prevented it
    expect(supabase._tables.runs.filter((r) => r.status === "running")).toHaveLength(1);

    // Complete the first run — this triggers drainAndContinue which starts a follow-up
    await capturedOnFinish!({
      text: "Response to first",
      steps: [{ text: "Response to first", toolCalls: [], toolResults: [] }],
      totalUsage: { inputTokens: 80, outputTokens: 40 },
    });

    // Queue should be drained
    expect(supabase._tables.thread_queue_records).toHaveLength(0);

    // Two runs total: first completed, second is from the drain follow-up
    expect(supabase._tables.runs).toHaveLength(2);
    const firstRun = supabase._tables.runs[0]!;
    expect(firstRun.status).toBe("completed");

    // The second run was created by drainAndContinue → runAgent
    const secondRun = supabase._tables.runs[1]!;
    expect(secondRun.status).toBe("running");
    expect(secondRun.thread_id).toBe(THREAD_ID);
  });

  // -------------------------------------------------------------------------
  // Compaction triggers when prompt tokens exceed threshold
  // -------------------------------------------------------------------------
  it("triggers compaction when prompt tokens exceed 85% of context window", async () => {
    // Seed enough messages so compaction has rows to process
    for (let i = 0; i < 90; i++) {
      supabase._tables.conversation_messages.push({
        message_id: createUuid(),
        thread_id: THREAD_ID,
        created_at: new Date(Date.now() - (90 - i) * 60_000).toISOString(),
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Historical message ${i}`,
        parts: null,
      });
    }

    const result = await runAgent(makePayload(), supabase as never);
    expect(result.status).toBe("streaming");

    // Trigger onFinish with a very high promptTokens value (>85% of 1M)
    await capturedOnFinish!({
      text: "Response after long conversation",
      steps: [{ text: "Response after long conversation", toolCalls: [], toolResults: [] }],
      totalUsage: { inputTokens: 860_000, outputTokens: 200 },
    });

    // Compaction is fire-and-forget (void promise) — flush microtasks to let it settle
    await flushPromises();

    // Run should be completed
    const completedRuns = supabase._tables.runs.filter((r) => r.status === "completed");
    expect(completedRuns.length).toBeGreaterThanOrEqual(1);

    // generateText should have been called for the compaction summary
    expect(mockGenerateText).toHaveBeenCalled();

    // Thread should have compaction state persisted
    const thread = supabase._tables.conversation_threads.find(
      (t) => t.thread_id === THREAD_ID,
    );
    expect(thread!.compaction_summary).toBeTruthy();
    expect(thread!.compaction_compacted_through_at).toBeTruthy();
    expect(thread!.compaction_compacted_through_message_id).toBeTruthy();
    expect(thread!.compaction_summary_model).toBe("google/gemini-3-flash");
  });

  // -------------------------------------------------------------------------
  // No compaction when token count is below threshold
  // -------------------------------------------------------------------------
  it("skips compaction when prompt tokens are below threshold", async () => {
    const result = await runAgent(makePayload(), supabase as never);
    expect(result.status).toBe("streaming");

    await capturedOnFinish!({
      text: "Short conversation",
      steps: [{ text: "Short conversation", toolCalls: [], toolResults: [] }],
      totalUsage: { inputTokens: 5_000, outputTokens: 100 },
    });

    // generateText should NOT be called (no compaction needed)
    expect(mockGenerateText).not.toHaveBeenCalled();

    // Thread compaction state should remain null
    const thread = supabase._tables.conversation_threads.find(
      (t) => t.thread_id === THREAD_ID,
    );
    expect(thread!.compaction_summary).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Failed run: onError marks run as failed
  // -------------------------------------------------------------------------
  it("records failed run when streamText fires onError", async () => {
    const result = await runAgent(makePayload(), supabase as never);
    expect(result.status).toBe("streaming");

    const runId = supabase._tables.runs.find((r) => r.status === "running")!.run_id;

    // Simulate stream error
    expect(capturedOnError).not.toBeNull();
    await capturedOnError!({ error: new Error("Model rate limited") });

    // Run should be marked as failed
    const failedRun = supabase._tables.runs.find((r) => r.run_id === runId);
    expect(failedRun!.status).toBe("failed");
    expect(failedRun!.tokens_in).toBe(0);
    expect(failedRun!.tokens_out).toBe(0);

    // Analytics event recorded
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "agent_run_failed",
        properties: expect.objectContaining({
          run_id: runId,
          error_stage: "stream",
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Pulse trigger: does not queue when lock fails
  // -------------------------------------------------------------------------
  it("returns queued for pulse trigger without enqueuing when lock fails", async () => {
    // Create a pre-existing running row to block the lock
    supabase._tables.runs.push({
      run_id: createUuid(),
      thread_id: THREAD_ID,
      client_id: CLIENT_ID,
      run_type: "chat",
      status: "running",
      created_at: new Date().toISOString(),
      completed_at: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      step_count: null,
      prompt_tokens: null,
      parent_run_id: null,
    });

    const result = await runAgent(
      makePayload({ triggerType: "pulse", input: "Autopilot pulse" }),
      supabase as never,
    );

    expect(result.status).toBe("queued");
    // Pulse should NOT enqueue — it silently skips
    expect(supabase._tables.thread_queue_records).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Stale run cleanup before lock acquisition
  // -------------------------------------------------------------------------
  it("marks stale runs as failed before acquiring lock", async () => {
    // Pre-seed a stale running row (created 20 minutes ago)
    supabase._tables.runs.push({
      run_id: createUuid(),
      thread_id: THREAD_ID,
      client_id: CLIENT_ID,
      run_type: "chat",
      status: "running",
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      completed_at: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      step_count: null,
      prompt_tokens: null,
      parent_run_id: null,
    });

    const result = await runAgent(makePayload(), supabase as never);
    expect(result.status).toBe("streaming");

    // Stale run should be failed
    const staleRun = supabase._tables.runs[0]!;
    expect(staleRun.status).toBe("failed");

    // New run should be running
    const newRun = supabase._tables.runs[1]!;
    expect(newRun.status).toBe("running");
  });

  // -------------------------------------------------------------------------
  // Multi-message queue drain with batching
  // -------------------------------------------------------------------------
  it("batches multiple text-only queued messages into one follow-up run", async () => {
    // Start first run
    await runAgent(makePayload({ input: "First" }), supabase as never);

    // Queue multiple messages while busy
    await runAgent(makePayload({ input: "Second" }), supabase as never);
    await runAgent(makePayload({ input: "Third" }), supabase as never);
    expect(supabase._tables.thread_queue_records).toHaveLength(2);

    // Complete first run — drain should batch the two queued messages
    await capturedOnFinish!({
      text: "Done with first",
      steps: [{ text: "Done with first", toolCalls: [], toolResults: [] }],
      totalUsage: { inputTokens: 50, outputTokens: 20 },
    });

    // Queue should be fully drained
    expect(supabase._tables.thread_queue_records).toHaveLength(0);

    // A follow-up run should have been created from the batched drain
    const followUpRuns = supabase._tables.runs.filter(
      (r) => r.status === "running",
    );
    expect(followUpRuns).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Run with tool calls in steps
  // -------------------------------------------------------------------------
  it("persists assistant message with tool call parts from steps", async () => {
    await runAgent(makePayload(), supabase as never);

    await capturedOnFinish!({
      text: "I found 3 contacts.",
      steps: [
        {
          text: "",
          toolCalls: [{
            toolCallId: "tc-1",
            toolName: "search_contacts",
            args: { query: "John" },
          }],
          toolResults: [{
            toolCallId: "tc-1",
            toolName: "search_contacts",
            result: { success: true, data: [] },
          }],
        },
        {
          text: "I found 3 contacts.",
          toolCalls: [],
          toolResults: [],
        },
      ],
      totalUsage: { inputTokens: 200, outputTokens: 80 },
    });

    const assistantMsg = supabase._tables.conversation_messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe("I found 3 contacts.");

    // Parts should include tool-call and tool-result structured data
    const parts = assistantMsg!.parts as unknown[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts!.length).toBeGreaterThan(0);

    // Run should be completed with 2 steps
    const run = supabase._tables.runs.find((r) => r.status === "completed");
    expect(run!.step_count).toBe(2);
  });
});
