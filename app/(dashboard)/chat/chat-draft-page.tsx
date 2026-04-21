/**
 * Client chat draft wrapper rendered by /chat server page.
 * Reads optional ?prompt= query param to pre-fill the composer.
 * @module app/(dashboard)/chat/chat-draft-page
 */
"use client";

import { useSearchParams } from "next/navigation";

import { ChatErrorBoundary } from "@/components/chat/chat-error-boundary";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";

interface ChatDraftPageProps {
  id: string;
  initialQuota?: MessageQuotaStatus | null;
  initialChatModel: string;
}

export function ChatDraftPage({
  id,
  initialQuota = null,
  initialChatModel,
}: ChatDraftPageProps) {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams?.get("prompt") ?? undefined;
  const autoSubmitInitialPrompt = searchParams?.get("autosubmit") === "1";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatErrorBoundary>
        <ChatPanel
          key={id}
          chatId={id}
          initialMessages={[]}
          initialQuota={initialQuota}
          autoResume={false}
          initialPrompt={initialPrompt}
          autoSubmitInitialPrompt={autoSubmitInitialPrompt}
          initialChatModel={initialChatModel}
        />
      </ChatErrorBoundary>
    </div>
  );
}
