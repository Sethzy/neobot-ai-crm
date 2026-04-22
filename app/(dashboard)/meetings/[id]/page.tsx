/**
 * Meeting detail page.
 * @module app/(dashboard)/meetings/[id]/page
 */
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { SummaryView } from "@/components/meetings/summary-view";
import {
  type TranscriptSegment,
  TranscriptSection,
} from "@/components/meetings/transcript-section";
import { parseTranscriptLine } from "@/lib/meetings/format-helpers";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClientId } from "@/hooks/use-client-id";
import { useMeeting } from "@/hooks/use-meetings";
import { threadKeys } from "@/hooks/use-threads";
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
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: meeting, isLoading } = useMeeting(meetingId);
  const [transcriptData, setTranscriptData] = useState<{
    key: string;
    text?: string;
    segments?: TranscriptSegment[];
  }>();
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSendingToAgent, setIsSendingToAgent] = useState(false);
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
      <PageCanvas className="items-center justify-center">
        <p className="type-control-muted">Loading meeting...</p>
      </PageCanvas>
    );
  }

  if (!meeting) {
    return (
      <PageCanvas className="items-center justify-center">
        <p className="type-control-muted">Meeting not found.</p>
        <Link href="/meetings" className="type-control text-primary underline">
          Back to meetings
        </Link>
      </PageCanvas>
    );
  }

  const existingThreadId = meeting.thread_id;
  const currentMeetingId = meeting.meeting_record_id;
  const meetingTitle = meeting.title || "New Chat";
  const noteCount = countNotes(meeting.notes);
  const sendToAgentLabel = existingThreadId ? "Open agent thread" : "Send to agent";
  const pendingSendToAgentLabel = existingThreadId ? "Opening thread..." : "Opening agent...";

  function addThreadToSidebar(threadId: string) {
    const now = new Date().toISOString();
    queryClient.setQueriesData<Array<Record<string, unknown>>>(
      { queryKey: threadKeys.all },
      (old) => {
        if (!old) {
          return old;
        }

        if (old.some((thread) => thread.thread_id === threadId)) {
          return old;
        }

        return [
          {
            thread_id: threadId,
            client_id: clientId ?? "",
            title: meetingTitle,
            is_pinned: false,
            is_primary: false,
            is_archived: false,
            source_type: "chat",
            created_at: now,
            updated_at: now,
          },
          ...old,
        ];
      },
    );
  }

  async function handleSendToAgent() {
    if (existingThreadId) {
      router.push(`/chat/${existingThreadId}`);
      return;
    }

    setSendError(null);
    setIsSendingToAgent(true);

    try {
      const response = await fetch(`/api/meetings/${currentMeetingId}/send-to-agent`, {
        method: "POST",
      });

      if (!response.ok) {
        setSendError("Failed to send meeting to agent. Try again.");
        return;
      }

      const payload = await response.json() as { threadId: string };
      addThreadToSidebar(payload.threadId);
      void queryClient.invalidateQueries({ queryKey: threadKeys.all });
      router.push(`/chat/${payload.threadId}`);
    } finally {
      setIsSendingToAgent(false);
    }
  }

  return (
    <PageCanvas>
      <div>
        <Link
          href="/meetings"
          className="flex items-center gap-1 type-control-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Meetings
        </Link>
      </div>

      <PageSurface className="space-y-6">
        <div className="border-b border-app-border-subtle pb-4">
          <PageHeader
            title={meeting.title || "Untitled meeting"}
            titleClassName="leading-snug"
            meta={[
              formatDetailDate(meeting.created_at),
              meeting.duration_seconds
                ? formatDetailDuration(meeting.duration_seconds)
                : null,
              noteCount > 0 ? `${noteCount} note${noteCount !== 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>

        <section>
          <SummaryView summary={meeting.summary} status={meeting.status} />
        </section>

        <PageSurface variant="muted">
          <TranscriptSection transcriptText={transcriptText} segments={transcriptSegments} />
        </PageSurface>

        {meeting.notes && meeting.notes.trim().length > 0 ? (
          <section className="border-t border-app-border-subtle pt-3">
            <h2 className="mb-2 type-toolbar-title">Notes</h2>
            <p className="whitespace-pre-wrap text-body leading-relaxed text-foreground">{meeting.notes}</p>
          </section>
        ) : null}
      </PageSurface>

      <div className="border-t border-app-border-subtle pt-3">
        {sendError ? (
          <p className="mb-2 type-control text-destructive">{sendError}</p>
        ) : null}
        <Button
          type="button"
          disabled={isSendingToAgent || (!meeting.thread_id && meeting.status !== "completed")}
          className="w-full sm:w-auto"
          onClick={() => {
            void handleSendToAgent();
          }}
        >
          {isSendingToAgent ? <Spinner className="mr-2 h-4 w-4" /> : null}
          {isSendingToAgent ? pendingSendToAgentLabel : sendToAgentLabel}
        </Button>
      </div>
    </PageCanvas>
  );
}
