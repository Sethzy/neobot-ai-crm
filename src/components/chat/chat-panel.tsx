/**
 * Main chat panel: streaming chat UI for one thread.
 * @module components/chat/chat-panel
 */
"use client";

import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertCircle, Loader2 } from "@/components/icons/lucide-compat";
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
import { cn } from "@/lib/utils";
import { AskUserQuestionOverlay, type AskUserQuestion } from "./ask-user-question-overlay";
import { ChatComposer } from "./chat-composer";
import { ChatWelcome } from "./chat-welcome";
import { MessageQuotaPill } from "./message-quota-pill";
import { useDataStream } from "./data-stream-provider";
import { MessageList, type MessageListHandle } from "./message-list";

/** Batches token updates to reduce render churn during fast streams. */
const STREAM_UI_THROTTLE_MS = 50;
const askUserQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(4),
  type: z.enum(["single_select", "multi_select", "rank_priorities"]),
});
const askUserQuestionOutputSchema = z.object({
  questions: z.array(askUserQuestionSchema).min(1),
});

/** Wire shape for the `data-assistantFile` stream part emitted by finalizeRun. */
const assistantFileDataSchema = z.object({
  url: z.string(),
  mediaType: z.string(),
  filename: z.string().optional(),
  storagePath: z.string().optional(),
});

interface PendingQuestionBatch {
  messageId: string;
  questions: AskUserQuestion[];
}

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
  /** When true, sends the initial prompt exactly once after the draft route mounts. */
  autoSubmitInitialPrompt?: boolean;
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

function removeOptimisticDraftThread(
  oldThreads: Array<Record<string, unknown>> | undefined,
  chatId: string,
): Array<Record<string, unknown>> | undefined {
  if (!oldThreads) {
    return oldThreads;
  }

  return oldThreads.filter((thread) => thread.thread_id !== chatId);
}

function extractPendingQuestionBatch(messages: UIMessage[], status: string): PendingQuestionBatch | null {
  if (status === "streaming") {
    return null;
  }

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") {
    return null;
  }

  for (const part of lastMessage.parts ?? []) {
    if (typeof part !== "object" || part === null) {
      continue;
    }

    const toolPart = part as {
      output?: unknown;
      state?: string;
      type?: string;
    };

    if (toolPart.type !== "tool-ask_user_question" || toolPart.state !== "output-available") {
      continue;
    }

    const parsedOutput = askUserQuestionOutputSchema.safeParse(toolPart.output);
    if (parsedOutput.success) {
      return {
        messageId: lastMessage.id,
        questions: parsedOutput.data.questions,
      };
    }
  }

  return null;
}

