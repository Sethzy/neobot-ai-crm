/**
 * Background-consumed meeting follow-up runner.
 * @module lib/runner/run-meeting-followup
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildMeetingInstructions } from "@/lib/ai/meeting-prompt";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunMeetingFollowUpInput {
  clientId: string;
  threadId: string;
  meetingRecordId: string;
  transcriptPath: string;
  notes: string;
  durationMinutes: number;
  supabase: ChatSupabaseClient;
}

export type RunMeetingFollowUpResult =
  | { status: "completed" }
  | { status: "skipped_busy" }
  | { status: "failed"; error: string };

async function updateMeetingStatus(
  supabase: ChatSupabaseClient,
  meetingRecordId: string,
  status: Database["public"]["Tables"]["meeting_records"]["Update"]["status"],
) {
  await supabase
    .from("meeting_records")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("meeting_record_id", meetingRecordId);
}

/**
 * Runs the post-meeting follow-up agent flow and consumes the full stream so
 * persistence finalizers complete before returning a result contract.
 */
export async function runMeetingFollowUp({
  clientId,
  threadId,
  meetingRecordId,
  transcriptPath,
  notes,
  durationMinutes,
  supabase,
}: RunMeetingFollowUpInput): Promise<RunMeetingFollowUpResult> {
  await updateMeetingStatus(supabase, meetingRecordId, "processing");

  try {
    const instructions = buildMeetingInstructions({
      transcriptPath,
      notes,
      durationMinutes,
    });

    const result = await runAgent(
      {
        clientId,
        threadId,
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
        instructions,
      },
      supabase,
    );

    if (result.status === "streaming") {
      let streamError: unknown = null;

      await result.streamResult.consumeStream({
        onError: (error: unknown) => {
          streamError = error;
        },
      });

      if (streamError) {
        const message = streamError instanceof Error
          ? streamError.message
          : "Stream consumption failed";
        await updateMeetingStatus(supabase, meetingRecordId, "failed");
        return { status: "failed", error: message };
      }

      await updateMeetingStatus(supabase, meetingRecordId, "completed");
      return { status: "completed" };
    }

    await updateMeetingStatus(supabase, meetingRecordId, "transcribed");
    return { status: "skipped_busy" };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unknown meeting follow-up error";
    await updateMeetingStatus(supabase, meetingRecordId, "failed");
    return { status: "failed", error: message };
  }
}
