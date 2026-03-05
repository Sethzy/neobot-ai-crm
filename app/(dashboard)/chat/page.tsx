/**
 * Chat draft surface at /chat with lazy server-generated thread ID.
 * @module app/(dashboard)/chat/page
 */
import { ChatDraftPage } from "./chat-draft-page";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const id = crypto.randomUUID();
  return <ChatDraftPage id={id} />;
}
