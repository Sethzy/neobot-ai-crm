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
  COMPACTION_MODEL: "google/gemini-2.5-flash-lite",
}));

import {
  ARTIFACT_SIZE_THRESHOLD_BYTES,
  COMPACTION_KEEP_RECENT,
  COMPACTION_MESSAGE_THRESHOLD,
  CRM_COMPACTION_INSTRUCTIONS,
  STRUCTURED_SUMMARY_INSTRUCTIONS,
  SUMMARIZATION_PROMPT,
  SUMMARY_PREFIX,
  fetchThreadCompactionState,
  generateCompactionSummary,
  isSummaryMessage,
  isTriggerEventMessage,
  maybeCompactThread,
  persistThreadCompactionState,
  pruneTriggerEvents,
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
    expect(COMPACTION_KEEP_RECENT).toBe(50);
    expect(Number.isInteger(COMPACTION_MESSAGE_THRESHOLD)).toBe(true);
    expect(COMPACTION_MESSAGE_THRESHOLD).toBe(200);
    expect(COMPACTION_MESSAGE_THRESHOLD).toBeGreaterThan(COMPACTION_KEEP_RECENT);
  });

  it("includes CRM preservation guidance in the compaction instructions", () => {
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("deal names");
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("contact");
    expect(CRM_COMPACTION_INSTRUCTIONS).toContain("task statuses");
    expect(CRM_COMPACTION_INSTRUCTIONS.trim().length).toBeGreaterThan(0);
  });
});

describe("SUMMARIZATION_PROMPT", () => {
  it("contains the Codex checkpoint-compaction framing", () => {
    expect(SUMMARIZATION_PROMPT).toContain("CONTEXT CHECKPOINT COMPACTION");
    expect(SUMMARIZATION_PROMPT).toContain("handoff summary");
    expect(SUMMARIZATION_PROMPT).toContain("Current progress");
  });
});

describe("SUMMARY_PREFIX", () => {
  it("contains the Codex handoff framing", () => {
    expect(SUMMARY_PREFIX).toContain("Another language model");
    expect(SUMMARY_PREFIX).toContain("avoid duplicating work");
  });
});

describe("STRUCTURED_SUMMARY_INSTRUCTIONS", () => {
  it("requires four structured sections", () => {
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## User Instructions");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Workflow");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Resources");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("## Current Focus");
  });

  it("contains CRM-specific preservation guidance", () => {
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("deal names");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("contact names");
    expect(STRUCTURED_SUMMARY_INSTRUCTIONS).toContain("task statuses");
  });
});

describe("isTriggerEventMessage", () => {
  it("returns true for messages starting with <trigger-event>", () => {
    const message = [
      "<trigger-event>",
      "trigger_instance_id: abc-123",
      "trigger_type: rss",
      "trigger_name: PropertyGuru Monitor",
      "payload: {}",
      "</trigger-event>",
    ].join("\n");

    expect(isTriggerEventMessage(message)).toBe(true);
  });

  it("returns false for regular user messages", () => {
    expect(isTriggerEventMessage("Call John Tan back")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isTriggerEventMessage("")).toBe(false);
  });
});

describe("pruneTriggerEvents", () => {
  it("extracts trigger name and type into a <context-removed> summary", () => {
    const triggerMessages = [
      {
        role: "system",
        content: [
          "<trigger-event>",
          "trigger_instance_id: abc-123",
          "trigger_type: rss",
          "fired_at: 2026-03-06T10:00:00.000Z",
          "trigger_name: PropertyGuru Monitor",
          "instruction_path: triggers/abc-123/instructions.md",
          'payload: {"new_items":[{"title":"3BR condo at Tampines"}]}',
          "</trigger-event>",
        ].join("\n"),
      },
      {
        role: "system",
        content: [
          "<trigger-event>",
          "trigger_instance_id: def-456",
          "trigger_type: schedule",
          "fired_at: 2026-03-06T16:00:00.000Z",
          "trigger_name: Daily CRM check",
          "instruction_path: triggers/def-456/instructions.md",
          "payload: {}",
          "</trigger-event>",
        ].join("\n"),
      },
    ];

    const result = pruneTriggerEvents(triggerMessages);

    expect(result).toContain("<context-removed>");
    expect(result).toContain("Omitted 2 trigger invocation(s)");
    expect(result).toContain("PropertyGuru Monitor (rss)");
    expect(result).toContain("Daily CRM check (schedule)");
    expect(result).toContain("</context-removed>");
    expect(result).not.toContain("3BR condo");
  });

  it("returns empty string when given no trigger messages", () => {
    expect(pruneTriggerEvents([])).toBe("");
  });
});

