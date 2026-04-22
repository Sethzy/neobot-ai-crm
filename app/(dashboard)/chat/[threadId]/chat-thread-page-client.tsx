/**
 * Client wrapper for a resolved chat thread route.
 * Renders ChatPanel for an existing thread.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client
 */
"use client";

import type { UIMessage } from "ai";

import { ChatErrorBoundary } from "@/components/chat/chat-error-boundary";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatThreadActions } from "@/components/chat/chat-thread-actions";
import { ChatThreadHeader } from "@/components/chat/chat-thread-header";
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatThreadHeader threadId={threadId} />
        <ChatThreadActions threadId={threadId} />
        <ChatPanel
          key={threadId}
          chatId={threadId}
          initialMessages={initialMessages}
          initialQuota={initialQuota}
          initialChatModel={initialChatModel}
          autoResume
        />
      </div>
    </ChatErrorBoundary>
  );
}
