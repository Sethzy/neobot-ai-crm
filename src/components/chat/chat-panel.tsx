/**
 * Main chat panel: message history + composer wired to AI SDK useChat.
 * @module components/chat/chat-panel
 */
"use client";

import { useChat } from "@ai-sdk/react";
import { AlertCircle } from "lucide-react";
import { useCallback, useState } from "react";

import { ChatComposer } from "./chat-composer";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  chatId: string;
}

export function ChatPanel({ chatId }: ChatPanelProps) {
  const { messages, sendMessage, status, error } = useChat({ id: chatId });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

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
