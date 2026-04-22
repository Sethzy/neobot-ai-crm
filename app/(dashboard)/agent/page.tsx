/**
 * Legacy /agent entrypoint.
 * Redirects to the current client's primary chat thread.
 * @module app/(dashboard)/agent/page
 */
import { redirect } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getPrimaryThread } from "@/lib/chat/threads";
import { createClient } from "@/lib/supabase/server";

export default async function AgentPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const primaryThread = await getPrimaryThread(supabase, clientId);

  if (!primaryThread) {
    redirect("/chat");
    return null;
  }

  redirect(`/chat/${primaryThread.thread_id}`);
  return null;
}
