/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { threadKeys } from "@/hooks/use-threads";
import { ChatComposer } from "./chat-composer";
import { getMessageText } from "./message-content";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  chatId: string;
  /** Initial persisted messages loaded server-side for this thread route. */
  initialMessages?: UIMessage[];
  /** Called once with the first user message text for auto-naming new threads. */
  onAutoName?: (firstUserMessage: string) => void;
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  onAutoName,
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest({ id, messages }) {
          const lastMessage = messages.at(-1);
          const isToolApprovalContinuation = lastMessage?.role !== "user" || messages.some((message) =>
            message.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return state === "approval-responded" || state === "output-denied";
            })
          );

          return {
            body: isToolApprovalContinuation
              ? { id, messages }
              : { id, message: lastMessage },
          };
        },
      }),
    [],
  );

  const hasAutoNamed = useRef(false);

  useEffect(() => {
    hasAutoNamed.current = initialMessages.some((message) => message.role === "user");
  }, [chatId, initialMessages]);

  const { messages, sendMessage, status, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onData: (dataPart) => {
      if (
        typeof dataPart === "object" &&
        dataPart !== null &&
        "type" in dataPart &&
        dataPart.type === "data-chat-title"
      ) {
        queryClient.invalidateQueries({ queryKey: threadKeys.all });
      }
    },
    onFinish: async ({ messages: finishedMessages }) => {
      if (!hasAutoNamed.current && onAutoName) {
        const firstUserMsg = finishedMessages.find((message) => message.role === "user");
        if (firstUserMsg) {
          hasAutoNamed.current = true;
          onAutoName(getMessageText(firstUserMsg));
        }
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.length === 0 || isLoading) {
        return;
      }

      if (typeof window !== "undefined" && window.location.pathname === "/chat") {
        window.history.pushState({}, "", `/chat/${chatId}`);
      }

      sendMessage({ text });
    },
    [chatId, isLoading, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p>{error.message}</p>
        </div>
      ) : null}

      <MessageList messages={messages} status={status} />

      <ChatComposer status={status} onSubmit={handleSubmit} />
    </div>
  );
}
