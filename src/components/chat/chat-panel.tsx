/**
 * Main chat panel: streaming chat UI with message hydration/persistence.
 * @module components/chat/chat-panel
 */
"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useChatMessages, useSaveMessages } from "@/hooks/use-chat-messages";
import type { Json } from "@/types/database";

import { ChatComposer } from "./chat-composer";
import { getMessageText } from "./message-content";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  chatId: string;
}

const uiMessageRoles = ["system", "user", "assistant"] as const;

function isUiMessageRole(role: string): role is (typeof uiMessageRoles)[number] {
  return uiMessageRoles.includes(role as (typeof uiMessageRoles)[number]);
}

function normalizeMessageParts(parts: Json | null, content: string | null): UIMessage["parts"] {
  if (Array.isArray(parts)) {
    return parts as UIMessage["parts"];
  }

  if (content) {
    return [{ type: "text", text: content }];
  }

  return [];
}

function mapDbMessageToUiMessage(message: {
  message_id: string;
  role: string;
  content: string | null;
  parts: Json | null;
}): UIMessage {
  const role = isUiMessageRole(message.role) ? message.role : "assistant";

  return {
    id: message.message_id,
    role,
    parts: normalizeMessageParts(message.parts, message.content),
  };
}

export function ChatPanel({ chatId }: ChatPanelProps) {
  const { data: persistedMessages = [] } = useChatMessages(chatId);
  const saveMessages = useSaveMessages(chatId);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const persistedMessageIds = useRef<Set<string>>(new Set());
  const pendingMessageIds = useRef<Set<string>>(new Set());

  const persistNewMessages = useCallback(
    async (messages: UIMessage[]) => {
      const unsavedMessages = messages.filter(
        (message) =>
          !persistedMessageIds.current.has(message.id) &&
          !pendingMessageIds.current.has(message.id),
      );

      if (unsavedMessages.length === 0) {
        return;
      }

      const payload = unsavedMessages.map((message) => ({
        role: message.role,
        content: getMessageText(message) || null,
        parts: (message.parts as Json) ?? null,
      }));

      unsavedMessages.forEach((message) => pendingMessageIds.current.add(message.id));

      try {
        await saveMessages.mutateAsync(payload);
        unsavedMessages.forEach((message) => persistedMessageIds.current.add(message.id));
      } finally {
        unsavedMessages.forEach((message) => pendingMessageIds.current.delete(message.id));
      }
    },
    [saveMessages],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: chatId,
    transport,
    onFinish: async ({ messages: finishedMessages }) => {
      await persistNewMessages(finishedMessages);
    },
  });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    persistedMessageIds.current.clear();
    pendingMessageIds.current.clear();
  }, [chatId]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const hydratedMessages = persistedMessages.map(mapDbMessageToUiMessage);
    setMessages(hydratedMessages);
    persistedMessageIds.current = new Set(hydratedMessages.map((message) => message.id));
    pendingMessageIds.current.clear();
  }, [isLoading, persistedMessages, setMessages]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();

    if (text.length === 0 || isLoading) {
      return;
    }

    await sendMessage({ text });
    setInput("");
  }, [input, isLoading, sendMessage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p>{error.message}</p>
        </div>
      ) : null}

      <MessageList messages={messages} status={status} />

      <ChatComposer
        value={input}
        isLoading={isLoading}
        onValueChange={setInput}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
