import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { askUserQuestionTool } from "../ask-user-question";

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: "client-1",
    isChatContext: true,
  };
}

describe("askUserQuestionTool", () => {
  it("echoes questions back with awaiting_response status", async () => {
    const questions = [
      { question: "Which?", options: ["A", "B"], type: "single_select" as const },
    ];
    const result = await askUserQuestionTool.execute({ questions }, makeContext());
    expect(result).toEqual({ questions, status: "awaiting_response" });
  });
});
