/**
 * ask_user_question tool for structured user input during agent runs.
 * Surfaces 2-4 options mid-task; the user picks one and the agent continues.
 * Constrained to one question per call to match the "one follow-up at a time" rule.
 * The execute function echoes questions back — the UI renders interactive buttons.
 * @module lib/runner/tools/utility/ask-user-question
 */
import { tool } from "ai";
import { z } from "zod";

const optionSchema = z.object({
  label: z.string().describe("Concise option label (1-5 words)."),
  description: z
    .string()
    .describe("What this option means or what happens if chosen."),
});

const questionSchema = z.object({
  question: z
    .string()
    .describe("The question to ask. Be specific, end with '?'."),
  header: z
    .string()
    .max(12)
    .describe(
      "Short label displayed as a tag (max 12 chars). E.g., 'Action', 'Format'.",
    ),
  options: z
    .array(optionSchema)
    .min(2)
    .max(4)
    .describe(
      "2-4 concrete options. Put recommended option first with '(Recommended)' suffix.",
    ),
  multiSelect: z
    .boolean()
    .describe("If true, user can select multiple options."),
});

/**
 * Creates the ask_user_question tool. Stateless — no DB or client context needed.
 */
export function createAskUserQuestionTool() {
  const ask_user_question = tool({
    description:
      "Ask the user a question with structured options. Use when you need user input to proceed: " +
      "gathering preferences, clarifying ambiguous instructions, or offering implementation choices. " +
      "Present 2-4 concrete options. Users can always select 'Other' to type a custom response. " +
      "If you recommend an option, put it first and add '(Recommended)' to the label.",
    inputSchema: z.object({
      questions: z.array(questionSchema).min(1).max(1),
    }),
    execute: async ({ questions }) => {
      // Echo questions back as output — the UI renders them as interactive buttons.
      // The user's response arrives as a new chat message on the next turn.
      return { questions, status: "awaiting_response" as const };
    },
  });

  return { ask_user_question };
}
