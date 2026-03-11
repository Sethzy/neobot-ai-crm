/**
 * Chat draft surface at /chat with lazy server-generated thread ID.
 * @module app/(dashboard)/chat/page
 */
import { Suspense } from "react";

import { DataStreamHandler } from "@/components/chat/data-stream-handler";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";
import { ChatDraftPage } from "./chat-draft-page";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const id = crypto.randomUUID();
  const initialQuota = await loadCurrentMessageQuota();
  return (
    <>
      <Suspense>
        <ChatDraftPage id={id} initialQuota={initialQuota} />
      </Suspense>
      <DataStreamHandler />
    </>
  );
}
