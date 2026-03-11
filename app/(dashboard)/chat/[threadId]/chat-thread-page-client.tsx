/**
 * Client wrapper for a resolved chat thread route.
 * Renders ChatPanel for an existing thread.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client
 */
"use client";

import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/chat/chat-panel";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";

interface ChatThreadPageClientProps {
  threadId: string;
  initialMessages: UIMessage[];
  initialQuota?: MessageQuotaStatus | null;
}

export function ChatThreadPageClient({
  threadId,
  initialMessages,
  initialQuota = null,
}: ChatThreadPageClientProps) {
  return (
    <ChatPanel
      chatId={threadId}
      initialMessages={initialMessages}
      initialQuota={initialQuota}
      autoResume
    />
  );
}
