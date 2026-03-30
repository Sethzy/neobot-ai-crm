/**
 * Server-rendered chat thread page.
 * Resolves thread ownership, loads persisted messages, and seeds the client chat state.
 * @module app/(dashboard)/chat/[threadId]/page
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { CHAT_MODEL_COOKIE_NAME, resolveModelId } from "@/lib/ai/models";
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
    .select("thread_id")
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

  const persistedMessages = await listMessages(supabase, threadId);
  const initialMessages = persistedMessages.map(mapDbMessageToUiMessage);
  const initialQuota = await loadCurrentMessageQuota();
  const cookieStore = await cookies();
  const initialChatModel = resolveModelId(
    cookieStore.get(CHAT_MODEL_COOKIE_NAME)?.value,
  );

  return (
    <>
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
