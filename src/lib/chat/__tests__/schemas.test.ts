/**
 * Tests chat persistence schemas for clients, threads, messages, and runs.
 * @module lib/chat/__tests__/schemas.test
 */
import { describe, expect, test } from "vitest";

import {
  clientSchema,
  conversationMessageSchema,
  conversationThreadSchema,
  messageRoleValues,
  runSchema,
  runStatusValues,
  type Client,
  type ConversationMessage,
  type ConversationThread,
  type Run,
} from "../schemas";

describe("clientSchema", () => {
  test("validates a client row", () => {
    const row: Client = {
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "660e8400-e29b-41d4-a716-446655440000",
      display_name: "John Doe",
      created_at: "2026-03-01T00:00:00Z",
    };

    expect(clientSchema.parse(row)).toEqual(row);
  });

  test("rejects invalid client timestamp", () => {
    expect(() =>
      clientSchema.parse({
        client_id: "550e8400-e29b-41d4-a716-446655440000",
        user_id: "660e8400-e29b-41d4-a716-446655440000",
        display_name: null,
        created_at: "not-a-date",
      }),
    ).toThrow();
  });
});

describe("conversationThreadSchema", () => {
  test("validates a thread row", () => {
    const row: ConversationThread = {
      thread_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      title: null,
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };

    expect(conversationThreadSchema.parse(row)).toEqual(row);
  });

  test("rejects missing client_id", () => {
    expect(() =>
      conversationThreadSchema.parse({
        thread_id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Missing owner",
        is_pinned: false,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("conversationMessageSchema", () => {
  test("validates user message with text part", () => {
    const row: ConversationMessage = {
      message_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "user",
      content: "Hello, agent!",
      parts: [{ type: "text", text: "Hello, agent!" }],
      created_at: "2026-03-01T00:00:00Z",
    };

    expect(conversationMessageSchema.parse(row)).toEqual(row);
  });

  test("validates assistant message with tool parts", () => {
    const row: ConversationMessage = {
      message_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "assistant",
      content: "Created contact.",
      parts: [
        {
          type: "tool-call",
          toolCallId: "call_123",
          toolName: "create_contact",
          args: { first_name: "John" },
        },
        {
          type: "tool-result",
          toolCallId: "call_123",
          toolName: "create_contact",
          result: { contact_id: "c_123" },
        },
      ],
      created_at: "2026-03-01T00:00:01Z",
    };

    expect(conversationMessageSchema.parse(row)).toEqual(row);
  });

  test("rejects invalid role", () => {
    expect(() =>
      conversationMessageSchema.parse({
        message_id: "550e8400-e29b-41d4-a716-446655440000",
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        role: "admin",
        content: "test",
        parts: null,
        created_at: "2026-03-01T00:00:00Z",
      }),
    ).toThrow();
  });

  test("rejects malformed parts payload", () => {
    expect(() =>
      conversationMessageSchema.parse({
        message_id: "550e8400-e29b-41d4-a716-446655440000",
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        role: "assistant",
        content: "test",
        parts: [{ type: "tool-call", toolName: "missing-id-and-args" }],
        created_at: "2026-03-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("runSchema", () => {
  test("validates completed run", () => {
    const row: Run = {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "completed",
      model: "google/gemini-3-flash",
      tokens_in: 150,
      tokens_out: 200,
      step_count: 2,
      created_at: "2026-03-01T00:00:00Z",
      completed_at: "2026-03-01T00:00:01Z",
    };

    expect(runSchema.parse(row)).toEqual(row);
  });

  test("accepts null completed_at for running status", () => {
    const row: Run = {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      client_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "running",
      model: null,
      tokens_in: null,
      tokens_out: null,
      step_count: null,
      created_at: "2026-03-01T00:00:00Z",
      completed_at: null,
    };

    expect(runSchema.parse(row)).toEqual(row);
  });

  test("rejects negative token counts", () => {
    expect(() =>
      runSchema.parse({
        run_id: "550e8400-e29b-41d4-a716-446655440000",
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        client_id: "770e8400-e29b-41d4-a716-446655440000",
        status: "failed",
        model: "anthropic/claude-sonnet-4.6",
        tokens_in: -1,
        tokens_out: 10,
        step_count: 1,
        created_at: "2026-03-01T00:00:00Z",
        completed_at: "2026-03-01T00:00:01Z",
      }),
    ).toThrow();
  });

  test("rejects negative step_count", () => {
    expect(() =>
      runSchema.parse({
        run_id: "550e8400-e29b-41d4-a716-446655440000",
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        client_id: "770e8400-e29b-41d4-a716-446655440000",
        status: "failed",
        model: "anthropic/claude-sonnet-4.6",
        tokens_in: 10,
        tokens_out: 10,
        step_count: -1,
        created_at: "2026-03-01T00:00:00Z",
        completed_at: "2026-03-01T00:00:01Z",
      }),
    ).toThrow();
  });
});

describe("schema constants", () => {
  test("runStatusValues includes all 6 statuses", () => {
    expect(runStatusValues).toEqual([
      "queued",
      "running",
      "completed",
      "partial",
      "failed",
      "cancelled",
    ]);
  });

  test("messageRoleValues includes supported roles", () => {
    expect(messageRoleValues).toEqual(["system", "user", "assistant", "tool"]);
  });
});
