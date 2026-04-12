/**
 * Tests for `dispatchEventToCallbacks` — routes raw Anthropic events to
 * the appropriate `SessionRunnerCallbacks` handler.
 *
 * @module lib/managed-agents/__tests__/dispatch-event-to-callbacks.test
 */
import { describe, it, expect, vi } from "vitest";

import { dispatchEventToCallbacks } from "../dispatch-event-to-callbacks";
import type { SessionRunnerCallbacks } from "../types";

import {
  agentMessageTextEvent,
  customToolUseEvent,
  modelRequestStartEvent,
  modelRequestEndEvent,
  sessionErrorEvent,
} from "./fixtures/events";

function makeCallbacks(): Required<
  Pick<
    SessionRunnerCallbacks,
    | "onAgentMessage"
    | "onAgentToolUse"
    | "onSpanModelRequestStart"
    | "onSpanModelRequestEnd"
    | "onSessionError"
  >
> {
  return {
    onAgentMessage: vi.fn(),
    onAgentToolUse: vi.fn(),
    onSpanModelRequestStart: vi.fn(),
    onSpanModelRequestEnd: vi.fn(),
    onSessionError: vi.fn(),
  };
}

describe("dispatchEventToCallbacks", () => {
  it("routes agent.message to onAgentMessage", async () => {
    const cbs = makeCallbacks();
    const event = agentMessageTextEvent("evt_1", "hello");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onAgentMessage).toHaveBeenCalledWith(event);
    expect(cbs.onAgentToolUse).not.toHaveBeenCalled();
  });

  it("routes agent.custom_tool_use to onAgentToolUse", async () => {
    const cbs = makeCallbacks();
    const event = customToolUseEvent("evt_2", "web_search", { query: "test" });
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onAgentToolUse).toHaveBeenCalledWith(event);
    expect(cbs.onAgentMessage).not.toHaveBeenCalled();
  });

  it("routes span.model_request_start to onSpanModelRequestStart", async () => {
    const cbs = makeCallbacks();
    const event = modelRequestStartEvent("evt_3");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onSpanModelRequestStart).toHaveBeenCalledWith(event);
  });

  it("routes span.model_request_end to onSpanModelRequestEnd", async () => {
    const cbs = makeCallbacks();
    const event = modelRequestEndEvent("evt_4", 100, 50);
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onSpanModelRequestEnd).toHaveBeenCalledWith(event);
  });

  it("routes session.error to onSessionError", async () => {
    const cbs = makeCallbacks();
    const event = sessionErrorEvent("evt_5", "something broke");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onSessionError).toHaveBeenCalledWith(event);
  });

  it("does not throw when callbacks are undefined", async () => {
    const event = agentMessageTextEvent("evt_6", "hello");
    await expect(dispatchEventToCallbacks(event, {})).resolves.not.toThrow();
  });
});
