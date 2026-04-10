/**
 * Tests for runner-engine schemas.
 * @module lib/runner/__tests__/schemas
 */
import { describe, expect, test } from "vitest";

import {
  runResultSchema,
  runnerPayloadSchema,
  toolResultEnvelopeSchema,
  triggerTypeValues,
} from "../schemas";

describe("triggerTypeValues", () => {
  test("contains all supported trigger types", () => {
    expect(triggerTypeValues).toEqual(["chat", "webhook", "cron", "pulse"]);
  });
});

describe("runnerPayloadSchema", () => {
  test("validates a chat payload", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Hello, Sunder!",
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("accepts an external channel hint for queued chat work", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Hello from Telegram!",
      channel: "telegram" as const,
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid trigger type", () => {
    const invalid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "email",
      input: "Hello, Sunder!",
    };

    expect(() => runnerPayloadSchema.parse(invalid)).toThrow();
  });

  test("accepts optional instructions override for autopilot", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "pulse" as const,
      input: "",
      instructions: "You are running an autonomous pulse.",
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("accepts an optional selected chat model", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Use MiniMax for this.",
      selectedChatModel: "minimax/minimax-m2.7",
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("accepts storagePath on file parts", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "",
      fileParts: [{
        type: "file" as const,
        filename: "report.csv",
        mediaType: "text/csv",
        url: "https://storage.example.com/agent-files/client-1/uploads/report.csv",
        storagePath: "uploads/report.csv",
      }],
    };

    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });
});

describe("toolResultEnvelopeSchema", () => {
  test("validates successful envelope", () => {
    const valid = {
      success: true,
      data: { id: "contact-1" },
      error: null,
      source: "crm",
    };

    expect(toolResultEnvelopeSchema.parse(valid)).toEqual(valid);
  });

  test("validates failed envelope", () => {
    const valid = {
      success: false,
      data: null,
      error: "Contact not found",
      source: "crm",
    };

    expect(toolResultEnvelopeSchema.parse(valid)).toEqual(valid);
  });
});

describe("runResultSchema", () => {
  test("validates completed result", () => {
    const valid = {
      runId: "550e8400-e29b-41d4-a716-446655440000",
      status: "completed" as const,
      model: "google/gemini-3-flash",
      tokensIn: 10,
      tokensOut: 12,
    };

    expect(runResultSchema.parse(valid)).toEqual(valid);
  });

  test("rejects unsupported status", () => {
    const invalid = {
      runId: "550e8400-e29b-41d4-a716-446655440000",
      status: "running",
      model: "google/gemini-3-flash",
      tokensIn: 10,
      tokensOut: 12,
    };

    expect(() => runResultSchema.parse(invalid)).toThrow();
  });
});
