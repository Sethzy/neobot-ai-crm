/**
 * Chat workspace page.
 * @module app/(dashboard)/chat/page
 */
"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { useThreads } from "@/contexts/thread-context";

export default function ChatPage() {
  const { activeThreadId } = useThreads();

  return <ChatPanel chatId={activeThreadId} />;
}
