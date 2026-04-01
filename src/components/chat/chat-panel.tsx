/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "@/components/icons/lucide-compat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAutoResume } from "@/hooks/use-auto-resume";
import { mapDbMessageToUiMessage } from "@/lib/chat/message-normalization";
import { createClient } from "@/lib/supabase/client";
import { messageQuotaKeys, useMessageQuota } from "@/hooks/use-message-quota";
import { threadKeys } from "@/hooks/use-threads";
import {
  CHAT_MODEL_COOKIE_MAX_AGE,
  CHAT_MODEL_COOKIE_NAME,
  DEFAULT_CHAT_MODEL,
  resolveModelId,
} from "@/lib/ai/models";
import {
  type MessageQuotaStatus,
  messageQuotaErrorCodes,
} from "@/lib/usage/message-quota";
import type { Json } from "@/types/database";
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
  /** Initial model restored from the persisted chat-model cookie. */
  initialChatModel?: string;
}

interface ParsedChatError {
  code: string | null;
  message: string;
}

function parseChatError(error: Error | undefined): ParsedChatError | null {
  if (!error) {
    return null;
  }

  try {
    const parsed = JSON.parse(error.message) as { code?: unknown; error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return {
        code: typeof parsed.code === "string" ? parsed.code : null,
        message: parsed.error,
      };
    }
  } catch {
    // Non-JSON error payloads should fall back to the plain message.
  }

  return {
    code: null,
    message: error.message,
  };
}

function hasApprovalContinuationState(message: UIMessage | undefined): boolean {
  return message?.parts?.some((part) => {
    const state = "state" in part ? part.state : undefined;
    return state === "approval-responded" || state === "output-denied";
  }) ?? false;
}

function removeOptimisticDraftThread(
  oldThreads: Array<Record<string, unknown>> | undefined,
  chatId: string,
): Array<Record<string, unknown>> | undefined {
  if (!oldThreads) {
    return oldThreads;
  }

  return oldThreads.filter((thread) => thread.thread_id !== chatId);
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  initialQuota = null,
  autoResume = false,
  initialPrompt,
  initialChatModel = DEFAULT_CHAT_MODEL,
}: ChatPanelProps) {
  const [composerValue, setComposerValue] = useState(initialPrompt ?? "");
  const [selectedChatModel, setSelectedChatModel] = useState(
    resolveModelId(initialChatModel),
  );
  const currentModelIdRef = useRef(resolveModelId(initialChatModel));
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
          const previousMessage = messages.at(-2);
          const isToolApprovalContinuation =
            lastMessage?.role !== "user" ||
            hasApprovalContinuationState(lastMessage) ||
            hasApprovalContinuationState(previousMessage);

          return {
            body: isToolApprovalContinuation
              ? {
                  id,
                  messages,
                  selectedChatModel: currentModelIdRef.current,
                }
              : {
                  id,
                  message: lastMessage,
                  selectedChatModel: currentModelIdRef.current,
                },
          };
        },
      }),
    [],
  );

  useEffect(() => {
    currentModelIdRef.current = selectedChatModel;
    document.cookie =
      `${CHAT_MODEL_COOKIE_NAME}=${selectedChatModel}; path=/; max-age=${CHAT_MODEL_COOKIE_MAX_AGE}`;
  }, [selectedChatModel]);

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

  // Subscribe to background job message delivery via Supabase Realtime.
  // When a sandbox job completes, the server inserts a conversation_messages
  // row. This subscription picks it up and appends it to the local chat state.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`bg-jobs-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `thread_id=eq.${chatId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            message_id: string;
            role: string;
            content: string | null;
            parts: Json | null;
          };

          // Only append background-job messages — normal chat messages are
          // handled by useChat and would duplicate if appended here.
          const parts = Array.isArray(newRow.parts) ? newRow.parts : [];
          const isBackgroundJob = parts.some(
            (part) =>
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              part.type === "data" &&
              "data" in part &&
              typeof part.data === "object" &&
              part.data !== null &&
              "source" in part.data &&
              part.data.source === "background-job",
          );
          if (!isBackgroundJob) return;

          const normalized = mapDbMessageToUiMessage(newRow);
          setMessages((prev) => {
            if (prev.some((m) => m.id === normalized.id)) return prev;
            return [...prev, normalized];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, setMessages]);

  const handleToolApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({ id: approvalId, approved });
    },
    [addToolApprovalResponse],
  );

  const isLoading = status === "submitted" || status === "streaming";
  // Ref mirrors isLoading so handleSubmit always reads the freshest value,
  // avoiding a race between useAutoResume's resumeStream and a user send.
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const parsedError = useMemo(() => parseChatError(error), [error]);
  const errorMessage = parsedError?.message ?? null;

  const handleSubmit = useCallback(
    async ({ text, files }: { text: string; files: FileUIPart[] }) => {
      if ((text.length === 0 && files.length === 0) || isLoadingRef.current) {
        return;
      }

      const isDraftThread = typeof window !== "undefined" && window.location.pathname === "/chat";

      if (isDraftThread) {
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
        if (files.length > 0) {
          await sendMessage(text.length > 0 ? { text, files } : { files });
        } else {
          await sendMessage({ text });
        }
      } catch (submitError) {
        const parsedSubmitError = submitError instanceof Error
          ? parseChatError(submitError)
          : null;

        if (
          isDraftThread &&
          parsedSubmitError?.code === messageQuotaErrorCodes.limitReached &&
          typeof window !== "undefined"
        ) {
          window.history.replaceState({}, "", "/chat");
          queryClient.setQueriesData<Array<Record<string, unknown>>>(
            { queryKey: threadKeys.all },
            (old) => removeOptimisticDraftThread(old, chatId),
          );
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isLoadingRef (stable ref) replaces isLoading to avoid stale closure race
    [chatId, queryClient, refreshQuota, sendMessage],
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
            selectedChatModel={selectedChatModel}
            value={composerValue}
            onValueChange={setComposerValue}
            onSelectedChatModelChange={setSelectedChatModel}
            onSubmit={handleSubmit}
            onStop={stop}
            messageQuota={messageQuota}
          />
        </>
      ) : (
        <ChatWelcome
          status={status}
          selectedChatModel={selectedChatModel}
          composerValue={composerValue}
          onComposerValueChange={setComposerValue}
          onSelectedChatModelChange={setSelectedChatModel}
          onSubmit={handleSubmit}
          onStop={stop}
          messageQuota={messageQuota}
        />
      )}
    </div>
  );
}
