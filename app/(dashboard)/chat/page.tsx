/**
 * Chat draft surface at /chat with lazy server-generated thread ID.
 * @module app/(dashboard)/chat/page
 */
import { cookies } from "next/headers";
import { Suspense } from "react";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { CHAT_MODEL_COOKIE_NAME, resolveModelId } from "@/lib/ai/models";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";
import { ChatDraftPage } from "./chat-draft-page";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const id = crypto.randomUUID();
  const cookieStore = await cookies();
  const initialChatModel = resolveModelId(
    cookieStore.get(CHAT_MODEL_COOKIE_NAME)?.value,
  );
  const initialQuota = await loadCurrentMessageQuota();
  return (
    <>
      <Suspense>
        <ChatDraftPage
          id={id}
          initialChatModel={initialChatModel}
          initialQuota={initialQuota}
        />
      </Suspense>
      <DataStreamHandler />
    </>
  );
}
