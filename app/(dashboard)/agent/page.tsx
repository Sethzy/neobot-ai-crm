/**
 * Agent page — always shows the primary thread chat.
 * "The first conversation IS the product." No Telegram gate.
 * Inline CTA banner shown when Telegram is not yet connected.
 * @module app/(dashboard)/agent/page
 */
import { redirect } from "next/navigation";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { TelegramCtaBanner } from "@/components/agent/telegram-cta-banner";
import { resolveClientId } from "@/lib/chat/client-id";
import { mapDbMessageToUiMessage } from "@/lib/chat/message-normalization";
import { listMessages } from "@/lib/chat/messages";
import { getPrimaryThread } from "@/lib/chat/threads";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";

import { ChatThreadPageClient } from "../chat/[threadId]/chat-thread-page-client";

export default async function AgentPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  const primaryThread = await getPrimaryThread(supabase, clientId);

  if (!primaryThread) {
    redirect("/chat");
    return null;
  }

  const threadId = primaryThread.thread_id;

  const [persistedMessages, telegramMapping, initialQuota] = await Promise.all([
    listMessages(supabase, threadId),
    supabase
      .from("conversation_channel_mappings")
      .select("channel")
      .eq("client_id", clientId)
      .eq("channel", "telegram")
      .maybeSingle(),
    loadCurrentMessageQuota(),
  ]);

  const initialMessages = persistedMessages.map(mapDbMessageToUiMessage);
  const hasTelegram = Boolean(telegramMapping.data);

  return (
    <>
      {!hasTelegram && <TelegramCtaBanner />}
      <ChatThreadPageClient
        threadId={threadId}
        initialMessages={initialMessages}
        initialQuota={initialQuota}
      />
      <DataStreamHandler />
    </>
  );
}
