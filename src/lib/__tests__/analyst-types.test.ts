/**
 * @fileoverview Tests for AI Analyst chat API Zod schemas.
 */
import { describe, it, expect } from "vitest";
import { ChatRequestSchema, UIMessageSchema, MessagePartSchema } from "../analyst/types";

describe("ChatRequestSchema", () => {
  it("validates a valid first message request", () => {
    const validRequest = {
      messages: [
        {
          id: "msg-123",
          role: "user",
          parts: [{ type: "text", text: "Analyze my documents" }],
        },
      ],
      caseId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = ChatRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("validates request with containerId for follow-up", () => {
    const validRequest = {
      messages: [
        {
          id: "msg-123",
          role: "user",
          parts: [{ type: "text", text: "First message" }],
        },
        {
          id: "msg-456",
          role: "assistant",
          parts: [{ type: "text", text: "Response" }],
        },
        {
          id: "msg-789",
          role: "user",
          parts: [{ type: "text", text: "Follow up" }],
        },
      ],
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      containerId: "container_abc123",
      selectedTags: ["invoice", "po"],
    };

    const result = ChatRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("rejects invalid caseId", () => {
    const invalidRequest = {
      messages: [
        {
          id: "msg-123",
          role: "user",
          parts: [{ type: "text", text: "Test" }],
        },
      ],
      caseId: "not-a-uuid",
    };

    const result = ChatRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it("rejects empty messages array", () => {
    const invalidRequest = {
      messages: [],
      caseId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = ChatRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });
});

describe("UIMessageSchema", () => {
  it("validates message with text part", () => {
    const message = {
      id: "msg-123",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    };

    const result = UIMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("validates message with reasoning part", () => {
    const message = {
      id: "msg-123",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Let me think..." },
        { type: "text", text: "Here's my analysis" },
      ],
    };

    const result = UIMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("validates message with typed tool part", () => {
    const message = {
      id: "msg-123",
      role: "assistant",
      parts: [
        {
          type: "tool-code_execution",
          toolCallId: "tool-1",
          state: "output-available",
          input: { code: "print('hello')" },
          output: { stdout: "hello" },
        },
      ],
    };

    const result = UIMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});

describe('MessagePartSchema', () => {
  it('validates image part', () => {
    const imagePart = {
      type: 'image',
      data: 'iVBORw0KGgo=',
      mediaType: 'image/png',
    };
    const result = MessagePartSchema.safeParse(imagePart);
    expect(result.success).toBe(true);
  });
});
