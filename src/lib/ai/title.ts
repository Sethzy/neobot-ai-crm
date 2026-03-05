/**
 * Server-side chat title generation helper.
 * @module lib/ai/title
 */
import { generateText } from "ai";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";

const TITLE_PROMPT =
  "Generate a short chat title (2-5 words) for a conversation starting with the user message below. Output ONLY the title text, no punctuation, no quotes, no formatting.";

/**
 * Generates a concise title from an initial user message.
 */
export async function generateTitleFromUserMessage(userMessage: string): Promise<string> {
  const { text } = await generateText({
    model: gateway(TIER_1_MODEL),
    system: TITLE_PROMPT,
    prompt: userMessage,
  });

  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}
