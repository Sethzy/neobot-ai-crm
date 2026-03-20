/**
 * ask_user_question tool for structured user input during agent runs.
 * Schema aligned with Anthropic's ask_user_input_v0: string options, type enum, 1-3 questions.
 * The execute function echoes questions back — the UI renders interactive widgets.
 * @module lib/runner/tools/utility/ask-user-question
 */
import { tool } from "ai";
import { z } from "zod";

const questionSchema = z.object({
  question: z
    .string()
    .describe("The question text shown to the user."),
  options: z
    .array(z.string().describe("Short label"))
    .min(2)
    .max(4)
    .describe("2-4 options with short, self-explanatory labels."),
  type: z
    .enum(["single_select", "multi_select", "rank_priorities"])
    .default("single_select")
    .describe(
      "Question type: 'single_select' for choosing 1 option, " +
      "'multi_select' for choosing 1 or more options, " +
      "'rank_priorities' for drag-and-drop ranking between options.",
    ),
});

/**
 * Creates the ask_user_question tool. Stateless — no DB or client context needed.
 */
export function createAskUserQuestionTool() {
  const ask_user_question = tool({
    description:
      "USE THIS TOOL WHENEVER YOU HAVE A QUESTION FOR THE USER. Instead of asking questions in prose, " +
      "present options as clickable choices. Your questions will be presented to the user as a widget in chat.\n\n" +
      "USE THIS TOOL WHEN:\n" +
      "- User asks a question with 2-10 reasonable answers\n" +
      "- You need clarification to proceed\n" +
      "- Ranking or prioritization would help\n" +
      "- User says 'which should I...' or 'what do you recommend...'\n" +
      "- User asks for a recommendation across a broad area needing refinement\n\n" +
      "HOW TO USE:\n" +
      "- Always include a brief conversational message before calling this tool\n" +
      "- Generally prefer multi_select — users may have multiple preferences\n" +
      "- Use short, self-explanatory labels (no descriptions needed)\n" +
      "- Collect all info needed up front rather than spreading over multiple turns\n" +
      "- Prefer 1-3 questions with up to 4 options each\n\n" +
      "SKIP THIS TOOL WHEN:\n" +
      "- Question is open-ended (names, descriptions, free feedback)\n" +
      "- User is clearly venting, not seeking choices\n" +
      "- Context makes the right choice obvious\n" +
      "- User explicitly asked to discuss options in prose",
    inputSchema: z.object({
      questions: z.array(questionSchema).min(1).max(3),
    }),
    execute: async ({ questions }) => {
      // Echo questions back as output — the UI renders them as interactive widgets.
      // The user's response arrives as a new chat message on the next turn.
      return { questions, status: "awaiting_response" as const };
    },
  });

  return { ask_user_question };
}
