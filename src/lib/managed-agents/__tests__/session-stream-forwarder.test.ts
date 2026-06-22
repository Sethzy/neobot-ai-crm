import { describe, expect, it } from "vitest";

import { buildUiStreamCallbacks } from "../session-stream-forwarder";

function mockWriter() {
  const writes: unknown[] = [];

  return {
    writes,
    writer: {
      write: (chunk: unknown) => {
        writes.push(chunk);
      },
    } as never,
  };
}

describe("buildUiStreamCallbacks", () => {
  it("emits text-start / text-delta / text-end for agent.message", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentMessage?.({
      id: "evt_1",
      content: [{ type: "text", text: "hi" }],
    } as never);

    expect(writes).toEqual([
      { type: "text-start", id: "evt_1" },
      { type: "text-delta", id: "evt_1", delta: "hi" },
      { type: "text-end", id: "evt_1" },
    ]);
  });

  it("splits completed agent messages into incremental text deltas", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);
    const text =
      "Reliable CRM notes make every follow-up easier because context stays attached to the client.";

    await callbacks.onAgentMessage?.({
      id: "evt_1",
      content: [{ type: "text", text }],
    } as never);

    const textDeltas = writes.filter(
      (write): write is { type: "text-delta"; id: string; delta: string } =>
        typeof write === "object" &&
        write !== null &&
        (write as { type?: string }).type === "text-delta",
    );

    expect(textDeltas.length).toBeGreaterThan(1);
    expect(textDeltas.map((delta) => delta.delta).join("")).toBe(text);
    expect(writes.at(0)).toEqual({ type: "text-start", id: "evt_1" });
    expect(writes.at(-1)).toEqual({ type: "text-end", id: "evt_1" });
  });

  it("emits tool-input-available for agent.custom_tool_use", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolUse?.({
      id: "tool_1",
      name: "sunder_web_search",
      input: { query: "kate" },
    } as never);

    expect(writes).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool_1",
        toolName: "web_search",
        input: { query: "kate" },
      },
    ]);
  });

  it("emits tool-output-available for user.custom_tool_result", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolResult?.({
      custom_tool_use_id: "tool_1",
      content: [{ text: "{\"ok\":true}" }],
    } as never);

    expect(writes).toEqual([
      {
        type: "tool-output-available",
        toolCallId: "tool_1",
        output: { ok: true },
      },
    ]);
  });

  it("emits tool-output-error for custom tool errors", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolResult?.({
      custom_tool_use_id: "tool_1",
      is_error: true,
      content: [{ text: "{\"success\":false,\"error\":\"bad input\"}" }],
    } as never);

    expect(writes).toEqual([
      {
        type: "tool-output-error",
        toolCallId: "tool_1",
        errorText: "{\"success\":false,\"error\":\"bad input\"}",
      },
    ]);
  });

  it("emits tool-output-available for built-in agent.tool_result using tool_use_id", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolResult?.({
      tool_use_id: "tool_2",
      content: [{ text: "file contents" }],
    } as never);

    expect(writes).toEqual([
      {
        type: "tool-output-available",
        toolCallId: "tool_2",
        output: "file contents",
      },
    ]);
  });

  it("emits tool-output-error for built-in tool errors", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolResult?.({
      tool_use_id: "tool_3",
      is_error: true,
      content: [{ text: "permission denied" }],
    } as never);

    expect(writes).toEqual([
      {
        type: "tool-output-error",
        toolCallId: "tool_3",
        errorText: "permission denied",
      },
    ]);
  });

  it("drops malformed tool result events that have no tool id", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onAgentToolResult?.({
      content: [{ text: "orphaned result" }],
    } as never);

    expect(writes).toEqual([]);
  });

  it("emits tool-input-available and tool-approval-request for approvals", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onApprovalRequired?.({
      id: "tool_1",
      name: "bash",
      input: { command: "rm -rf /tmp" },
    } as never, "approval_1");

    expect(writes).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool_1",
        toolName: "bash",
        input: { command: "rm -rf /tmp" },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval_1",
        toolCallId: "tool_1",
      },
    ]);
  });

  it("emits error chunks for session.error", async () => {
    const { writes, writer } = mockWriter();
    const callbacks = buildUiStreamCallbacks(writer);

    await callbacks.onSessionError?.({
      error: { message: "Session error" },
    } as never);

    expect(writes).toEqual([
      {
        type: "error",
        errorText: "Session error",
      },
    ]);
  });
});
