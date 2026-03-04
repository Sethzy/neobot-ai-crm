/**
 * Chat draft surface shown at /chat.
 * @module app/(dashboard)/chat/page
 */
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Suggestion } from "@/components/ai-elements/suggestion";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useThreads } from "@/contexts/thread-context";
import { getInitialMessageHandoffKey } from "@/lib/chat/initial-message-handoff";

const DRAFT_SUGGESTIONS = [
  "Brief me on today's tasks",
  "Check my deal pipeline",
  "Draft a follow-up email",
  "Summarize my recent contacts",
];

export default function ChatPage() {
  const router = useRouter();
  const { createThread } = useThreads();
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (isCreating) {
        return;
      }

      setIsCreating(true);
      try {
        const threadId = await createThread();
        sessionStorage.setItem(getInitialMessageHandoffKey(threadId), text);
        router.push(`/chat/${threadId}`);
      } catch {
        toast.error("Failed to create chat.");
      } finally {
        setIsCreating(false);
      }
    },
    [createThread, isCreating, router],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
      <p className="text-sm text-muted-foreground">What do you need done today?</p>

      <div className="w-full max-w-2xl">
        <ChatComposer status={isCreating ? "submitted" : "ready"} onSubmit={handleSubmit} />
      </div>

      <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2 px-4">
        {DRAFT_SUGGESTIONS.map((suggestion) => (
          <Suggestion
            key={suggestion}
            suggestion={suggestion}
            onClick={handleSubmit}
            className="w-full"
          />
        ))}
      </div>
    </div>
  );
}
