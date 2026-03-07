/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "@/components/icons/lucide-compat";
import { useCallback, useMemo } from "react";

import { useAutoResume } from "@/hooks/use-auto-resume";
import { threadKeys } from "@/hooks/use-threads";
import { ChatComposer } from "./chat-composer";
import { useDataStream } from "./data-stream-provider";
import { MessageList } from "./message-list";

/** Batches token updates to reduce render churn during fast streams. */
const STREAM_UI_THROTTLE_MS = 50;

function shouldStoreDataPartForClient(part: unknown): boolean {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part.type === "data-chat-title" || part.type === "data-appendMessage")
  );
}

interface ChatPanelProps {
  chatId: string;
  /** Initial persisted messages loaded server-side for this thread route. */
  initialMessages?: UIMessage[];
  /** Enables one-time stream resumption for existing threads. */
  autoResume?: boolean;
  /** Pre-filled prompt text for the composer (e.g. from ?prompt= query param). */
  initialPrompt?: string;
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  autoResume = false,
  initialPrompt,
}: ChatPanelProps) {
  const { setDataStream } = useDataStream();
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

  const { messages, sendMessage, status, error, stop, resumeStream, setMessages, addToolApprovalResponse } = useChat({
    id: chatId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    experimental_throttle: STREAM_UI_THROTTLE_MS,
    transport,
    onData: (dataPart) => {
      if (!shouldStoreDataPartForClient(dataPart)) {
        return;
      }

      setDataStream((currentParts) => (currentParts ? [...currentParts, dataPart] : [dataPart]));
    },
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    },
  });

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const handleToolApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({ id: approvalId, approved });
    },
    [addToolApprovalResponse],
  );

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    ({ text, files }: { text: string; files: FileUIPart[] }) => {
      if ((text.length === 0 && files.length === 0) || isLoading) {
        return;
      }

      if (typeof window !== "undefined" && window.location.pathname === "/chat") {
        window.history.pushState({}, "", `/chat/${chatId}`);
      }

      if (files.length > 0 && text.length === 0) {
        sendMessage({ files });
        return;
      }

      if (files.length > 0) {
        sendMessage({ text, files });
        return;
      }

      sendMessage({ text });
    },
    [chatId, isLoading, sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      if (isLoading) return;
      handleSubmit({ text: prompt, files: [] });
    },
    [handleSubmit, isLoading],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p>{error.message}</p>
        </div>
      ) : null}

      <MessageList messages={messages} status={status} onToolApproval={handleToolApproval} onSuggestionClick={handleSuggestionClick} />

      <ChatComposer status={status} onSubmit={handleSubmit} onStop={stop} initialValue={initialPrompt} />
    </div>
  );
}
