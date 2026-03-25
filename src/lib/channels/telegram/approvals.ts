/**
 * Telegram approval text, callback, and keyboard helpers.
 * @module lib/channels/telegram/approvals
 */
import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";

import { escapeHtml } from "./format";

/** Builds the HTML body for one approval request message. */
export function buildApprovalText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const inputText = JSON.stringify(input, null, 2).slice(0, 500);

  return [
    "⚠️ <b>Approval Required</b>",
    "",
    `Tool: <b>${escapeHtml(toolName)}</b>`,
    `<pre>${escapeHtml(inputText)}</pre>`,
  ].join("\n");
}

/** Encodes Telegram callback data for one approval response. */
export function buildApprovalCallbackData(approvalId: string, approved: boolean): string {
  return `${approved ? "approve" : "deny"}:${approvalId}`;
}

/** Builds the approve/deny inline keyboard. */
export function buildApprovalKeyboard(approvalId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Allow", buildApprovalCallbackData(approvalId, true))
    .text("❌ Deny", buildApprovalCallbackData(approvalId, false));
}

/** Parses approval callback data from Telegram inline button clicks. */
export function parseApprovalCallback(
  data: string,
): { action: "approve" | "deny"; approvalId: string } | null {
  const separatorIndex = data.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const action = data.slice(0, separatorIndex);
  const approvalId = data.slice(separatorIndex + 1);

  if ((action !== "approve" && action !== "deny") || !approvalId) {
    return null;
  }

  return { action, approvalId };
}

/** Sends one approval request message to Telegram. */
export async function sendTelegramApprovalRequest(
  api: Api,
  chatId: string,
  approvalId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  await api.sendMessage(Number(chatId), buildApprovalText(toolName, input), {
    parse_mode: "HTML",
    reply_markup: buildApprovalKeyboard(approvalId),
  });
}