export function ChatPanel({
  chatId,
  initialMessages = [],
  initialQuota = null,
  autoResume = false,
  initialPrompt,
  autoSubmitInitialPrompt = false,
  initialChatModel = DEFAULT_CHAT_MODEL,
}: ChatPanelProps) {
  const [composerValue, setComposerValue] = useState(initialPrompt ?? "");
  const [dismissedQuestionMessageId, setDismissedQuestionMessageId] = useState<string | null>(null);
  const [selectedChatModel, setSelectedChatModel] = useState(
    resolveModelId(initialChatModel),
  );
  const { setDataStream } = useDataStream();
  const queryClient = useQueryClient();
  const { data: messageQuota } = useMessageQuota(initialQuota);
  const refreshQuota = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messageQuotaKeys.all });
  }, [queryClient]);

  /**
   * Synchronously writes the cookie before React re-renders. This closes the
   * race window where a navigation (e.g. clicking a sidebar thread) could fire
   * before an effect and carry a stale cookie to the server-side page render.
   */
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedChatModel(modelId);
    document.cookie = `${CHAT_MODEL_COOKIE_NAME}=${modelId}; path=/; max-age=${CHAT_MODEL_COOKIE_MAX_AGE}`;
  }, []);

  // Track whether we were actively streaming so we can distinguish a
  // mid-stream break (Vercel timeout) from a pre-flight error (bad request).
  const wasStreamingRef = useRef(false);
  const [streamErrorRecovery, setStreamErrorRecovery] = useState(false);
  const [approvalRecovery, setApprovalRecovery] = useState<{ approvalId: string } | null>(null);

  const { messages, sendMessage, stop, status, error, setMessages, addToolApprovalResponse } = useChat({
    id: chatId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    experimental_throttle: STREAM_UI_THROTTLE_MS,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onData: (dataPart) => {
      // `data-assistantFile` is emitted by the server after file mirroring
      // completes (end of finalizeRun). It appends a file part to the last
      // assistant message so the artifact card appears live — without this,
      // cards only show up after a thread switch (because the DB has the file
      // parts but the live stream never wrote them).
      if (
        typeof dataPart === "object" &&
        dataPart !== null &&
        "type" in dataPart &&
        dataPart.type === "data-assistantFile"
      ) {
        const parsed = assistantFileDataSchema.safeParse(
          (dataPart as { data: unknown }).data,
        );
        if (!parsed.success) {
          return;
        }
        const fileData = parsed.data;
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const last = prev[lastIndex];
          if (!last || last.role !== "assistant") {
            return prev;
          }
          const nextParts = [
            ...last.parts,
            {
              type: "file" as const,
              url: fileData.url,
              mediaType: fileData.mediaType,
              ...(fileData.filename ? { filename: fileData.filename } : {}),
              ...(fileData.storagePath ? { storagePath: fileData.storagePath } : {}),
            },
          ];
          return [
            ...prev.slice(0, lastIndex),
            { ...last, parts: nextParts },
          ];
        });
        return;
      }

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
      // If the stream broke mid-turn, enter recovery mode — the webhook
      // safety net will persist the message once Anthropic's session settles.
      if (wasStreamingRef.current) {
        setStreamErrorRecovery(true);
        wasStreamingRef.current = false;
      }
    },
  });

  // Track streaming state for the error handler above.
  useEffect(() => {
    if (status === "streaming") wasStreamingRef.current = true;
    if (status === "ready") wasStreamingRef.current = false;
  }, [status]);

  const { isWaitingForResponse } = useAutoResume({
    autoResume,
    streamErrorRecovery,
    approvalRecovery,
    chatId,
    initialMessages,
    setMessages,
  });

  // Clear recovery state when auto-resume finds the message.
  useEffect(() => {
    if ((streamErrorRecovery || approvalRecovery) && !isWaitingForResponse) {
      setStreamErrorRecovery(false);
      setApprovalRecovery(null);
    }
  }, [approvalRecovery, streamErrorRecovery, isWaitingForResponse]);

  // Subscribe to background message delivery via Supabase Realtime.
  // When a background job completes, the server inserts a conversation_messages
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

  const handleManagedApprovalSubmitted = useCallback((approvalId: string) => {
    setApprovalRecovery({ approvalId });
    queryClient.invalidateQueries({ queryKey: threadKeys.all });
  }, [queryClient]);

  const effectiveStatus = isWaitingForResponse ? "submitted" : status;
  const isLoading = effectiveStatus === "submitted" || effectiveStatus === "streaming";
  // Ref mirrors isLoading so handleSubmit always reads the freshest value,
  // avoiding a race between useAutoResume's polling and a user send.
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const messageListRef = useRef<MessageListHandle>(null);
  const parsedError = useMemo(() => parseChatError(error), [error]);
  const errorMessage = parsedError?.message ?? null;

  const handleSubmit = useCallback(
    async ({ text, files }: { text: string; files: FileUIPart[] }) => {
      // Re-engage auto-scroll so the user sees the streamed response
      messageListRef.current?.scrollToBottom();

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
          await sendMessage(
            text.length > 0 ? { text, files } : { files },
            { body: { selectedChatModel } },
          );
        } else {
          await sendMessage({ text }, { body: { selectedChatModel } });
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

  const hasAutoSubmittedInitialPromptRef = useRef(false);

  useEffect(() => {
    if (hasAutoSubmittedInitialPromptRef.current || !autoSubmitInitialPrompt) {
      return;
    }

    const trimmedInitialPrompt = initialPrompt?.trim() ?? "";
    if (trimmedInitialPrompt.length === 0) {
      hasAutoSubmittedInitialPromptRef.current = true;
      return;
    }

    if (messages.length > 0 || isLoadingRef.current) {
      return;
    }

    hasAutoSubmittedInitialPromptRef.current = true;
    void handleSubmit({ text: trimmedInitialPrompt, files: [] });
  }, [autoSubmitInitialPrompt, handleSubmit, initialPrompt, messages.length]);

  const pendingQuestionBatch = useMemo(
    () => extractPendingQuestionBatch(messages, effectiveStatus),
    [messages, effectiveStatus],
  );

  useEffect(() => {
    if (!pendingQuestionBatch) {
      setDismissedQuestionMessageId(null);
      return;
    }

    if (
      dismissedQuestionMessageId &&
      pendingQuestionBatch.messageId !== dismissedQuestionMessageId
    ) {
      setDismissedQuestionMessageId(null);
    }
  }, [dismissedQuestionMessageId, pendingQuestionBatch]);

  const visiblePendingQuestionBatch = pendingQuestionBatch?.messageId === dismissedQuestionMessageId
    ? null
    : pendingQuestionBatch;

  const handleQuestionDismiss = useCallback(
    (text: string) => {
      if (isLoading) {
        return;
      }

      if (pendingQuestionBatch) {
        setDismissedQuestionMessageId(pendingQuestionBatch.messageId);
      }

      void handleSubmit({ text, files: [] });
    },
    [handleSubmit, isLoading, pendingQuestionBatch],
  );

  const handleStop = useCallback(() => {
    // Abort the client-side fetch immediately for instant UI feedback.
    stop();

    // Tell Anthropic to stop the agent server-side. Fire-and-forget —
    // if the session doesn't exist yet (early submitted phase) the 404 is harmless.
    fetch("/api/chat/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: chatId }),
    }).catch(() => {
      // Swallow — the client-side abort already handled the UI.
    });
  }, [chatId, stop]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {streamErrorRecovery ? (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-muted px-3 py-2 text-sm text-muted-foreground sm:mx-auto sm:w-full sm:max-w-2xl">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <p className="min-w-0 break-words">Claude is still working on this — results will appear shortly</p>
        </div>
      ) : error ? (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-auto sm:w-full sm:max-w-2xl">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 break-words">{errorMessage}</p>
        </div>
      ) : null}

      {hasMessages ? (
        <>
          <MessageList
            ref={messageListRef}
            messages={messages}
            status={effectiveStatus}
            onToolApproval={handleToolApproval}
            onManagedApprovalSubmitted={handleManagedApprovalSubmitted}
          />
          <div className="relative">
            {messageQuota ? (
              <MessageQuotaPill
                quota={messageQuota}
                className={cn(
                  "pb-1 pt-2 transition-opacity",
                  visiblePendingQuestionBatch && "pointer-events-none opacity-0",
                )}
              />
            ) : null}
            <ChatComposer
              status={effectiveStatus}
              selectedChatModel={selectedChatModel}
              value={composerValue}
              onValueChange={setComposerValue}
              onSelectedChatModelChange={handleModelChange}
              onSubmit={handleSubmit}
              onStop={isLoading ? handleStop : undefined}
              disabled={!!visiblePendingQuestionBatch || (messageQuota?.messagesRemaining ?? 1) <= 0}
              hideModelSelector
              className={cn(
                "transition-all",
                visiblePendingQuestionBatch && "pointer-events-none select-none opacity-15 blur-[1px]",
              )}
            />
            {visiblePendingQuestionBatch && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4">
                <AskUserQuestionOverlay
                  key={visiblePendingQuestionBatch.messageId}
                  questions={visiblePendingQuestionBatch.questions}
                  onSubmit={handleQuestionSubmit}
                  onDismiss={handleQuestionDismiss}
                  className="pointer-events-auto"
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <ChatWelcome
            status={effectiveStatus}
            selectedChatModel={selectedChatModel}
            composerValue={composerValue}
            onComposerValueChange={setComposerValue}
            onSelectedChatModelChange={handleModelChange}
            onSubmit={handleSubmit}
            messageQuota={messageQuota}
          />
        </>
      )}
    </div>
  );
}
