/**
 * Tests for the ask_user_question tool.
 * @module lib/runner/tools/utility/__tests__/ask-user-question.test
 */
import { describe, expect, it } from "vitest";

import { createAskUserQuestionTool } from "../ask-user-question";

describe("createAskUserQuestionTool", () => {
  it("returns the ask_user_question tool with an execute function", () => {
    const tools = createAskUserQuestionTool();
    expect(tools).toHaveProperty("ask_user_question");
    expect(tools.ask_user_question).toHaveProperty("execute");
  });

  it("echoes a single question back with awaiting_response status", async () => {
    const { ask_user_question } = createAskUserQuestionTool();
    const questions = [
      {
        question: "Which format?",
        options: ["Markdown", "PDF", "CSV"],
        type: "single_select" as const,
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

  it("accepts up to 3 questions and echoes them all back", async () => {
    const { ask_user_question } = createAskUserQuestionTool();
    const questions = [
      { question: "Q1?", options: ["A", "B"], type: "single_select" as const },
      { question: "Q2?", options: ["C", "D"], type: "multi_select" as const },
      { question: "Q3?", options: ["E", "F", "G"], type: "rank_priorities" as const },
    ];

    const result = await ask_user_question.execute(
      { questions },
      { toolCallId: "tc-2", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.questions).toHaveLength(3);
    expect(result.status).toBe("awaiting_response");
  });
});
