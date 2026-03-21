/**
 * Telegram adapter helpers for ask_user_question output.
 * @module lib/channels/telegram/questions
 */
import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds the HTML body for a Telegram question prompt. */
export function buildQuestionText(question: string, options: string[]): string {
  const lines = [`❓ ${escapeHtml(question)}`, ""];

  for (let index = 0; index < options.length; index += 1) {
    lines.push(`${index + 1}. ${escapeHtml(options[index])}`);
  }

  return lines.join("\n");
}

/** Builds a two-column inline keyboard for single-select questions. */
export function buildQuestionCallbackData(
  requestId: string,
  questionIndex: number,
  optionIndex: number,
): string {
  return `q:${requestId}:${questionIndex}:${optionIndex}`;
}

/** Builds a two-column inline keyboard for single-select questions. */
export function buildQuestionKeyboard(
  requestId: string,
  questionIndex: number,
  options: string[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let index = 0; index < options.length; index += 1) {
    keyboard.text(options[index], buildQuestionCallbackData(requestId, questionIndex, index));
    if (index % 2 === 1) {
      keyboard.row();
    }
  }

  return keyboard;
}

/** Parses callback data for question answer buttons. */
export function parseQuestionCallback(
  data: string,
): { requestId: string; questionIndex: number; optionIndex: number } | null {
  if (!data.startsWith("q:")) {
    return null;
  }

  const rest = data.slice(2);
  const lastColonIndex = rest.lastIndexOf(":");
  if (lastColonIndex < 0) {
    return null;
  }

  const requestAndQuestion = rest.slice(0, lastColonIndex);
  const optionIndex = Number.parseInt(rest.slice(lastColonIndex + 1), 10);
  const secondLastColonIndex = requestAndQuestion.lastIndexOf(":");

  if (secondLastColonIndex < 0) {
    return null;
  }

  const requestId = requestAndQuestion.slice(0, secondLastColonIndex);
  const questionIndex = Number.parseInt(
    requestAndQuestion.slice(secondLastColonIndex + 1),
    10,
  );

  if (!requestId || Number.isNaN(questionIndex) || Number.isNaN(optionIndex)) {
    return null;
  }

  return { requestId, questionIndex, optionIndex };
}

/** Formats collected question answers to match the web widget output contract. */
export function formatQuestionResponse(
  responses: Array<{ question: string; selectedOption: string }>,
): string {
  return responses.map((response) => (
    `Q: ${response.question}\nA: ${response.selectedOption}`
  )).join("\n\n");
}

/** Telegram inline buttons only support single-select question UX in v1. */
export function isSupportedQuestionType(type: string): boolean {
  return type === "single_select";
}

/** Builds the prose fallback for unsupported question types. */
export function buildUnsupportedQuestionFallback(
  question: string,
  options: string[],
  type: string,
): string {
  const optionList = options.map((option, index) => `${index + 1}. ${escapeHtml(option)}`).join("\n");
  const typeLabel = type === "multi_select"
    ? "You can pick multiple"
    : "Please rank these in order of priority";

  return [
    `❓ ${escapeHtml(question)}`,
    "",
    optionList,
    "",
    `<i>${typeLabel} — please reply with your answer.</i>`,
  ].join("\n");
}

/** Sends one supported single-select question to Telegram. */
export async function sendTelegramQuestion(
  api: Api,
  chatId: string,
  requestId: string,
  questionIndex: number,
  question: string,
  options: string[],
): Promise<void> {
  await api.sendMessage(Number(chatId), buildQuestionText(question, options), {
    parse_mode: "HTML",
    reply_markup: buildQuestionKeyboard(requestId, questionIndex, options),
  });
}
