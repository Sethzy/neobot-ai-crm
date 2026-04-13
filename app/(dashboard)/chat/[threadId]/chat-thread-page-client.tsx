/**
 * Client wrapper for a resolved chat thread route.
 * Renders ChatPanel for an existing thread.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client
 */
"use client";

import type { UIMessage } from "ai";

import { ChatErrorBoundary } from "@/components/chat/chat-error-boundary";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";

interface ChatThreadPageClientProps {
  threadId: string;
  initialMessages: UIMessage[];
  initialQuota?: MessageQuotaStatus | null;
  initialChatModel?: string;
}

export function ChatThreadPageClient({
  threadId,
  initialMessages,
  initialQuota = null,
  initialChatModel,
}: ChatThreadPageClientProps) {
  return (
    <ChatErrorBoundary>
      <ChatPanel
        key={threadId}
        chatId={threadId}
        initialMessages={initialMessages}
        initialQuota={initialQuota}
        initialChatModel={initialChatModel}
        autoResume
      />
    </ChatErrorBoundary>
  );
}
