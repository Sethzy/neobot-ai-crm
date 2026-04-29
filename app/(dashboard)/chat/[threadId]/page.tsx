/**
 * Server-rendered chat thread page.
 * Resolves thread ownership, loads persisted messages, and seeds the client chat state.
 * @module app/(dashboard)/chat/[threadId]/page
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { TelegramCtaBanner } from "@/components/agent/telegram-cta-banner";
import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { resolveModelId } from "@/lib/ai/models";
import { resolveClientId } from "@/lib/chat/client-id";
import { mapDbMessageToUiMessage } from "@/lib/chat/message-normalization";
import { listMessages } from "@/lib/chat/messages";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";

import { ChatThreadPageClient } from "./chat-thread-page-client";

interface ChatThreadPageProps {
  params: Promise<{ threadId: string }>;
}

const threadIdSchema = z.string().uuid();

export default async function ChatThreadPage({ params }: ChatThreadPageProps) {
  const { threadId } = await params;

  if (!threadIdSchema.safeParse(threadId).success) {
    redirect("/chat");
    return null;
  }

  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  const { data: thread, error: threadLookupError } = await supabase
    .from("conversation_threads")
    .select("thread_id, is_primary, chat_model")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .maybeSingle();

  if (threadLookupError) {
    throw new Error("Failed to load thread.");
  }

  if (!thread) {
    redirect("/chat");
    return null;
  }

  const [
    persistedMessages,
    initialQuota,
    authResult,
  ] = await Promise.all([
    listMessages(supabase, threadId),
    loadCurrentMessageQuota(),
    thread.is_primary ? supabase.auth.getUser() : Promise.resolve({ data: { user: null } }),
  ]);
  const initialMessages = persistedMessages.map(mapDbMessageToUiMessage);
  // The thread row is the source of truth — once a thread exists, its
  // model is locked. The cookie only seeds new threads.
  const initialChatModel = resolveModelId(thread.chat_model);
  const telegramConnection = thread.is_primary && authResult.data.user
    ? await supabase
      .from("messaging_channel_connections")
      .select("id")
      .eq("user_id", authResult.data.user.id)
      .eq("channel", "telegram")
      .maybeSingle()
    : null;
  const shouldShowTelegramCta = thread.is_primary && !telegramConnection?.data;

  return (
    <>
      {shouldShowTelegramCta ? <TelegramCtaBanner /> : null}
      <ChatThreadPageClient
        threadId={threadId}
        initialMessages={initialMessages}
        initialQuota={initialQuota}
        initialChatModel={initialChatModel}
      />
      <DataStreamHandler />
    </>
  );
}
