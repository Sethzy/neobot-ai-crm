/**
 * Tests for the CRM data hallucination evaluator.
 * Mocks the LLM call to test evaluation logic in isolation.
 * @module lib/eval/__tests__/crm-hallucination-eval
 */
import { describe, expect, it, vi } from "vitest";
import type { LangfuseObservation } from "../langfuse-api";

// Mock generateText before importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

// Mock gateway
vi.mock("@/lib/ai/gateway", () => ({
  COMPACTION_MODEL: "google/gemini-2.5-flash-lite",
  gateway: {
    languageModel: vi.fn(() => "mock-model"),
  },
}));

import { generateText } from "ai";
import { evaluateCrmHallucination } from "../crm-hallucination-eval";

const mockGenerateText = vi.mocked(generateText);

/** Helper to build a TOOL observation. */
function toolObs(
  name: string,
  input: unknown = {},
  opts?: { id?: string; startTime?: string },
): LangfuseObservation {
  return {
    id: opts?.id ?? `obs-${name}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    type: "TOOL",
    model: "",
    input,
    output: {},
    startTime: opts?.startTime ?? new Date().toISOString(),
    endTime: new Date().toISOString(),
    completionStartTime: "",
    latency: 0,
    totalCost: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    statusMessage: "",
    level: "DEFAULT",
  };
}

function sequentialObs(
  ...specs: Array<{ name: string; input?: unknown }>
): LangfuseObservation[] {
  const base = Date.now();
  return specs.map((s, i) =>
    toolObs(s.name, s.input ?? {}, {
      startTime: new Date(base + i * 1000).toISOString(),
    }),
  );
}

describe("evaluateCrmHallucination", () => {
  it("passes immediately when no CRM write tools are present (no LLM call)", async () => {
    const obs = sequentialObs(
      { name: "search_crm" },
      { name: "read_file" },
    );

    const result = await evaluateCrmHallucination([], obs);
    expect(result.pass).toBe(true);
    expect(result.flaggedCalls).toHaveLength(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("passes when LLM judge says data is grounded", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"verdict":"pass","flagged_fields":[]}',
    } as never);

    const messages = [
      { role: "user", content: "Add a contact John Smith, john@example.com" },
    ];
    const obs = sequentialObs({
      name: "create_record",
      input: {
        entity: "contacts",
        records: [
          {
            first_name: "John",
            last_name: "Smith",
            email: "john@example.com",
          },
        ],
      },
    });

    const result = await evaluateCrmHallucination(messages, obs);
    expect(result.pass).toBe(true);
    expect(result.flaggedCalls).toHaveLength(0);
  });

  it("fails when LLM judge flags a hallucinated email", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        verdict: "fail",
        flagged_fields: [
          {
            tool_call_index: 0,
            field: "email",
            value: "john@fakeemail.com",
            reason: "Email not mentioned in conversation",
          },
        ],
      }),
    } as never);

    const messages = [
      { role: "user", content: "Add a contact John Smith" },
    ];
    const obs = sequentialObs({
      name: "create_record",
      input: {
        entity: "contacts",
        records: [
          {
            first_name: "John",
            last_name: "Smith",
            email: "john@fakeemail.com",
          },
        ],
      },
    });

    const result = await evaluateCrmHallucination(messages, obs);
    expect(result.pass).toBe(false);
    expect(result.flaggedCalls).toHaveLength(1);
    expect(result.flaggedCalls[0].field).toBe("email");
    expect(result.flaggedCalls[0].toolName).toBe("create_record");
  });

  it("handles multiple writes with partial hallucination", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        verdict: "fail",
        flagged_fields: [
          {
            tool_call_index: 1,
            field: "amount",
            value: "500000",
            reason: "Deal amount not mentioned by user",
          },
        ],
      }),
    } as never);

    const messages = [
      { role: "user", content: "Add contact Alice and create a deal at 123 Main St" },
    ];
    const obs = sequentialObs(
      {
        name: "create_record",
        input: {
          entity: "contacts",
          records: [{ first_name: "Alice", last_name: "Tan" }],
        },
      },
      {
        name: "create_record",
        input: {
          entity: "deals",
          records: [{ address: "123 Main St", amount: 500000 }],
        },
      },
    );

    const result = await evaluateCrmHallucination(messages, obs);
    expect(result.pass).toBe(false);
    expect(result.flaggedCalls).toHaveLength(1);
    expect(result.flaggedCalls[0].toolCallIndex).toBe(1);
    expect(result.flaggedCalls[0].toolName).toBe("create_record");
  });

  it("also evaluates update_record calls", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"verdict":"pass","flagged_fields":[]}',
    } as never);

    const obs = sequentialObs({
      name: "update_record",
      input: {
        entity: "contacts",
        updates: [{ id: "uuid-1", fields: { phone: "+65 9123 4567" } }],
      },
    });

    const result = await evaluateCrmHallucination(
      [{ role: "user", content: "Update Alice's phone to +65 9123 4567" }],
      obs,
    );
    expect(result.pass).toBe(true);
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it("gracefully handles malformed LLM response", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Sorry, I cannot evaluate this.",
    } as never);

    const obs = sequentialObs({
      name: "create_record",
      input: {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Doe" }],
      },
    });

    const result = await evaluateCrmHallucination([], obs);
    // Unparseable response → default to pass (don't block on eval failure)
    expect(result.pass).toBe(true);
    expect(result.flaggedCalls).toHaveLength(0);
  });

  it("gracefully handles LLM call failure", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API timeout"));

    const obs = sequentialObs({
      name: "create_record",
      input: {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Doe" }],
      },
    });

    const result = await evaluateCrmHallucination([], obs);
    // LLM failure → default to pass
    expect(result.pass).toBe(true);
    expect(result.flaggedCalls).toHaveLength(0);
  });

  it("handles LLM response wrapped in markdown code fences", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '```json\n{"verdict":"fail","flagged_fields":[{"tool_call_index":0,"field":"phone","value":"555-1234","reason":"Invented phone number"}]}\n```',
    } as never);

    const obs = sequentialObs({
      name: "create_record",
      input: {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Doe", phone: "555-1234" }],
      },
    });

    const result = await evaluateCrmHallucination([], obs);
    expect(result.pass).toBe(false);
    expect(result.flaggedCalls).toHaveLength(1);
    expect(result.flaggedCalls[0].field).toBe("phone");
  });
});
