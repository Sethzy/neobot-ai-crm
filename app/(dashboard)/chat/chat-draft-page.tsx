/**
 * Client chat draft wrapper rendered by /chat server page.
 * Reads optional ?prompt= query param to pre-fill the composer.
 * @module app/(dashboard)/chat/chat-draft-page
 */
"use client";

import { useSearchParams } from "next/navigation";

import { ChatPanel } from "@/components/chat/chat-panel";
import type { MessageQuotaStatus } from "@/lib/usage/message-quota";

interface ChatDraftPageProps {
  id: string;
  initialQuota?: MessageQuotaStatus | null;
}

export function ChatDraftPage({ id, initialQuota = null }: ChatDraftPageProps) {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams?.get("prompt") ?? undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel
        chatId={id}
        initialMessages={[]}
        initialQuota={initialQuota}
        autoResume={false}
        initialPrompt={initialPrompt}
      />
    </div>
  );
}
