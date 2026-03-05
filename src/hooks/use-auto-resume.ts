/**
 * Auto-resume helper for interrupted chat streams.
 * @module hooks/use-auto-resume
 */
"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect } from "react";

import { useDataStream } from "@/components/chat/data-stream-provider";

interface UseAutoResumeParams {
  autoResume: boolean;
  initialMessages: UIMessage[];
  resumeStream: UseChatHelpers<UIMessage>["resumeStream"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
}

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream();

  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);
    if (mostRecentMessage?.role === "user") {
      resumeStream();
    }

    // Intentional one-time check on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, initialMessages.at, resumeStream]);

  useEffect(() => {
    if (!dataStream.length) {
      return;
    }

    const firstPart = dataStream[0];
    if (
      typeof firstPart === "object" &&
      firstPart !== null &&
      "type" in firstPart &&
      firstPart.type === "data-appendMessage" &&
      "data" in firstPart &&
      typeof firstPart.data === "string"
    ) {
      const message = JSON.parse(firstPart.data) as UIMessage;
      setMessages([...initialMessages, message]);
    }
  }, [dataStream, initialMessages, setMessages]);
}
