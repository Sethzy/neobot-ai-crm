/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "@/components/icons/lucide-compat";
import { useCallback, useMemo, useState } from "react";

import { useAutoResume } from "@/hooks/use-auto-resume";
import { messageQuotaKeys, useMessageQuota } from "@/hooks/use-message-quota";
import { threadKeys } from "@/hooks/use-threads";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";
import { ChatComposer } from "./chat-composer";
import { ChatWelcome } from "./chat-welcome";
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
  /** Initial quota snapshot loaded server-side for fast first paint. */
  initialQuota?: MessageQuotaStatus | null;
  /** Enables one-time stream resumption for existing threads. */
  autoResume?: boolean;
  /** Pre-filled prompt text for the composer (e.g. from ?prompt= query param). */
  initialPrompt?: string;
}

function getChatErrorMessage(error: Error | undefined): string | null {
  if (!error) {
    return null;
  }

  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    // Non-JSON error payloads should fall back to the plain message.
  }

  return error.message;
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  initialQuota = null,
  autoResume = false,
  initialPrompt,
}: ChatPanelProps) {
  const [composerValue, setComposerValue] = useState(initialPrompt ?? "");
  const { setDataStream } = useDataStream();
  const queryClient = useQueryClient();
  const { data: messageQuota } = useMessageQuota(initialQuota);
  const refreshQuota = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messageQuotaKeys.all });
  }, [queryClient]);
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
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      return lastMessage?.parts?.some(
        (part) =>
          "state" in part &&
          part.state === "approval-responded" &&
          "approval" in part &&
          (part.approval as { approved?: boolean })?.approved === true,
      ) ?? false;
    },
    onData: (dataPart) => {
      if (!shouldStoreDataPartForClient(dataPart)) {
        return;
      }

      setDataStream((currentParts) => (currentParts ? [...currentParts, dataPart] : [dataPart]));
    },
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
      refreshQuota();
    },
    onError: () => {
      refreshQuota();
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
  const errorMessage = useMemo(() => getChatErrorMessage(error), [error]);

  const handleSubmit = useCallback(
    async ({ text, files }: { text: string; files: FileUIPart[] }) => {
      if ((text.length === 0 && files.length === 0) || isLoading) {
        return;
      }

      if (typeof window !== "undefined" && window.location.pathname === "/chat") {
        window.history.pushState({}, "", `/chat/${chatId}`);

        // Optimistic: make the new thread appear in the sidebar immediately
        // instead of waiting for Supabase Realtime to deliver the INSERT event.
        const now = new Date().toISOString();
        queryClient.setQueriesData<Array<Record<string, unknown>>>(
          { queryKey: threadKeys.all },
          (old) => {
            if (!old) return old;
            return [
              {
                thread_id: chatId,
                client_id: "",
                title: null,
                is_pinned: false,
                is_archived: false,
                created_at: now,
                updated_at: now,
              },
              ...old,
            ];
          },
        );
      }

      try {
        if (files.length > 0 && text.length === 0) {
          await sendMessage({ files });
          return;
        }

        if (files.length > 0) {
          await sendMessage({ text, files });
          return;
        }

        await sendMessage({ text });
      } finally {
        refreshQuota();
      }
    },
    [chatId, isLoading, queryClient, refreshQuota, sendMessage],
  );

  const handleQuestionSubmit = useCallback(
    (text: string) => {
      if (isLoading) return;
      void handleSubmit({ text, files: [] });
    },
    [handleSubmit, isLoading],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {hasMessages ? (
        <>
          <MessageList messages={messages} status={status} onToolApproval={handleToolApproval} onQuestionSubmit={handleQuestionSubmit} />
          <ChatComposer
            status={status}
            value={composerValue}
            onValueChange={setComposerValue}
            onSubmit={handleSubmit}
            onStop={stop}
            messageQuota={messageQuota}
          />
        </>
      ) : (
        <ChatWelcome
          status={status}
          composerValue={composerValue}
          onComposerValueChange={setComposerValue}
          onSubmit={handleSubmit}
          onStop={stop}
          messageQuota={messageQuota}
        />
      )}
    </div>
  );
}
