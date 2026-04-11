import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { sendMessageTool } from "../send-message";

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: "client-1",
    isChatContext: true,
  };
}

describe("sendMessageTool", () => {
  it("returns the stub unavailable response", async () => {
    const result = await sendMessageTool.execute(
      { to: ["owner"], body: "Hello" },
      makeContext(),
    );

    expect(result).toEqual({
      success: false,
      data: null,
      error: "Message delivery is not available in this environment",
      source: "send_message",
    });
  });
});
