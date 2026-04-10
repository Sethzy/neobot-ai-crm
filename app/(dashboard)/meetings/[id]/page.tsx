/**
 * Meeting detail page.
 * @module app/(dashboard)/meetings/[id]/page
 */
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { SummaryView } from "@/components/meetings/summary-view";
import {
  type TranscriptSegment,
  TranscriptSection,
} from "@/components/meetings/transcript-section";
import { parseTranscriptLine } from "@/lib/meetings/format-helpers";
import { Button } from "@/components/ui/button";
import { useClientId } from "@/hooks/use-client-id";
import { useMeeting } from "@/hooks/use-meetings";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import { supabase } from "@/lib/supabase";

function formatDetailDuration(seconds: number | null): string {
  if (!seconds) {
    return "";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatDetailDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function countNotes(notes: string | null): number {
  if (!notes) {
    return 0;
  }

  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .length;
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id ?? "";
  const router = useRouter();
  const { data: clientId } = useClientId();
  const { data: meeting, isLoading } = useMeeting(meetingId);
  const [transcriptData, setTranscriptData] = useState<{
    key: string;
    text?: string;
    segments?: TranscriptSegment[];
  }>();
  const [sendError, setSendError] = useState<string | null>(null);
  const transcriptPath = meeting?.transcript_path ?? null;
  const transcriptKey = clientId && transcriptPath ? `${clientId}/${transcriptPath}` : null;
  const transcriptText = transcriptData?.key === transcriptKey
    ? transcriptData.text
    : undefined;
  const transcriptSegments = transcriptData?.key === transcriptKey
    ? transcriptData.segments
    : undefined;

  useEffect(() => {
    if (!transcriptKey || !clientId || !transcriptPath) {
      return;
    }

    const currentTranscriptKey = transcriptKey;
    let isCancelled = false;

    async function loadTranscript() {
      const { data, error } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(`${clientId}/${transcriptPath}`);

      if (error || !data || isCancelled) {
        return;
      }

      const content = await data.text();
      if (isCancelled) {
        return;
      }

      const [, transcriptBody = ""] = content.split("\n## Transcript\n");
      const rawTranscript = transcriptBody.trim();
      const segmentLines = rawTranscript.length > 0 ? rawTranscript.split("\n") : [];
      const parsedSegments = segmentLines
        .map((line) => {
          const parsed = parseTranscriptLine(line);

          if (!parsed) {
            return null;
          }

          return {
            start: parsed.start,
            end: parsed.start,
            text: parsed.text,
            speaker: parsed.speaker,
          };
        })
        .filter((segment): segment is TranscriptSegment => segment !== null);

      setTranscriptData({
        key: currentTranscriptKey,
        segments: parsedSegments.length > 0 ? parsedSegments : undefined,
        text: parsedSegments.length > 0 ? undefined : rawTranscript,
      });
    }

    void loadTranscript();

    return () => {
      isCancelled = true;
    };
  }, [clientId, transcriptKey, transcriptPath]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Meeting not found.</p>
        <Link href="/meetings" className="text-sm text-primary underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  const existingThreadId = meeting.thread_id;
  const currentMeetingId = meeting.meeting_record_id;
  const noteCount = countNotes(meeting.notes);
  const sendToAgentLabel = existingThreadId ? "Open agent thread" : "Send to agent";

  async function handleSendToAgent() {
    if (existingThreadId) {
      router.push(`/chat/${existingThreadId}`);
      return;
    }

    setSendError(null);
    const response = await fetch(`/api/meetings/${currentMeetingId}/send-to-agent`, {
      method: "POST",
    });

    if (!response.ok) {
      setSendError("Failed to send meeting to agent. Try again.");
      return;
    }

    const payload = await response.json() as { threadId: string };
    router.push(`/chat/${payload.threadId}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-1">
        <Link
          href="/meetings"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Meetings
        </Link>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-2">
        <div className="border-b pb-4">
          <h1 className="text-xl font-bold leading-snug">{meeting.title || "Untitled meeting"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatDetailDate(meeting.created_at)}
            {meeting.duration_seconds ? ` · ${formatDetailDuration(meeting.duration_seconds)}` : ""}
            {noteCount > 0 ? ` · ${noteCount} note${noteCount !== 1 ? "s" : ""}` : ""}
          </p>
        </div>

        <section>
          <SummaryView summary={meeting.summary} status={meeting.status} />
        </section>

        <TranscriptSection transcriptText={transcriptText} segments={transcriptSegments} />

        {meeting.notes && meeting.notes.trim().length > 0 ? (
          <section className="border-t pt-3">
            <h2 className="mb-2 text-sm font-semibold">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-foreground">{meeting.notes}</p>
          </section>
        ) : null}
      </div>

      <div className="border-t px-4 py-3">
        {sendError ? (
          <p className="mb-2 text-sm text-destructive">{sendError}</p>
        ) : null}
        <Button
          type="button"
          disabled={!meeting.thread_id && meeting.status !== "completed"}
          className="w-full sm:w-auto"
          onClick={() => {
            void handleSendToAgent();
          }}
        >
          {sendToAgentLabel}
        </Button>
      </div>
    </div>
  );
}
