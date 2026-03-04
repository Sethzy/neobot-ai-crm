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
  isDraftRoute?: boolean;
}

export function ChatThreadPageClient({
  threadId,
  initialMessages,
  isDraftRoute = false,
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
      if (isDraftRoute) {
        return;
      }

      const title = generateThreadTitle(firstUserMessage);
      if (title) {
        updateThreadTitle(threadId, title);
      }
    },
    [isDraftRoute, threadId, updateThreadTitle],
  );

  const handleCanonicalThreadId = useCallback(
    (canonicalThreadId: string) => {
      if (canonicalThreadId === threadId) {
        return;
      }

      /** Update the URL bar without triggering a React navigation/remount.
       *  A full router.replace would unmount ChatPanel mid-stream, killing
       *  the active useChat stream before the assistant response arrives. */
      window.history.replaceState(null, "", `/chat/${canonicalThreadId}`);
    },
    [threadId],
  );

  return (
    <ChatPanel
      chatId={threadId}
      initialMessages={initialMessages}
      initialMessage={initialMessages.length === 0 ? initialMessageRef.current : undefined}
      onAutoName={handleAutoName}
      onCanonicalThreadId={handleCanonicalThreadId}
    />
  );
}
