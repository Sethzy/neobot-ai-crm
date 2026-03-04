/**
 * Server-rendered chat thread page.
 * Resolves thread ownership, loads persisted messages, and seeds the client chat state.
 * @module app/(dashboard)/chat/[threadId]/page
 */
import type { UIMessage } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";

import { resolveClientId } from "@/lib/chat/client-id";
import { listMessages } from "@/lib/chat/messages";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { ChatThreadPageClient } from "./chat-thread-page-client";

interface ChatThreadPageProps {
  params: Promise<{ threadId: string }>;
  searchParams?: Promise<{ draft?: string | string[]; source?: string | string[] }>;
}

const threadIdSchema = z.string().uuid();

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

export default async function ChatThreadPage({ params, searchParams }: ChatThreadPageProps) {
  const { threadId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const draftParam = resolvedSearchParams?.draft;
  const sourceParam = resolvedSearchParams?.source;
  const isDraftRoute = Array.isArray(draftParam) ? draftParam.includes("1") : draftParam === "1";
  const isNewDraftSource = Array.isArray(sourceParam) ? sourceParam.includes("new") : sourceParam === "new";

  if (!threadIdSchema.safeParse(threadId).success) {
    redirect("/chat");
    return null;
  }

  /** Skip DB work only for explicitly marked new-draft routes.
   *  Plain ?draft=1 still resolves persisted threads to avoid hiding history. */
  if (isDraftRoute && isNewDraftSource) {
    return (
      <ChatThreadPageClient
        threadId={threadId}
        initialMessages={[]}
        isDraftRoute
      />
    );
  }

  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  const { data: thread, error: threadLookupError } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .maybeSingle();

  if (threadLookupError) {
    throw new Error("Failed to load thread.");
  }

  if (!thread) {
    if (isDraftRoute) {
      return (
        <ChatThreadPageClient
          threadId={threadId}
          initialMessages={[]}
          isDraftRoute
        />
      );
    }

    redirect("/chat");
    return null;
  }

  const persistedMessages = await listMessages(supabase, threadId);
  const initialMessages = persistedMessages.map(mapDbMessageToUiMessage);

  return (
    <ChatThreadPageClient
      threadId={threadId}
      initialMessages={initialMessages}
      isDraftRoute={false}
    />
  );
}
