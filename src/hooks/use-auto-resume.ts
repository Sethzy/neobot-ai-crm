/**
 * Auto-resume helper for interrupted chat streams.
 *
 * Instead of replaying the full buffered stream (which causes the response to
 * visually re-generate), this hook polls the DB for the completed assistant
 * message and injects it statically via `setMessages`.
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams
 * @module hooks/use-auto-resume
 */
"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";

import { mapDbMessageToUiMessage } from "@/lib/chat/message-normalization";
import { createClient } from "@/lib/supabase/client";

/** Poll every 2 seconds for up to 30 minutes (covers webhook recovery). */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1_000;

interface UseAutoResumeParams {
  autoResume: boolean;
  /** Trigger recovery polling when the SSE stream errors mid-turn. */
  streamErrorRecovery?: boolean;
  chatId: string;
  initialMessages: UIMessage[];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
}

interface UseAutoResumeResult {
  /** True while we are waiting for the server-side stream to finish and persist the assistant message. */
  isWaitingForResponse: boolean;
}

export function useAutoResume({
  autoResume,
  streamErrorRecovery = false,
  chatId,
  initialMessages,
  setMessages,
}: UseAutoResumeParams): UseAutoResumeResult {
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Shared polling logic — used by both page-load resume and stream-error recovery.
  const startPolling = useCallback(
    (signal: { cancelled: boolean }) => {
      const supabase = createClient();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const startedAt = Date.now();

      const poll = async () => {
        if (signal.cancelled) return;

        const { data } = await supabase
          .from("conversation_messages")
          .select("message_id, role, content, parts")
          .eq("thread_id", chatId)
          .order("created_at", { ascending: true });

        if (signal.cancelled || !data) return;

        const lastRow = data.at(-1);
        if (lastRow && lastRow.role === "assistant") {
          const uiMessages = data.map(mapDbMessageToUiMessage);
          setMessages(uiMessages);
          setIsWaitingForResponse(false);
          return;
        }

        if (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setIsWaitingForResponse(false);
        }
      };

      poll();

      return () => {
        signal.cancelled = true;
        if (timer) clearTimeout(timer);
      };
    },
    [chatId, setMessages],
  );

  // Trigger 1: Page load — last persisted message is from the user.
  useEffect(() => {
    if (!autoResume) return;

    const mostRecentMessage = initialMessages.at(-1);
    if (mostRecentMessage?.role !== "user") return;

    setIsWaitingForResponse(true);
    const signal = { cancelled: false };
    const cleanup = startPolling(signal);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, chatId]);

  // Trigger 2: SSE stream error mid-turn — webhook will persist the message.
  useEffect(() => {
    if (!streamErrorRecovery) return;

    setIsWaitingForResponse(true);
    const signal = { cancelled: false };
    const cleanup = startPolling(signal);
    return cleanup;
  }, [streamErrorRecovery, startPolling]);

  return { isWaitingForResponse };
}
