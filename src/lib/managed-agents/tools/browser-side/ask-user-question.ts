/**
 * ask_user_question tool for managed agents.
 *
 * @module lib/managed-agents/tools/browser-side/ask-user-question
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

const questionSchema = z.object({
  question: z.string().describe("The question text shown to the user."),
  options: z.array(z.string().describe("Short label")).min(2).max(4).describe("2-4 options with short, self-explanatory labels."),
  type: z.enum(["single_select", "multi_select", "rank_priorities"]).default("single_select").describe(
    "Question type: 'single_select' for choosing 1 option, 'multi_select' for choosing 1 or more options, 'rank_priorities' for drag-and-drop ranking between options.",
  ),
});

const inputSchema = z.object({
  questions: z.array(questionSchema).min(1).max(3),
});

type AskUserQuestionInput = z.infer<typeof inputSchema>;

export const askUserQuestionTool: ManagedAgentTool<
  AskUserQuestionInput,
  { questions: AskUserQuestionInput["questions"]; status: "awaiting_response" }
> = {
  name: "ask_user_question",
  description:
    "USE THIS TOOL WHENEVER YOU HAVE A QUESTION FOR THE USER. Instead of asking questions in prose, " +
    "present options as clickable choices. Your questions will be presented to the user as a widget in chat.",
  inputSchema,
  execute: async ({ questions }) => ({ questions, status: "awaiting_response" as const }),
};
