/**
 * Durable meeting ingest pipeline for recorded audio uploads.
 * @module app/api/meetings/ingest/route
 */
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import {
  COMPACTION_MODEL,
  gateway,
  gatewayProviderOptions,
} from "@/lib/ai/gateway";
import { resolveClientId } from "@/lib/chat/client-id";
import { formatRecordingTime } from "@/lib/meetings/format-helpers";
import { buildSummaryPrompt } from "@/lib/meetings/summary-prompt";
import { DEFAULT_STT_LANGUAGE, SUPPORTED_STT_LANGUAGE_CODES } from "@/lib/transcription/languages";
import { transcribeAudio } from "@/lib/transcription/xai-stt";
import type { Database } from "@/types/database";

export const maxDuration = 300;

const AGENT_FILES_BUCKET = "agent-files";
const AUDIO_SIGNED_URL_EXPIRY_SECONDS = 60 * 60;
type ChatSupabaseClient = SupabaseClient<Database>;

function buildTranscriptBody(transcription: Awaited<ReturnType<typeof transcribeAudio>>) {
  if (transcription.segments.length === 0) {
    return transcription.text;
  }

  return transcription.segments
    .map((segment) => `${formatRecordingTime(segment.start)} Speaker ${segment.speaker}: ${segment.text}`)
    .join("\n");
}

const ingestSchema = z.object({
  storagePath: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  notes: z.string().optional().default(""),
  idempotencyKey: z.string().uuid(),
  language: z.string()
    .optional()
    .default(DEFAULT_STT_LANGUAGE)
    .refine((code) => SUPPORTED_STT_LANGUAGE_CODES.has(code), {
      message: "Unsupported transcription language",
    }),
});

