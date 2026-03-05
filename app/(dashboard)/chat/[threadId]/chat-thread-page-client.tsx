/**
 * Client wrapper for a resolved chat thread route.
 * Renders ChatPanel for an existing thread.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client
 */
"use client";

import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/chat/chat-panel";

interface ChatThreadPageClientProps {
  threadId: string;
  initialMessages: UIMessage[];
}

export function ChatThreadPageClient({
  threadId,
  initialMessages,
}: ChatThreadPageClientProps) {
  return (
    <ChatPanel
      chatId={threadId}
      initialMessages={initialMessages}
      autoResume
    />
  );
}
