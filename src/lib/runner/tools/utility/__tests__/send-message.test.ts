/**
 * Tests for the send_message utility tool stub.
 * @module lib/runner/tools/utility/__tests__/send-message
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { createSendMessageTool } from "../send-message";

describe("createSendMessageTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("exposes the Tasklet-aligned tool contract", () => {
    const tools = createSendMessageTool();

    expect(tools).toHaveProperty("send_message");
    expect(tools.send_message).toHaveProperty("execute");
    expect(tools.send_message).toHaveProperty("inputSchema");
  });

  test("logs the attempted delivery and returns an explicit non-delivery result", async () => {
    const tools = createSendMessageTool();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await tools.send_message.execute({
      to: ["owner"],
      subject: "Autopilot update",
      body: "A noteworthy background update is ready.",
      attachments: ["state/report.md"],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[send_message]"),
      expect.objectContaining({
        to: ["owner"],
        subject: "Autopilot update",
      }),
    );
    expect(result).toEqual({
      success: false,
      delivered: false,
      error: "send_message is not implemented until PR 32a",
      source: "send_message",
    });
  });
});
