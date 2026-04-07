/**
 * Creates a chat thread pre-loaded with meeting context and starts an agent run.
 * @module app/api/meetings/[id]/send-to-agent/route
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { createMessage } from "@/lib/chat/messages";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

type MeetingRecord = Database["public"]["Tables"]["meeting_records"]["Row"];
type RouteSupabaseClient = SupabaseClient<Database>;

function buildHandoffMessage(meeting: Pick<
  MeetingRecord,
  "summary" | "notes" | "duration_seconds" | "transcript_path" | "created_at"
>): string {
  const date = new Date(meeting.created_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const durationMinutes = meeting.duration_seconds
    ? Math.max(1, Math.round(meeting.duration_seconds / 60))
    : 0;
  const transcriptLine = meeting.transcript_path
    ? `If you need more detail than the summary provides, the full transcript is at \`/agent/${meeting.transcript_path}\` - use read_file to access it.`
    : "The full transcript is not available, so rely on the summary and notes.";

  return `A meeting was just recorded and auto-summarized. Review the summary and notes below, then help the user process it.

## What to do

1. Read the summary and notes. Identify people, companies, and deals mentioned.
2. Search the CRM for matches. If you find a likely match, suggest linking the meeting to that record. Ask the user to confirm before linking.
3. Look for actionable items: tasks to create, deal stages to update, follow-up emails to draft, personal details worth remembering.
4. Present what you found and what you'd recommend. Let the user decide what to act on.

${transcriptLine}

## Meeting Details

- **Date:** ${date}
- **Duration:** ${durationMinutes} minutes

## Summary

${meeting.summary || "(No summary available)"}

## User Notes

${meeting.notes?.trim() || "(No notes taken)"}`;
}

async function queueAgentRun(
  clientId: string,
  threadId: string,
  supabase: RouteSupabaseClient,
) {
  after(async () => {
    try {
      const result = await runAgent(
        {
          clientId,
          threadId,
          input: "",
          triggerType: "chat",
          channel: "web",
          consumeMessageQuota: false,
        },
        supabase,
      );

      if (result.status === "streaming") {
        await result.streamResult.text;
      }
    } catch (error) {
      console.error("[send-to-agent] Agent run failed:", error);
    }
  });
}

async function createHandoffMessage(
  supabase: RouteSupabaseClient,
  threadId: string,
  meeting: Pick<
    MeetingRecord,
    "summary" | "notes" | "duration_seconds" | "transcript_path" | "created_at"
  >,
) {
  const handoffContent = buildHandoffMessage(meeting);

  await createMessage(supabase, {
    thread_id: threadId,
    role: "user",
    content: handoffContent,
    parts: [{ type: "text", text: handoffContent }],
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;
  const { id: meetingId } = await params;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const { data: meeting, error: meetingError } = await supabase
      .from("meeting_records")
      .select("meeting_record_id, title, summary, notes, duration_seconds, transcript_path, thread_id, created_at")
      .eq("meeting_record_id", meetingId)
      .eq("client_id", clientId)
      .single();

    if (meetingError || !meeting) {
      return jsonError("Meeting not found", 404);
    }

    if (meeting.thread_id) {
      const { data: existingMessages, error: existingMessagesError } = await supabase
        .from("conversation_messages")
        .select("message_id")
        .eq("thread_id", meeting.thread_id)
        .limit(1);

      if (existingMessagesError) {
        throw new Error(existingMessagesError.message);
      }

      if ((existingMessages?.length ?? 0) === 0) {
        await createHandoffMessage(supabase, meeting.thread_id, meeting);
        await queueAgentRun(clientId, meeting.thread_id, supabase);
      }

      return Response.json({ success: true, threadId: meeting.thread_id });
    }

    const threadId = crypto.randomUUID();
    const { error: threadError } = await supabase
      .from("conversation_threads")
      .insert({
        thread_id: threadId,
        client_id: clientId,
        title: meeting.title,
      });

    if (threadError) {
      return jsonError("Failed to create thread", 500);
    }

    const { error: updateError } = await supabase
      .from("meeting_records")
      .update({
        thread_id: threadId,
        updated_at: new Date().toISOString(),
      })
      .eq("meeting_record_id", meetingId);

    if (updateError) {
      return jsonError("Failed to link meeting to thread", 500);
    }

    try {
      await createHandoffMessage(supabase, threadId, meeting);
    } catch (error) {
      try {
        await supabase
          .from("meeting_records")
          .update({
            thread_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("meeting_record_id", meetingId);
        await supabase
          .from("conversation_threads")
          .delete()
          .eq("thread_id", threadId);
      } catch (rollbackError) {
        console.error("[send-to-agent] Failed to roll back thread creation:", rollbackError);
      }

      throw error;
    }

    await queueAgentRun(clientId, threadId, supabase);

    return Response.json({ success: true, threadId });
  } catch (error) {
    console.error("[send-to-agent] Error:", error);
    return jsonError("Failed to send to agent", 500);
  }
}