async function updateMeetingRecordStatus(
  supabase: ChatSupabaseClient,
  meetingRecordId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("meeting_records")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("meeting_record_id", meetingRecordId);

  if (error) {
    throw new Error(`Failed to update meeting record: ${error.message}`);
  }
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

    const { storagePath, durationSeconds, notes, idempotencyKey, language } = parsedBody.data;
    const clientId = await resolveClientId(supabase, userId);
    const expectedPrefix = `${clientId}/meetings/raw/`;

    if (!storagePath.startsWith(expectedPrefix)) {
      return jsonError("Invalid meeting audio path", 403);
    }

    const { data: existingRecord } = await supabase
      .from("meeting_records")
      .select("meeting_record_id, status, transcript_path, title, summary")
      .eq("idempotency_key", idempotencyKey)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingRecord && existingRecord.status !== "uploaded" && existingRecord.status !== "failed") {
      return Response.json({
        success: true,
        meetingRecordId: existingRecord.meeting_record_id,
        transcriptPath: existingRecord.transcript_path,
        title: existingRecord.title ?? null,
        summary: existingRecord.summary ?? null,
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
          thread_id: null,
          idempotency_key: idempotencyKey,
          audio_path: storagePath,
          duration_seconds: durationSeconds,
          notes: notes || null,
          status: "uploaded",
        })
        .select("meeting_record_id")
        .single();

      if (insertError || !insertedRecord) {
        console.error("[meeting-ingest] Failed to insert meeting record:", insertError);
        return jsonError("Failed to create meeting record", 500);
      }

      meetingRecordId = insertedRecord.meeting_record_id;
    }

    const t0 = Date.now();
    console.log(`[meeting-ingest] ▶ start | meeting=${meetingRecordId} duration=${durationSeconds}s`);

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "transcribing",
    });

    const { data: signedAudioUrl, error: signedAudioUrlError } = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(storagePath, AUDIO_SIGNED_URL_EXPIRY_SECONDS);

    if (signedAudioUrlError || !signedAudioUrl?.signedUrl) {
      throw new Error("Failed to access audio file");
    }

    console.log(`[meeting-ingest] ▶ stt submit | language=${language} | ${Date.now() - t0}ms`);
    const transcription = await transcribeAudio({
      audioUrl: signedAudioUrl.signedUrl,
      language,
    });
    console.log(`[meeting-ingest] ✓ stt done | segments=${transcription.segments.length} textLen=${transcription.text.length} | ${Date.now() - t0}ms`);

    const dateString = new Date().toISOString().split("T")[0];
    const transcriptPath = `home/meetings/${dateString}-meeting-${meetingRecordId.slice(0, 8)}.md`;
    const transcriptStoragePath = `${clientId}/${transcriptPath}`;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const transcriptBody = buildTranscriptBody(transcription);
    console.log(`[meeting-ingest] transcript preview: ${transcriptBody.slice(0, 200)}`);

    const transcriptContent = [
      `# Meeting Recording - ${dateString}`,
      `**Duration:** ${durationMinutes} minutes`,
      notes.trim().length > 0 ? `\n## User Notes\n${notes.trim()}` : "",
      `\n## Transcript\n${transcriptBody}`,
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
    console.log(`[meeting-ingest] ✓ transcript saved | ${Date.now() - t0}ms`);

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "transcribed",
      transcript_path: transcriptPath,
    });

    const MIN_TRANSCRIPT_LENGTH = 20;
    const strippedText = transcriptBody.replace(/\[[\d:]+\]\s*Speaker\s*\d+:\s*/g, "").trim();
    const isTranscriptTooShort = strippedText.length < MIN_TRANSCRIPT_LENGTH;
    console.log(`[meeting-ingest] transcript stripped length=${strippedText.length} tooShort=${isTranscriptTooShort}`);

    if (isTranscriptTooShort) {
      console.log(`[meeting-ingest] ⏭ skipping summary (too short) | ${Date.now() - t0}ms`);
      await updateMeetingRecordStatus(supabase, meetingRecordId, {
        status: "completed",
        title: "Untitled Recording",
        summary: null,
      });

      return Response.json({
        success: true,
        meetingRecordId,
        transcriptPath,
        title: "Untitled Recording",
        summary: null,
      });
    }

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "summarizing",
    });

    console.log(`[meeting-ingest] ▶ summary LLM (${COMPACTION_MODEL}) | ${Date.now() - t0}ms`);
    const summaryPrompt = buildSummaryPrompt(transcriptBody, notes);
    const summarySchema = z.object({
      title: z.string().describe("Short meeting title, 3-8 words"),
      key_discussion_points: z.array(z.string()).describe("Main topics discussed"),
      action_items: z.array(z.string()).describe("Tasks with owners and deadlines"),
      client_concerns: z.array(z.string()).describe("Hesitations, objections, worries"),
      personal_details: z.array(z.string()).describe("Non-business relationship details"),
      next_steps: z.array(z.string()).describe("Follow-up meetings, calls, milestones"),
    });
    const { object: summaryResult } = await generateObject({
      model: gateway(COMPACTION_MODEL),
      schema: summarySchema,
      prompt: summaryPrompt,
      providerOptions: gatewayProviderOptions,
    });
    console.log(`[meeting-ingest] ✓ summary done | title="${summaryResult.title}" | ${Date.now() - t0}ms`);

    const { title, ...sections } = summaryResult;
    const summaryJson = JSON.stringify(sections);
    console.log(`[meeting-ingest] summary sections: points=${sections.key_discussion_points.length} actions=${sections.action_items.length} concerns=${sections.client_concerns.length} personal=${sections.personal_details.length} next=${sections.next_steps.length}`);

    await updateMeetingRecordStatus(supabase, meetingRecordId, {
      status: "completed",
      title,
      summary: summaryJson,
    });

    console.log(`[meeting-ingest] ✓ complete | ${Date.now() - t0}ms total`);
    return Response.json({
      success: true,
      meetingRecordId,
      transcriptPath,
      title,
      summary: summaryJson,
    });
  } catch (error) {
    if (meetingRecordId) {
      try {
        await updateMeetingRecordStatus(supabase, meetingRecordId, {
          status: "failed",
        });
      } catch (statusError) {
        console.error("[meeting-ingest] Failed to mark meeting as failed:", statusError);
      }
    }

    console.error("[meeting-ingest] Error:", error);
    return jsonError("Meeting ingest failed", 500);
  }
}
