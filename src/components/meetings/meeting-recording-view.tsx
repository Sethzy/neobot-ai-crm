/**
 * Recording view for the meetings surface.
 *
 * Pattern (per `docs/product/plans/2026-04-06-001-feat-meeting-recorder-plan.md`):
 * "User clicks Record → getUserMedia permission prompt (first time only)"
 * "Mic permission denied → show error in UI, don't start recording"
 *
 * We call `start()` on mount — the parent "New Meeting" button click is the
 * user gesture that satisfies browser autoplay/permission requirements. If
 * the browser denies, `start()` sets status=error + isPermissionError=true
 * and we render recovery guidance with a Try-again button.
 *
 * We deliberately do NOT use `navigator.permissions.query({name:"microphone"})`
 * for pre-flight gating: its state is cached and stale on Chrome for
 * localhost/HTTP origins, and toggling the site-settings popup does not
 * reliably fire `onchange`. `getUserMedia()` is the source of truth.
 *
 * @module components/meetings/meeting-recording-view
 */
"use client";

import { Mic } from "lucide-react";
import { useEffect } from "react";

import { MeetingNotepad } from "@/components/chat/meeting-notepad";
import { RecordingBar } from "@/components/chat/recording-bar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMeetingRecording, type RecordingStatus } from "@/hooks/meetings/use-meeting-recording";
import { STT_LANGUAGES } from "@/lib/transcription/languages";

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
    isPermissionError,
    language,
    setLanguage,
    start,
    pause,
    resume,
    stop,
  } = useMeetingRecording();

  // Kick off recording on mount. The parent "New Meeting" click is the user
  // gesture; the browser will show the permission dialog on first use and
  // reuse the decision afterwards. The hook's isStartingRef guard handles
  // StrictMode double-invocation.
  useEffect(() => {
    void start();
  }, [start]);

  const isProcessing = status === "stopping"
    || status === "uploading"
    || status === "transcribing";
  const recorderState = status === "paused" ? "paused" : "recording";

  // ----- Permission blocked gate -----
  // When getUserMedia rejects with NotAllowedError we land here. Show
  // recovery guidance instead of the recording bar so there's no fake
  // "Recording" label on screen.
  if (status === "error" && isPermissionError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <Mic className="h-7 w-7 text-destructive" />
        </div>
        <div className="max-w-sm text-center">
          <p className="font-medium text-destructive">Microphone access is blocked</p>
          <p className="mt-1 type-control-muted text-muted-foreground">
            Your browser blocked microphone access. To fix this:
          </p>
          <ol className="mt-3 list-inside list-decimal space-y-1 text-left type-control-muted text-muted-foreground">
            <li>Click the <strong>icon to the left of the URL</strong> in your address bar</li>
            <li>Find <strong>Microphone</strong> and change it to <strong>Allow</strong></li>
            <li>Reload the page or click Try again</li>
          </ol>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void start()}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Back to meetings
          </Button>
        </div>
      </div>
    );
  }

  // ----- Idle (pre-getUserMedia resolution) -----
  // Very brief window between mount and start() resolving. Show a spinner-
  // less preparing label so the fake "Recording" bar can't flash.
  if (status === "idle") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="type-control-muted">Preparing...</p>
      </div>
    );
  }

  // ----- Main recording UI -----
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
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 type-control-muted text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <StatusMessage status={status} />
        </div>
      ) : null}

      {status === "error" && errorMessage ? (
        <div className="bg-destructive/10 px-4 py-2 type-control text-destructive">
          {errorMessage}
          <Button variant="link" size="sm" className="ml-2 px-0" onClick={onDone}>
            Back to meetings
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 type-row-meta text-muted-foreground">
        <span>Language</span>
        <Select value={language} onValueChange={setLanguage} disabled={isProcessing}>
          <SelectTrigger className="h-7 w-40 text-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STT_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code} className="text-caption">
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <MeetingNotepad
        value={notes}
        onChange={setNotes}
        isMobile={false}
      />
    </div>
  );
}
