/**
 * Stream resume endpoint for interrupted chat reconnections.
 * @module app/api/chat/[id]/stream/route
 */
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

import { resolveClientId } from "@/lib/chat/client-id";
import { clearActiveStreamId, getActiveStreamId } from "@/lib/redis";
import { createClient } from "@/lib/supabase/server";

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: threadId } = await params;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(null, { status: 204 });
    }

    const activeStreamId = await getActiveStreamId(threadId);
    if (!activeStreamId) {
      return new Response(null, { status: 204 });
    }

    const clientId = await resolveClientId(supabase, user.id);
    const { data: thread } = await supabase
      .from("conversation_threads")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("client_id", clientId)
      .eq("is_archived", false)
      .maybeSingle();

    if (!thread) {
      return new Response(null, { status: 204 });
    }

    const streamContext = getStreamContext();
    if (!streamContext) {
      return new Response(null, { status: 204 });
    }

    const resumedStream = await streamContext.resumeExistingStream(activeStreamId);
    if (!resumedStream) {
      await clearActiveStreamId(threadId);
      return new Response(null, { status: 204 });
    }

    return new Response(resumedStream, { headers: UI_MESSAGE_STREAM_HEADERS });
  } catch (_) {
    return new Response(null, { status: 204 });
  }
}
