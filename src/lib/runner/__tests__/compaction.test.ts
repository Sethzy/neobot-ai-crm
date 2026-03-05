/**
 * Tests for thread compaction helpers and constants.
 * @module lib/runner/__tests__/compaction
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

const {
  mockGenerateText,
  mockGateway,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockGateway: vi.fn(() => "mock-model"),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

import {
  ARTIFACT_SIZE_THRESHOLD_BYTES,
  COMPACTION_KEEP_RECENT,
  COMPACTION_MESSAGE_THRESHOLD,
  CRM_COMPACTION_INSTRUCTIONS,
  fetchThreadCompactionState,
  generateCompactionSummary,
  maybeCompactThread,
  persistThreadCompactionState,
  threadCompactionStateSchema,
} from "../compaction";

function createUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createMessageRows(count: number, options?: { sameTimestampFrom?: number }) {
  return Array.from({ length: count }, (_, rawIndex) => {
    const index = rawIndex + 1;
    const minute = String(Math.min(index, 59)).padStart(2, "0");
    const created_at = options?.sameTimestampFrom != null && index >= options.sameTimestampFrom
      ? "2026-03-06T02:00:00.000Z"
      : `2026-03-06T01:${minute}:00.000Z`;

    return {
      message_id: createUuid(index),
      created_at,
      role: index % 2 === 0 ? "assistant" : "user",
      content: `Message ${index}`,
      parts: null,
    };
  });
}

function createCompactionSupabaseMock(options?: {
  threadRow?: Record<string, unknown> | null;
  messageRows?: Record<string, unknown>[];
  updateRow?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    from: [] as string[],
    methods: [] as Array<{ method: string; args: unknown[] }>,
  };

  const state = {
    updatePayload: null as Record<string, unknown> | null,
    table: null as string | null,
  };

  const buildQuery = (table: string) => {
    let operation: "select" | "update" = "select";

    const query = {
      select: (...args: unknown[]) => {
        calls.methods.push({ method: "select", args });
        return query;
      },
      update: (...args: unknown[]) => {
        calls.methods.push({ method: "update", args });
        operation = "update";
        state.updatePayload = (args[0] as Record<string, unknown>) ?? null;
        return query;
      },
      eq: (...args: unknown[]) => {
        calls.methods.push({ method: "eq", args });
        return query;
      },
      gte: (...args: unknown[]) => {
        calls.methods.push({ method: "gte", args });
        return query;
      },
      order: (...args: unknown[]) => {
        calls.methods.push({ method: "order", args });
        return query;
      },
      maybeSingle: async () => {
        calls.methods.push({ method: "maybeSingle", args: [] });
        if (table === "conversation_threads") {
          return { data: options?.threadRow ?? null, error: null };
        }

        return { data: null, error: null };
      },
      single: async () => {
        calls.methods.push({ method: "single", args: [] });
        if (table === "conversation_threads" && operation === "update") {
          return {
            data: options?.updateRow ?? {
              thread_id: (options?.threadRow?.thread_id as string) ?? createUuid(99),
              client_id: (options?.threadRow?.client_id as string) ?? createUuid(98),
              ...(state.updatePayload ?? {}),
            },
            error: options?.updateError ?? null,
          };
        }

        return { data: null, error: null };
      },
      then: async (
        onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => unknown) | null,
      ) => {
        const result = table === "conversation_messages"
          ? { data: options?.messageRows ?? [], error: null }
          : { data: [], error: null };
        return onfulfilled ? onfulfilled(result) : result;
      },
    };

    return query;
  };

  return {
    client: {
      from: (table: string) => {
        calls.from.push(table);
        state.table = table;
        return buildQuery(table);
      },
    },
    calls,
  };
}

describe("compaction constants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses positive integer thresholds", () => {
    expect(Number.isInteger(ARTIFACT_SIZE_THRESHOLD_BYTES)).toBe(true);
    expect(ARTIFACT_SIZE_THRESHOLD_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(COMPACTION_KEEP_RECENT)).toBe(true);
    expect(COMPACTION_KEEP_RECENT).toBeGreaterThan(0);
    expect(Number.isInteger(COMPACTION_MESSAGE_THRESHOLD)).toBe(true);
    expect(COMPACTION_MESSAGE_THRESHOLD).toBeGreaterThan(COMPACTION_KEEP_RECENT);
  });

  it("includes CRM preservation guidance in the compaction instructions", () => {
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("deal names");
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("contact");
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("task statuses");
    expect(CRM_COMPACTION_INSTRUCTIONS.trim().length).toBeGreaterThan(0);
  });
});

describe("threadCompactionStateSchema", () => {
  it("parses a valid thread compaction state row", () => {
    const parsed = threadCompactionStateSchema.parse({
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      compaction_summary: "Older thread summary",
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "770e8400-e29b-41d4-a716-446655440000",
      compaction_summary_model: "google/gemini-3-flash",
      compaction_summary_tokens_used: 123,
    });

    expect(parsed.compaction_summary).toBe("Older thread summary");
  });

  it("rejects rows missing a required cutoff boundary field", () => {
    expect(() =>
      threadCompactionStateSchema.parse({
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        client_id: "550e8400-e29b-41d4-a716-446655440000",
        compaction_summary: "Older thread summary",
        compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
        compaction_summary_model: "google/gemini-3-flash",
        compaction_summary_tokens_used: 123,
      })).toThrow();
  });
});

describe("fetchThreadCompactionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the thread has no compaction summary", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          thread_id: "660e8400-e29b-41d4-a716-446655440000",
          client_id: "550e8400-e29b-41d4-a716-446655440000",
          compaction_summary: null,
          compaction_compacted_through_at: null,
          compaction_compacted_through_message_id: null,
          compaction_summary_model: null,
          compaction_summary_tokens_used: null,
        }],
        error: null,
      },
    });

    const result = await fetchThreadCompactionState(
      supabase as never,
      "660e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toBeNull();
  });

  it("returns parsed compaction state when all required fields are present", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          thread_id: "660e8400-e29b-41d4-a716-446655440000",
          client_id: "550e8400-e29b-41d4-a716-446655440000",
          compaction_summary: "Older thread summary",
          compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
          compaction_compacted_through_message_id: "770e8400-e29b-41d4-a716-446655440000",
          compaction_summary_model: "google/gemini-3-flash",
          compaction_summary_tokens_used: 123,
        }],
        error: null,
      },
    });

    const result = await fetchThreadCompactionState(
      supabase as never,
      "660e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toEqual({
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      compaction_summary: "Older thread summary",
      compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
      compaction_compacted_through_message_id: "770e8400-e29b-41d4-a716-446655440000",
      compaction_summary_model: "google/gemini-3-flash",
      compaction_summary_tokens_used: 123,
    });
  });
});

describe("persistThreadCompactionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the conversation thread with the latest compaction state", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: {
        data: [{
          thread_id: "660e8400-e29b-41d4-a716-446655440000",
          client_id: "550e8400-e29b-41d4-a716-446655440000",
          compaction_summary: "Updated summary",
          compaction_compacted_through_at: "2026-03-06T03:00:00.000Z",
          compaction_compacted_through_message_id: "770e8400-e29b-41d4-a716-446655440000",
          compaction_summary_model: "google/gemini-3-flash",
          compaction_summary_tokens_used: 321,
        }],
        error: null,
      },
    });

    const result = await persistThreadCompactionState(supabase as never, {
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      summaryText: "Updated summary",
      compactedThroughAt: "2026-03-06T03:00:00.000Z",
      compactedThroughMessageId: "770e8400-e29b-41d4-a716-446655440000",
      model: "google/gemini-3-flash",
      tokensUsed: 321,
    });

    expect(result.compaction_summary).toBe("Updated summary");
    expect(supabase.calls.from).toContain("conversation_threads");
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_summary: "Updated summary",
            compaction_compacted_through_message_id: "770e8400-e29b-41d4-a716-446655440000",
          })],
        },
        { method: "eq", args: ["thread_id", "660e8400-e29b-41d4-a716-446655440000"] },
        { method: "eq", args: ["client_id", "550e8400-e29b-41d4-a716-446655440000"] },
      ]),
    );
  });

  it("throws when the thread update fails", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: {
        data: null,
        error: { message: "update failed" },
      },
    });

    await expect(
      persistThreadCompactionState(supabase as never, {
        threadId: "660e8400-e29b-41d4-a716-446655440000",
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        summaryText: "Updated summary",
        compactedThroughAt: "2026-03-06T03:00:00.000Z",
        compactedThroughMessageId: "770e8400-e29b-41d4-a716-446655440000",
        model: "google/gemini-3-flash",
        tokensUsed: 321,
      }),
    ).rejects.toThrow("update failed");
  });
});

describe("generateCompactionSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty summary without calling the model when no content exists", async () => {
    const result = await generateCompactionSummary({
      existingSummary: "",
      messages: [],
    });

    expect(result).toEqual({
      summaryText: "",
      tokensUsed: 0,
      model: "google/gemini-3-flash",
    });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("calls generateText with CRM instructions and prior summary context", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Compacted summary",
      usage: { totalTokens: 222 },
    });

    const result = await generateCompactionSummary({
      existingSummary: "Earlier summary block",
      messages: [
        { role: "user", content: "Call John Tan back tomorrow." },
        { role: "assistant", content: "Added a follow-up task." },
      ],
    });

    expect(result).toEqual({
      summaryText: "Compacted summary",
      tokensUsed: 222,
      model: "google/gemini-3-flash",
    });
    expect(mockGateway).toHaveBeenCalledWith("google/gemini-3-flash");
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      model: "mock-model",
      system: CRM_COMPACTION_INSTRUCTIONS,
      prompt: expect.stringContaining("Earlier summary block"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Call John Tan back tomorrow."),
    }));
  });
});

describe("maybeCompactThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the uncompacted window stays within the threshold", async () => {
    const supabase = createCompactionSupabaseMock({
      threadRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: null,
        compaction_compacted_through_at: null,
        compaction_compacted_through_message_id: null,
        compaction_summary_model: null,
        compaction_summary_tokens_used: null,
      },
      messageRows: createMessageRows(COMPACTION_MESSAGE_THRESHOLD),
    });

    const result = await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    expect(result).toBe(false);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("summarizes only the older uncompacted messages and persists the new boundary", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Compacted summary",
      usage: { totalTokens: 456 },
    });
    const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 1);
    const supabase = createCompactionSupabaseMock({
      threadRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: null,
        compaction_compacted_through_at: null,
        compaction_compacted_through_message_id: null,
        compaction_summary_model: null,
        compaction_summary_tokens_used: null,
      },
      messageRows,
      updateRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: "Compacted summary",
        compaction_compacted_through_at:
          messageRows[COMPACTION_MESSAGE_THRESHOLD - COMPACTION_KEEP_RECENT - 1]?.created_at,
        compaction_compacted_through_message_id:
          messageRows[COMPACTION_MESSAGE_THRESHOLD - COMPACTION_KEEP_RECENT - 1]?.message_id,
        compaction_summary_model: "google/gemini-3-flash",
        compaction_summary_tokens_used: 456,
      },
    });

    const result = await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    expect(result).toBe(true);
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Message 26"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining("Message 27"),
    }));
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_compacted_through_message_id: createUuid(26),
          })],
        },
      ]),
    );
  });

  it("rolls forward an existing summary and excludes the exact boundary message", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Updated rolled-forward summary",
      usage: { totalTokens: 222 },
    });
    const boundaryMessageId = createUuid(20);
    const messageRows = createMessageRows(61, { sameTimestampFrom: 20 });
    const supabase = createCompactionSupabaseMock({
      threadRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: "Earlier summary block",
        compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
        compaction_compacted_through_message_id: boundaryMessageId,
        compaction_summary_model: "google/gemini-3-flash",
        compaction_summary_tokens_used: 100,
      },
      messageRows,
      updateRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: "Updated rolled-forward summary",
        compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
        compaction_compacted_through_message_id: createUuid(46),
        compaction_summary_model: "google/gemini-3-flash",
        compaction_summary_tokens_used: 222,
      },
    });

    await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        { method: "gte", args: ["created_at", "2026-03-06T02:00:00.000Z"] },
      ]),
    );
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Earlier summary block"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining("Message 20"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Message 21"),
    }));
  });
});
