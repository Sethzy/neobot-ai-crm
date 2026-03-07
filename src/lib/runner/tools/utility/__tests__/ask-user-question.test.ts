/**
 * Tests for the ask_user_question tool definition and execute function.
 * @module lib/runner/tools/utility/__tests__/ask-user-question
 */
import { describe, expect, it } from "vitest";

import { createAskUserQuestionTool } from "../ask-user-question";

describe("createAskUserQuestionTool", () => {
  it("returns the ask_user_question tool with an execute function", () => {
    const tools = createAskUserQuestionTool();
    expect(tools).toHaveProperty("ask_user_question");
    expect(tools.ask_user_question).toHaveProperty("execute");
  });

  it("execute echoes questions back with awaiting_response status", async () => {
    const { ask_user_question } = createAskUserQuestionTool();
    const questions = [
      {
        question: "Which format?",
        header: "Format",
        options: [
          { label: "Markdown", description: "Plain text with formatting" },
          { label: "PDF", description: "Formatted document" },
        ],
        multiSelect: false,
      },
    ];

    const result = await ask_user_question.execute(
      { questions },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      questions,
      status: "awaiting_response",
    });
  });
});
