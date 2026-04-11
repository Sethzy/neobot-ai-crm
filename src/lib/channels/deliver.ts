/**
 * Shared external channel delivery helpers.
 * @module lib/channels/deliver
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TELEGRAM_CHANNEL } from "@/lib/channels/telegram/webhook";
import type { QuestionOption } from "@/lib/channels/telegram/questions";
import { extractApprovalPartsFromPersisted, type PersistedPart } from "@/lib/runner/message-utils";
import type { Database } from "@/types/database";

type AskUserQuestionOption = string | { label?: string; description?: string };

type AskUserQuestionOutput = {
  questions?: Array<{
    question?: string;
    options?: QuestionOption[];
    type?: "single_select" | "multi_select" | "rank_priorities";
  }>;
};

interface DeliveryReceiptInput {
  clientId: string;
  threadId: string;
  channel: string;
  deliveryId: string;
}

function buildOutboundDeliveryId(
  idempotencyKey: string,
  externalConversationId: string,
): string {
  return `managed-agent:${idempotencyKey}:${externalConversationId}`;
}

function isDuplicateReceiptError(error: { message?: string; code?: string } | null): boolean {
  return error?.code === "23505" || /duplicate key/i.test(error?.message ?? "");
}

async function claimDeliveryReceipt(
  supabase: SupabaseClient<Database>,
  input: DeliveryReceiptInput,
): Promise<boolean> {
  const { error } = await supabase.from("conversation_channel_delivery_receipts").insert({
    client_id: input.clientId,
    thread_id: input.threadId,
    channel: input.channel,
    delivery_id: input.deliveryId,
  });

  if (!error) {
    return true;
  }

  if (isDuplicateReceiptError(error)) {
    return false;
  }

  throw new Error(
    `Failed to claim delivery receipt ${input.deliveryId}: ${error.message}`,
  );
}

async function releaseDeliveryReceipt(
  supabase: SupabaseClient<Database>,
  input: DeliveryReceiptInput,
): Promise<void> {
  const { error } = await supabase
    .from("conversation_channel_delivery_receipts")
    .delete()
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .eq("delivery_id", input.deliveryId);

  if (error) {
    console.error("[channel-delivery] Failed to release outbound delivery receipt:", error);
  }
}

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

        const options: QuestionOption[] = [];

        for (const option of question.options as AskUserQuestionOption[]) {
          if (typeof option === "string") {
            options.push(option);
            continue;
          }

          if (typeof option === "object" && option !== null && typeof option.label === "string") {
            options.push(
              typeof option.description === "string"
                ? { label: option.label, description: option.description }
                : option.label,
            );
          }
        }

        return [{
          question: question.question,
          options,
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
  idempotencyKey?: string,
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
    if (mapping.channel !== TELEGRAM_CHANNEL) {
      continue;
    }

    const deliveryId = idempotencyKey
      ? buildOutboundDeliveryId(idempotencyKey, mapping.external_conversation_id)
      : null;

    try {
      if (
        deliveryId &&
        !(await claimDeliveryReceipt(supabase, {
          clientId,
          threadId,
          channel: mapping.channel,
          deliveryId,
        }))
      ) {
        continue;
      }

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

      if (deliveryId) {
        await releaseDeliveryReceipt(supabase, {
          clientId,
          threadId,
          channel: mapping.channel,
          deliveryId,
        });
      }
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

  const approvalParts = extractApprovalPartsFromPersisted(input.parts);
  await Promise.all(approvalParts.map((approvalPart) =>
    sendTelegramApprovalRequest(
      bot.api,
      input.chatId,
      approvalPart.approvalId,
      approvalPart.toolName,
      approvalPart.input,
    ),
  ));

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
