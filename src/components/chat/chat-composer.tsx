/**
 * Chat input composer using AI Elements PromptInput with auto-resize and status-aware submit.
 * @module components/chat/chat-composer
 */
"use client";

import { useState } from "react";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import type { ChatStatus } from "@/types/chat";

interface ChatComposerProps {
  status: ChatStatus;
  onSubmit: (text: string) => void;
}

export function ChatComposer({ status, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState("");

  const isLoading = status === "submitted" || status === "streaming";
  const isSendDisabled = value.trim().length === 0 || isLoading;

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();

    if (text.length === 0 || isLoading) {
      return;
    }

    setValue("");
    onSubmit(text);
  };

  return (
    <div className="px-4 pb-4">
      <div className="mx-auto max-w-2xl">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            placeholder="Send a message..."
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            disabled={isLoading}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={isSendDisabled} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
