/**
 * Shared external channel delivery helpers.
 * @module lib/channels/deliver
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { extractApprovalPartsFromPersisted, type PersistedPart } from "@/lib/runner/message-utils";
import type { Database } from "@/types/database";

type AskUserQuestionOutput = {
  questions?: Array<{
    question?: string;
    options?: string[];
    type?: "single_select" | "multi_select" | "rank_priorities";
  }>;
};

/**
 * Returns true if a completed run produced content that external channels should receive.
 */
export function hasExternalDeliverables(
  text: string,
  parts?: ReadonlyArray<PersistedPart>,
): boolean {
  if (text.trim().length > 0) {
    return true;
  }

  if (!parts || parts.length === 0) {
    return false;
  }

  return parts.some((part) =>
    part.state === "approval-requested" ||
    (
      part.type === "tool-ask_user_question" &&
      part.state === "output-available" &&
      typeof part.output === "object" &&
      part.output !== null
    )
  );
}


function extractQuestionOutputs(parts?: ReadonlyArray<PersistedPart>) {
  if (!parts?.length) {
    return [];
  }

  return parts.flatMap((part) => {
    if (
      part.type !== "tool-ask_user_question" ||
      part.state !== "output-available" ||
      typeof part.output !== "object" ||
      part.output === null
    ) {
      return [];
    }

    const output = part.output as AskUserQuestionOutput;
    const questions = Array.isArray(output.questions)
      ? output.questions.flatMap((question) => {
        if (
          typeof question?.question !== "string" ||
          !Array.isArray(question.options) ||
          (question.type !== "single_select" &&
            question.type !== "multi_select" &&
            question.type !== "rank_priorities")
        ) {
          return [];
        }

        return [{
          question: question.question,
          options: question.options.filter((option): option is string => typeof option === "string"),
          type: question.type,
        }];
      })
      : [];

    return questions.length > 0 ? [questions] : [];
  });
}

/**
 * Delivers assistant output to external channel mappings on the thread.
 */
export async function deliverToExternalChannels(
  supabase: SupabaseClient<Database>,
  threadId: string,
  clientId: string,
  text: string,
  parts?: ReadonlyArray<PersistedPart>,
): Promise<void> {
  if (!hasExternalDeliverables(text, parts)) {
    return;
  }

  const { data: mappings } = await supabase
    .from("conversation_channel_mappings")
    .select("channel, external_conversation_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId);

  if (!mappings?.length) {
    return;
  }

  for (const mapping of mappings) {
    if (mapping.channel !== "telegram") {
      continue;
    }

    try {
      await deliverToTelegram({
        supabase,
        threadId,
        clientId,
        chatId: mapping.external_conversation_id,
        text,
        parts,
      });
    } catch (error) {
      console.error("[channel-delivery] Telegram delivery failed:", error);
    }
  }
}

async function deliverToTelegram(input: {
  supabase: SupabaseClient<Database>;
  threadId: string;
  clientId: string;
  chatId: string;
  text: string;
  parts?: ReadonlyArray<PersistedPart>;
}): Promise<void> {
  const {
    buildUnsupportedQuestionFallback,
    createTelegramBot,
    getTelegramBotToken,
    sendTelegramApprovalRequest,
    sendTelegramQuestion,
    sendTelegramMessage,
  } = await import("@/lib/channels/telegram");
  const { deletePendingQuestionBatch, persistPendingQuestionBatch } = await import(
    "@/lib/channels/telegram/pending-questions"
  );

  const bot = createTelegramBot(getTelegramBotToken());

  if (input.text.trim()) {
    await sendTelegramMessage(bot.api, input.chatId, input.text);
  }

  for (const approvalPart of extractApprovalPartsFromPersisted(input.parts)) {
    await sendTelegramApprovalRequest(
      bot.api,
      input.chatId,
      approvalPart.approvalId,
      approvalPart.toolName,
      approvalPart.input,
    );
  }

  const [firstQuestionBatch] = extractQuestionOutputs(input.parts);
  if (!firstQuestionBatch) {
    return;
  }

  const batch = await persistPendingQuestionBatch(input.supabase, {
    clientId: input.clientId,
    threadId: input.threadId,
    chatId: input.chatId,
    questions: firstQuestionBatch,
  });
  const firstQuestion = firstQuestionBatch[0];

  if (!firstQuestion) {
    return;
  }

  try {
    if (firstQuestion.type === "single_select") {
      await sendTelegramQuestion(
        bot.api,
        input.chatId,
        batch.token,
        0,
        firstQuestion.question,
        firstQuestion.options,
      );
      return;
    }

    await sendTelegramMessage(
      bot.api,
      input.chatId,
      buildUnsupportedQuestionFallback(
        firstQuestion.question,
        firstQuestion.options,
        firstQuestion.type,
      ),
    );
  } catch (error) {
    try {
      await deletePendingQuestionBatch(input.supabase, batch.token);
    } catch (cleanupError) {
      console.error("[channel-delivery] Failed to clean up pending Telegram question:", cleanupError);
    }

    throw error;
  }
}
