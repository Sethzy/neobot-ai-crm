/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { AlertCircle } from "lucide-react";
import { useCallback, useMemo } from "react";

import { useAutoResume } from "@/hooks/use-auto-resume";
import { ChatComposer } from "./chat-composer";
import { useDataStream } from "./data-stream-provider";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  chatId: string;
  /** Initial persisted messages loaded server-side for this thread route. */
  initialMessages?: UIMessage[];
  /** Enables one-time stream resumption for existing threads. */
  autoResume?: boolean;
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  autoResume = false,
}: ChatPanelProps) {
  const { setDataStream } = useDataStream();
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

  const { messages, sendMessage, status, error, resumeStream, setMessages } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onData: (dataPart) => {
      setDataStream((currentParts) => (currentParts ? [...currentParts, dataPart] : [dataPart]));
    },
  });

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
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
