/**
 * Tests for runner message part normalization helpers.
 * @module lib/runner/__tests__/message-utils
 */
import { describe, expect, it } from "vitest";

import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
  getCompactionTextFromParts,
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

describe("getCompactionTextFromParts", () => {
  it("includes toolCallId for truncated tool parts (existing behavior)", () => {
    const text = getCompactionTextFromParts([
      {
        type: "tool-web_scrape",
        toolCallId: "call-scrape",
        state: "output-available",
        output: '<context-removed>Data truncated: 90KB -> 5KB. path: toolcalls/call-scrape/result.json</context-removed>',
      },
    ]);

    expect(text).toContain("call-scrape");
    expect(text).toContain("<context-removed>");
  });

  it("includes toolCallId and tool name for non-truncated tool parts (breadcrumb)", () => {
    const text = getCompactionTextFromParts([
      {
        type: "tool-search_contacts",
        toolCallId: "call-abc",
        state: "output-available",
        output: { success: true, contacts: [{ name: "John Tan" }] },
      },
    ]);

    // The compaction text must include the toolCallId so the summarizer can preserve it
    expect(text).toContain("call-abc");
    // Should include the tool name for context
    expect(text).toContain("search_contacts");
  });

  it("still includes text parts alongside tool breadcrumbs", () => {
    const text = getCompactionTextFromParts([
      { type: "text", text: "Found 3 contacts." },
      {
        type: "tool-search_contacts",
        toolCallId: "call-xyz",
        state: "output-available",
        output: { success: true },
      },
    ]);

    expect(text).toContain("Found 3 contacts.");
    expect(text).toContain("call-xyz");
  });

  it("skips tool parts without output (input-available state)", () => {
    const text = getCompactionTextFromParts([
      {
        type: "tool-search_contacts",
        toolCallId: "call-pending",
        state: "input-available",
        input: { query: "John" },
      },
    ]);

    expect(text).toBe("");
  });
});
