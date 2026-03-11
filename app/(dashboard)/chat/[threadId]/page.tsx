/**
 * Server-rendered chat thread page.
 * Resolves thread ownership, loads persisted messages, and seeds the client chat state.
 * @module app/(dashboard)/chat/[threadId]/page
 */
import type { UIMessage } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { resolveClientId } from "@/lib/chat/client-id";
import { listMessages } from "@/lib/chat/messages";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";
import type { Json } from "@/types/database";

import { ChatThreadPageClient } from "./chat-thread-page-client";

interface ChatThreadPageProps {
  params: Promise<{ threadId: string }>;
}

const threadIdSchema = z.string().uuid();

const uiMessageRoles = ["system", "user", "assistant"] as const;

function isUiMessageRole(role: string): role is (typeof uiMessageRoles)[number] {
  return uiMessageRoles.includes(role as (typeof uiMessageRoles)[number]);
}

function normalizeMessageParts(parts: Json | null, content: string | null): UIMessage["parts"] {
  if (Array.isArray(parts)) {
    return parts as UIMessage["parts"];
  }

  if (content) {
    return [{ type: "text", text: content }];
  }

  return [];
}

function mapDbMessageToUiMessage(message: {
  message_id: string;
  role: string;
  content: string | null;
  parts: Json | null;
}): UIMessage {
  const role = isUiMessageRole(message.role) ? message.role : "assistant";

  return {
    id: message.message_id,
    role,
    parts: normalizeMessageParts(message.parts, message.content),
  };
}

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

  return (
    <>
      <ChatThreadPageClient
        threadId={threadId}
        initialMessages={initialMessages}
        initialQuota={initialQuota}
      />
      <DataStreamHandler />
    </>
  );
}
