/**
 * Client chat draft wrapper rendered by /chat server page.
 * @module app/(dashboard)/chat/chat-draft-page
 */
"use client";

import { ChatPanel } from "@/components/chat/chat-panel";

interface ChatDraftPageProps {
  id: string;
}

export function ChatDraftPage({ id }: ChatDraftPageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel chatId={id} initialMessages={[]} autoResume={false} />
    </div>
  );
}
