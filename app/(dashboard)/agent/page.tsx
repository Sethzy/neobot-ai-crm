/**
 * Agent page — always shows the primary thread chat.
 * "The first conversation IS the product." No Telegram gate.
 * Inline CTA banner shown when Telegram is not yet connected.
 * @module app/(dashboard)/agent/page
 */
import type { UIMessage } from "ai";
import { redirect } from "next/navigation";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { TelegramCtaBanner } from "@/components/agent/telegram-cta-banner";
import { resolveClientId } from "@/lib/chat/client-id";
import { listMessages } from "@/lib/chat/messages";
import { getPrimaryThread } from "@/lib/chat/threads";
import { rehydrateSpecParts } from "@/lib/runner/message-utils";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";
import type { Json } from "@/types/database";

import { ChatThreadPageClient } from "../chat/[threadId]/chat-thread-page-client";

const uiMessageRoles = ["system", "user", "assistant"] as const;

function isUiMessageRole(role: string): role is (typeof uiMessageRoles)[number] {
  return uiMessageRoles.includes(role as (typeof uiMessageRoles)[number]);
}

function normalizeMessageParts(parts: Json | null, content: string | null): UIMessage["parts"] {
  if (Array.isArray(parts)) {
    return rehydrateSpecParts(parts as Record<string, unknown>[]) as UIMessage["parts"];
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
