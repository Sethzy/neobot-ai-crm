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
  bashToolUseEvent,
  builtInToolResultEvent,
  customToolResultEvent,
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
    | "onAgentToolResult"
    | "onApprovalRequired"
    | "onSpanModelRequestStart"
    | "onSpanModelRequestEnd"
    | "onSessionError"
  >
> {
  return {
    onAgentMessage: vi.fn(),
    onAgentToolUse: vi.fn(),
    onAgentToolResult: vi.fn(),
    onApprovalRequired: vi.fn(),
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

  it("routes agent.tool_use (ask) to onApprovalRequired with event.id as approvalId", async () => {
    const cbs = makeCallbacks();
    const event = bashToolUseEvent("evt_7", "rm -rf /", "ask");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onApprovalRequired).toHaveBeenCalledWith(event, "evt_7");
    expect(cbs.onAgentToolUse).not.toHaveBeenCalled();
  });

  it("routes agent.tool_use (allow) to onAgentToolUse", async () => {
    const cbs = makeCallbacks();
    const event = bashToolUseEvent("evt_8", "ls", "allow");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onApprovalRequired).not.toHaveBeenCalled();
    expect(cbs.onAgentToolUse).toHaveBeenCalledWith(event);
  });

  it("routes user.custom_tool_result to onAgentToolResult", async () => {
    const cbs = makeCallbacks();
    const event = customToolResultEvent("evt_9", "evt_2", { result: "ok" });
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onAgentToolResult).toHaveBeenCalledWith(event);
    expect(cbs.onAgentMessage).not.toHaveBeenCalled();
  });

  it("routes agent.mcp_tool_use (ask) to onApprovalRequired", async () => {
    const cbs = makeCallbacks();
    const event = { id: "evt_10", type: "agent.mcp_tool_use", name: "slack_send", input: {}, evaluated_permission: "ask" };
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onApprovalRequired).toHaveBeenCalledWith(event, "evt_10");
  });

  it("routes agent.mcp_tool_use (allow) to onAgentToolUse", async () => {
    const cbs = makeCallbacks();
    const event = {
      id: "evt_10b",
      type: "agent.mcp_tool_use",
      name: "slack_send",
      input: { channel: "ops" },
      evaluated_permission: "allow",
    } as const;
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onApprovalRequired).not.toHaveBeenCalled();
    expect(cbs.onAgentToolUse).toHaveBeenCalledWith(event);
  });

  it("routes agent.tool_result to onAgentToolResult", async () => {
    const cbs = makeCallbacks();
    const event = builtInToolResultEvent("evt_11", "evt_7", "output text");
    await dispatchEventToCallbacks(event, cbs);
    expect(cbs.onAgentToolResult).toHaveBeenCalledWith(event);
  });

  it("does not throw when callbacks are undefined", async () => {
    const event = agentMessageTextEvent("evt_6", "hello");
    await expect(dispatchEventToCallbacks(event, {})).resolves.not.toThrow();
  });
});
