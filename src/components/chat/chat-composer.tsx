/**
 * Chat input composer with Enter-to-send behavior.
 * @module components/chat/chat-composer
 */
"use client";

import { useRef } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatComposer({ value, onValueChange, onSubmit, isLoading }: ChatComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const isSendDisabled = value.trim().length === 0 || isLoading;

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSendDisabled) {
      return;
    }

    onSubmit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isSendDisabled) {
        formRef.current?.requestSubmit();
      }
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleFormSubmit}
      className="border-t border-border bg-background px-4 py-3"
    >
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <Textarea
          value={value}
          rows={1}
          disabled={isLoading}
          placeholder="Type a message..."
          className="min-h-10 max-h-40 resize-none"
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />

        <Button type="submit" size="icon" disabled={isSendDisabled} aria-label="Send message">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
