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
