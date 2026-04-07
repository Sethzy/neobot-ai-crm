/**
 * Recording view for the meetings surface.
 * @module components/meetings/meeting-recording-view
 */
"use client";

import { useEffect } from "react";

import { MeetingNotepad } from "@/components/chat/meeting-notepad";
import { RecordingBar } from "@/components/chat/recording-bar";
import { Button } from "@/components/ui/button";
import { useMeetingRecording, type RecordingStatus } from "@/hooks/meetings/use-meeting-recording";

interface MeetingRecordingViewProps {
  onDone: () => void;
}

function StatusMessage({ status }: { status: RecordingStatus }) {
  switch (status) {
    case "stopping":
      return <span>Stopping...</span>;
    case "uploading":
      return <span>Uploading audio...</span>;
    case "transcribing":
      return <span>Transcribing and summarizing...</span>;
    case "error":
      return <span className="text-destructive">Something went wrong</span>;
    default:
      return null;
  }
}

export function MeetingRecordingView({ onDone }: MeetingRecordingViewProps) {
  const {
    status,
    elapsedSeconds,
    notes,
    setNotes,
    errorMessage,
    start,
    pause,
    resume,
    stop,
  } = useMeetingRecording();

  useEffect(() => {
    void start();
  }, [start]);

  const isProcessing = status === "stopping"
    || status === "uploading"
    || status === "transcribing";
  const recorderState = status === "paused" ? "paused" : "recording";

  return (
    <div className="flex h-full flex-col">
      <RecordingBar
        state={recorderState}
        elapsedSeconds={elapsedSeconds}
        onPause={pause}
        onResume={resume}
        onStop={() => {
          void stop();
        }}
        controlsDisabled={isProcessing}
        statusLabel={isProcessing ? "Processing" : undefined}
      />

      {isProcessing ? (
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <StatusMessage status={status} />
        </div>
      ) : null}

      {status === "error" && errorMessage ? (
        <div className="bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errorMessage}
          <Button variant="link" size="sm" className="ml-2 px-0" onClick={onDone}>
            Back to meetings
          </Button>
        </div>
      ) : null}

      <MeetingNotepad
        value={notes}
        onChange={setNotes}
        isMobile={false}
      />
    </div>
  );
}
