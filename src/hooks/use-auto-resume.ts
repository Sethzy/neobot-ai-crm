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
import { useEffect, useState } from "react";

import { mapDbMessageToUiMessage } from "@/lib/chat/message-normalization";
import { createClient } from "@/lib/supabase/client";

/** Poll every 2 seconds for up to 120 seconds. */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_DURATION_MS = 120_000;

interface UseAutoResumeParams {
  autoResume: boolean;
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
  chatId,
  initialMessages,
  setMessages,
}: UseAutoResumeParams): UseAutoResumeResult {
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  useEffect(() => {
    if (!autoResume) return;

    const mostRecentMessage = initialMessages.at(-1);
    if (mostRecentMessage?.role !== "user") return;

    // The last persisted message is from the user, which means the assistant
    // response hasn't been written to DB yet (the stream is likely still
    // active on the server). Poll until the assistant message appears.
    setIsWaitingForResponse(true);

    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;

      const { data } = await supabase
        .from("conversation_messages")
        .select("message_id, role, content, parts")
        .eq("thread_id", chatId)
        .order("created_at", { ascending: true });

      if (cancelled || !data) return;

      const lastRow = data.at(-1);
      if (lastRow && lastRow.role === "assistant") {
        // Assistant message found — update the UI in one shot, no streaming.
        const uiMessages = data.map(mapDbMessageToUiMessage);
        setMessages(uiMessages);
        setIsWaitingForResponse(false);
        return;
      }

      // Still waiting — schedule next poll if within time budget.
      if (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setIsWaitingForResponse(false);
      }
    };

    // Kick off the first poll immediately.
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Re-run when the thread changes (chatId) or on first mount (autoResume).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, chatId]);

  return { isWaitingForResponse };
}
