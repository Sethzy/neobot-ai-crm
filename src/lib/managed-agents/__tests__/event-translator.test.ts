/**
 * @module lib/managed-agents/__tests__/event-translator.test
 *
 * Tests for the pure event translator: text + step events, custom tool
 * lifecycle, bash approval gating + dedup, and terminal-state surfacing.
 */
import { describe, it, expect } from "vitest";

import { createTranslatorState, translateEvent } from "../event-translator";

import {
  agentMessageTextEvent,
  bashToolUseEvent,
  customToolResultEvent,
  customToolUseEvent,
  modelRequestEndEvent,
  modelRequestStartEvent,
  sessionErrorEvent,
  statusIdleEvent,
  statusTerminatedEvent,
} from "./fixtures/events";

describe("translateEvent — text + step events", () => {
  it("emits step-start on span.model_request_start", () => {
    const state = createTranslatorState();
    const out = translateEvent(state, modelRequestStartEvent("span_1"));
    expect(out.parts).toEqual([{ type: "step-start" }]);
    expect(out.terminal).toBeNull();
  });

  it("emits text-delta per text block in agent.message", () => {
    const state = createTranslatorState();
    const out = translateEvent(state, agentMessageTextEvent("evt_1", "hello"));
    expect(out.parts).toEqual([{ type: "text-delta", delta: "hello" }]);
  });

  it("accumulates token usage on span.model_request_end", () => {
    const state = createTranslatorState();
    translateEvent(state, modelRequestEndEvent("span_1", 120, 40));
    translateEvent(state, modelRequestEndEvent("span_2", 80, 25));
    expect(state.usage).toEqual({ inputTokens: 200, outputTokens: 65 });
  });
});

describe("translateEvent — custom tool calls", () => {
  it("emits tool-call + surfaces customToolCall for dispatch", () => {
    const state = createTranslatorState();
    const out = translateEvent(
      state,
      customToolUseEvent("ctu_1", "search_crm", { entity: "contacts" }),
    );
    expect(out.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-call",
        toolCallId: "ctu_1",
        toolName: "search_crm",
        input: { entity: "contacts" },
      }),
    );
    expect(out.customToolCall).toEqual({
      id: "ctu_1",
      name: "search_crm",
      input: { entity: "contacts" },
    });
  });

  it("emits tool-result on user.custom_tool_result", () => {
    const state = createTranslatorState();
    const out = translateEvent(
      state,
      customToolResultEvent("ctr_1", "ctu_1", {
        success: true,
        records: [],
      }),
    );
    expect(out.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-result",
        toolCallId: "ctu_1",
        result: { success: true, records: [] },
      }),
    );
  });
});

describe("translateEvent — bash approval", () => {
  it("surfaces approvalRequest for bash with evaluated_permission='ask'", () => {
    const state = createTranslatorState();
    const out = translateEvent(
      state,
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
    );
    expect(out.approvalRequest).toEqual({
      toolUseId: "tu_1",
      toolName: "bash",
      input: { command: "rm -rf /tmp" },
    });
    expect(out.parts).toContainEqual(
      expect.objectContaining({ type: "tool-approval-request" }),
    );
  });

  it("skips approvalRequest for bash with 'allow'", () => {
    const state = createTranslatorState();
    const out = translateEvent(state, bashToolUseEvent("tu_2", "ls", "allow"));
    expect(out.approvalRequest).toBeUndefined();
  });

  it("dedupes approvalRequest on repeated tool_use_id", () => {
    const state = createTranslatorState();
    const first = translateEvent(state, bashToolUseEvent("tu_3", "ls", "ask"));
    const second = translateEvent(state, bashToolUseEvent("tu_3", "ls", "ask"));
    expect(first.approvalRequest).toBeDefined();
    expect(second.approvalRequest).toBeUndefined();
  });
});

describe("translateEvent — terminal gate", () => {
  it("marks end_turn as terminal", () => {
    const out = translateEvent(
      createTranslatorState(),
      statusIdleEvent("idle_1", "end_turn"),
    );
    expect(out.terminal).toBe("end_turn");
  });

  it("marks retries_exhausted as terminal", () => {
    const out = translateEvent(
      createTranslatorState(),
      statusIdleEvent("idle_2", "retries_exhausted"),
    );
    expect(out.terminal).toBe("retries_exhausted");
  });

  it("marks requires_action as terminal=requires_action", () => {
    const out = translateEvent(
      createTranslatorState(),
      statusIdleEvent("idle_3", "requires_action"),
    );
    expect(out.terminal).toBe("requires_action");
  });

  it("marks session.status_terminated as terminal", () => {
    const out = translateEvent(
      createTranslatorState(),
      statusTerminatedEvent("term_1"),
    );
    expect(out.terminal).toBe("terminated");
  });

  it("emits an error part for session.error without terminating", () => {
    const out = translateEvent(
      createTranslatorState(),
      sessionErrorEvent("err_1", "transient"),
    );
    expect(out.terminal).toBeNull();
    expect(out.parts).toContainEqual(
      expect.objectContaining({ type: "error", message: "transient" }),
    );
  });
});
