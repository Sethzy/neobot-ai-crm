/**
 * Tests for runner message part normalization helpers.
 * @module lib/runner/__tests__/message-utils
 */
import { describe, expect, it } from "vitest";

import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
} from "../message-utils";

describe("buildAssistantPartsFromSteps", () => {
  it("maps text-only steps to text UI message parts", () => {
    const parts = buildAssistantPartsFromSteps([
      {
        content: [{ type: "text", text: "Hello from model" }],
        text: "Hello from model",
      },
    ]);

    expect(parts).toEqual([
      { type: "step-start" },
      { type: "text", text: "Hello from model" },
    ]);
  });

  it("maps tool calls/results to v6 tool UI parts", () => {
    const parts = buildAssistantPartsFromSteps([
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
            output: { success: true, contacts: [] },
          },
        ],
      },
    ]);

    expect(parts).toEqual([
      { type: "step-start" },
      {
        type: "tool-search_contacts",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "John" },
        output: { success: true, contacts: [] },
      },
    ]);
  });

  it("merges mixed payloads when content has text but tool data is in toolCalls/toolResults", () => {
    const parts = buildAssistantPartsFromSteps([
      {
        content: [{ type: "text", text: "Looking up contacts..." }],
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
          },
        ],
        toolResults: [
          {
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
            output: { success: true, contacts: [] },
          },
        ],
        text: "Looking up contacts...",
      },
    ]);

    expect(parts).toEqual([
      { type: "step-start" },
      { type: "text", text: "Looking up contacts..." },
      {
        type: "tool-search_contacts",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "John" },
        output: { success: true, contacts: [] },
      },
    ]);
  });

  it("keeps input-available state when a tool has no result yet", () => {
    const parts = buildAssistantPartsFromSteps([
      {
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
          },
        ],
      },
    ]);

    expect(parts).toEqual([
      { type: "step-start" },
      {
        type: "tool-search_contacts",
        toolCallId: "call-1",
        state: "input-available",
        input: { query: "John" },
      },
    ]);
  });

  it("maps tool errors to output-error state", () => {
    const parts = buildAssistantPartsFromSteps([
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
          },
          {
            type: "tool-error",
            toolCallId: "call-1",
            toolName: "search_contacts",
            input: { query: "John" },
            error: "Supabase timeout",
          },
        ],
      },
    ]);

    expect(parts).toEqual([
      { type: "step-start" },
      {
        type: "tool-search_contacts",
        toolCallId: "call-1",
        state: "output-error",
        input: { query: "John" },
        errorText: "Supabase timeout",
      },
    ]);
  });

  it("returns an empty list for empty steps", () => {
    expect(buildAssistantPartsFromSteps([])).toEqual([]);
  });
});

describe("getAssistantTextFromParts", () => {
  it("joins text parts and trims whitespace", () => {
    const text = getAssistantTextFromParts([
      { type: "step-start" },
      { type: "text", text: "  First line  " },
      { type: "tool-search_contacts", toolCallId: "call-1", state: "output-available" },
      { type: "text", text: "Second line" },
    ]);

    expect(text).toBe("First line\nSecond line");
  });
});