describe("isSummaryMessage", () => {
  it("returns true for summaries beginning with the prefix", () => {
    expect(isSummaryMessage(`${SUMMARY_PREFIX}\nDeal X is in follow-up.`)).toBe(true);
  });

  it("returns false for normal user text", () => {
    expect(isSummaryMessage("Call John Tan tomorrow")).toBe(false);
  });

  it("returns false for partial prefix matches", () => {
    expect(isSummaryMessage("Another language model started")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isSummaryMessage("")).toBe(false);
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
      model: "google/gemini-2.5-flash-lite",
    });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("calls generateText with COMPACTION_MODEL and structured summary instructions", async () => {
    mockGenerateText.mockResolvedValue({
      text: "## User Instructions\nNone\n## Workflow\nDiscussed deals\n## Resources\nNone\n## Current Focus\nFollow up",
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
      summaryText: "## User Instructions\nNone\n## Workflow\nDiscussed deals\n## Resources\nNone\n## Current Focus\nFollow up",
      tokensUsed: 222,
      model: "google/gemini-2.5-flash-lite",
    });
    expect(mockGateway).toHaveBeenCalledWith("google/gemini-2.5-flash-lite");
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      model: "mock-model",
      system: expect.stringContaining("## User Instructions"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining("## Current Focus"),
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
    const lastCompactedMessageNumber = COMPACTION_MESSAGE_THRESHOLD + 1 - COMPACTION_KEEP_RECENT;
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
        compaction_summary: `${SUMMARY_PREFIX}\nCompacted summary`,
        compaction_compacted_through_at:
          messageRows[lastCompactedMessageNumber - 1]?.created_at,
        compaction_compacted_through_message_id:
          messageRows[lastCompactedMessageNumber - 1]?.message_id,
        compaction_summary_model: "google/gemini-2.5-flash-lite",
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
      prompt: expect.stringContaining(`Message ${lastCompactedMessageNumber}`),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining(`Message ${lastCompactedMessageNumber + 1}`),
    }));
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_summary: `${SUMMARY_PREFIX}\nCompacted summary`,
            compaction_compacted_through_message_id: createUuid(lastCompactedMessageNumber),
          })],
        },
      ]),
    );
  });

  it("partitions trigger events from conversation and prunes them mechanically", async () => {
    mockGenerateText.mockResolvedValue({
      text: "## User Instructions\nNone\n## Workflow\nDiscussed deals\n## Resources\nNone\n## Current Focus\nFollow up",
      usage: { totalTokens: 100 },
    });

    const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 10);
    messageRows[5] = {
      ...messageRows[5],
      role: "system",
      content: "<trigger-event>\ntrigger_instance_id: t1\ntrigger_type: rss\ntrigger_name: PropertyGuru\npayload: {}\n</trigger-event>",
    };
    messageRows[10] = {
      ...messageRows[10],
      role: "system",
      content: "<trigger-event>\ntrigger_instance_id: t2\ntrigger_type: schedule\ntrigger_name: Daily Check\npayload: {}\n</trigger-event>",
    };

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
    });

    await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    // Trigger events should NOT be in the LLM summarizer prompt
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining("<trigger-event>"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining("PropertyGuru"),
    }));

    // But the persisted summary should contain the pruned trigger summary
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_summary: expect.stringContaining("Omitted 2 trigger invocation(s)"),
          })],
        },
      ]),
    );
  });

  it("does not prune user-authored trigger-event-like text", async () => {
    mockGenerateText.mockResolvedValue({
      text: "## User Instructions\nNone\n## Workflow\nCaptured literal trigger XML\n## Resources\nNone\n## Current Focus\nContinue",
      usage: { totalTokens: 100 },
    });

    const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 10);
    messageRows[5] = {
      ...messageRows[5],
      role: "user",
      content: "<trigger-event>\ntrigger_instance_id: pasted\ntrigger_type: rss\ntrigger_name: PropertyGuru\npayload: {}\n</trigger-event>",
    };

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
    });

    await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("trigger_name: PropertyGuru"),
    }));
    expect(supabase.calls.methods).not.toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_summary: expect.stringContaining("Omitted 1 trigger invocation(s)"),
          })],
        },
      ]),
    );
  });

  it("includes truncated tool recovery paths from assistant parts in the compaction prompt", async () => {
    mockGenerateText.mockResolvedValue({
      text: "## User Instructions\nNone\n## Workflow\nRecovered tool context\n## Resources\ntoolcalls/call-large/result.json\n## Current Focus\nContinue",
      usage: { totalTokens: 120 },
    });

    const messageRows = createMessageRows(COMPACTION_MESSAGE_THRESHOLD + 10);
    messageRows[12] = {
      ...messageRows[12],
      role: "assistant",
      content: "Saved the search result.",
      parts: [
        { type: "text", text: "Saved the search result." },
        {
          type: "tool-web_scrape",
          toolCallId: "call-large",
          state: "output-available",
          output:
            "<context-removed>Data truncated: 50KB -> 5KB. path: toolcalls/call-large/result.json</context-removed>",
        },
      ],
    };

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
    });

    await maybeCompactThread(
      supabase.client as never,
      createUuid(91),
      createUuid(90),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Tool call call-large"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("toolcalls/call-large/result.json"),
    }));
  });

  it("strips the stored prefix before re-summarizing and excludes the exact boundary message", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Updated rolled-forward summary",
      usage: { totalTokens: 222 },
    });
    const boundaryMessageId = createUuid(20);
    const messageRows = createMessageRows(230, { sameTimestampFrom: 20 });
    const lastCompactedMessageNumber = 230 - COMPACTION_KEEP_RECENT;
    const supabase = createCompactionSupabaseMock({
      threadRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: `${SUMMARY_PREFIX}\nEarlier summary block`,
        compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
        compaction_compacted_through_message_id: boundaryMessageId,
        compaction_summary_model: "google/gemini-2.5-flash-lite",
        compaction_summary_tokens_used: 100,
      },
      messageRows,
      updateRow: {
        thread_id: createUuid(90),
        client_id: createUuid(91),
        compaction_summary: `${SUMMARY_PREFIX}\nUpdated rolled-forward summary`,
        compaction_compacted_through_at: "2026-03-06T02:00:00.000Z",
        compaction_compacted_through_message_id: createUuid(lastCompactedMessageNumber),
        compaction_summary_model: "google/gemini-2.5-flash-lite",
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
      prompt: expect.not.stringContaining(`${SUMMARY_PREFIX}\nEarlier summary block`),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining("Message 20"),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Message 21"),
    }));
    expect(supabase.calls.methods).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [expect.objectContaining({
            compaction_compacted_through_message_id: createUuid(lastCompactedMessageNumber),
          })],
        },
      ]),
    );
  });
});
