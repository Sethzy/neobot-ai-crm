/**
 * Durable meeting ingest pipeline for recorded audio uploads.
 * @module app/api/meetings/ingest/route
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { createMessage } from "@/lib/chat/messages";
import { runMeetingFollowUp } from "@/lib/runner/run-meeting-followup";
import { transcribeAudio } from "@/lib/transcription/groq-whisper";
import type { Database } from "@/types/database";

export const maxDuration = 300;

const AGENT_FILES_BUCKET = "agent-files";
const AUDIO_SIGNED_URL_EXPIRY_SECONDS = 60 * 60;
type ChatSupabaseClient = SupabaseClient<Database>;

const ingestSchema = z.object({
  storagePath: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  notes: z.string().optional().default(""),
  threadId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

async function updateMeetingRecordStatus(
  supabase: ChatSupabaseClient,
  meetingRecordId: string,
  patch: Record<string, unknown>,
) {
  await supabase
    .from("meeting_records")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("meeting_record_id", meetingRecordId);
}

export async function POST(request: Request) {
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;
  let meetingRecordId: string | null = null;

  try {
    const requestBody = await request.json();
    const parsedBody = ingestSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonError(
        parsedBody.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { storagePath, durationSeconds, notes, threadId, idempotencyKey } = parsedBody.data;
    const clientId = await resolveClientId(supabase, userId);
    const expectedPrefix = `${clientId}/meetings/raw/`;

    if (!storagePath.startsWith(expectedPrefix)) {
      return jsonError("Invalid meeting audio path", 403);
    }

    const { data: existingRecord } = await supabase
      .from("meeting_records")
      .select("meeting_record_id, status, transcript_path")
      .eq("idempotency_key", idempotencyKey)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingRecord && existingRecord.status !== "uploaded" && existingRecord.status !== "failed") {
      return Response.json({
        success: true,
        meetingRecordId: existingRecord.meeting_record_id,
        transcriptPath: existingRecord.transcript_path,
        deduplicated: true,
      });
    }

    if (existingRecord) {
      meetingRecordId = existingRecord.meeting_record_id;
    } else {
      const { data: insertedRecord, error: insertError } = await supabase
        .from("meeting_records")
        .insert({
          client_id: clientId,
          thread_id: threadId,
          idempotency_key: idempotencyKey,
          audio_path: storagePath,
          duration_seconds: durationSeconds,
          notes: notes || null,
          status: "uploaded",
        })
        .select("meeting_record_id")
        .single();

      if (insertError || !insertedRecord) {
        return jsonError("Failed to create meeting record", 500);
      }

      meetingRecordId = insertedRecord.meeting_record_id;
    }

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "transcribing",
    });

    const { data: signedAudioUrl, error: signedAudioUrlError } = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(storagePath, AUDIO_SIGNED_URL_EXPIRY_SECONDS);

    if (signedAudioUrlError || !signedAudioUrl?.signedUrl) {
      throw new Error("Failed to access audio file");
    }

    const transcription = await transcribeAudio({
      audioUrl: signedAudioUrl.signedUrl,
    });

    const dateString = new Date().toISOString().split("T")[0];
    const transcriptPath = `home/meetings/${dateString}-meeting-${meetingRecordId.slice(0, 8)}.md`;
    const transcriptStoragePath = `${clientId}/${transcriptPath}`;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const transcriptContent = [
      `# Meeting Recording - ${dateString}`,
      `**Duration:** ${durationMinutes} minutes`,
      notes.trim().length > 0 ? `\n## User Notes\n${notes.trim()}` : "",
      `\n## Transcript\n${transcription.text}`,
    ].filter(Boolean).join("\n");

    const { error: uploadError } = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .upload(transcriptStoragePath, transcriptContent, {
        contentType: "text/markdown",
        upsert: true,
      });

    if (uploadError) {
      throw new Error("Failed to save transcript");
    }

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "transcribed",
      transcript_path: transcriptPath,
    });

    const noteCount = notes
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
    const eventText = `[Meeting recorded: ${durationMinutes} min${noteCount > 0 ? `, ${noteCount} notes` : ""}]`;

    await createMessage(supabase, {
      thread_id: threadId,
      role: "user",
      content: eventText,
      parts: [
        { type: "text", text: eventText },
        { type: "data", data: { source: "background-job", kind: "meeting-recorded" } },
      ],
    });

    void runMeetingFollowUp({
      clientId,
      threadId,
      meetingRecordId,
      transcriptPath,
      notes,
      durationMinutes,
      supabase,
    }).catch((error) => {
      console.error("[meeting-ingest] Follow-up run failed:", error);
    });

    return Response.json({
      success: true,
      meetingRecordId,
      transcriptPath,
    });
  } catch (error) {
    if (meetingRecordId) {
      await updateMeetingRecordStatus(supabase, meetingRecordId, {
        status: "failed",
      });
    }

    console.error("[meeting-ingest] Error:", error);
    return jsonError("Meeting ingest failed", 500);
  }
}
