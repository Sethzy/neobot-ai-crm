/**
 * Client wrapper for a resolved chat thread route.
 * Handles context selection and thread auto-naming while rendering ChatPanel.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client
 */
"use client";

import type { UIMessage } from "ai";
import { useCallback, useRef } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { useThreads } from "@/contexts/thread-context";
import { getInitialMessageHandoffKey } from "@/lib/chat/initial-message-handoff";
import { generateThreadTitle } from "@/lib/chat/thread-title";

interface ChatThreadPageClientProps {
  threadId: string;
  initialMessages: UIMessage[];
}

export function ChatThreadPageClient({
  threadId,
  initialMessages,
}: ChatThreadPageClientProps) {
  const { updateThreadTitle } = useThreads();
  const initialMessageRef = useRef<string | undefined>(
    typeof window !== "undefined"
      ? (() => {
          const key = getInitialMessageHandoffKey(threadId);
          const initialMessage = sessionStorage.getItem(key) ?? undefined;
          sessionStorage.removeItem(key);
          return initialMessage;
        })()
      : undefined,
  );

  const handleAutoName = useCallback(
    (firstUserMessage: string) => {
      const title = generateThreadTitle(firstUserMessage);
      if (title) {
        updateThreadTitle(threadId, title);
      }
    },
    [threadId, updateThreadTitle],
  );

  return (
    <ChatPanel
      chatId={threadId}
      initialMessages={initialMessages}
      initialMessage={initialMessages.length === 0 ? initialMessageRef.current : undefined}
      onAutoName={handleAutoName}
    />
  );
}
