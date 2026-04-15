/**
 * Recording view for the meetings surface.
 *
 * Before recording, checks microphone permission state:
 * - "granted" → auto-starts recording immediately.
 * - "prompt"  → shows a gate screen; clicking "Start Recording" triggers the
 *               browser's native permission dialog on a real user gesture so
 *               the user is prepared for it and less likely to accidentally block.
 * - "denied"  → shows step-by-step reset instructions and auto-retries via a
 *               `navigator.permissions` change listener.
 *
 * @module components/meetings/meeting-recording-view
 */
"use client";

import { Mic } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { MeetingNotepad } from "@/components/chat/meeting-notepad";
import { RecordingBar } from "@/components/chat/recording-bar";
import { Button } from "@/components/ui/button";
import { useMeetingRecording, type RecordingStatus } from "@/hooks/meetings/use-meeting-recording";

interface MeetingRecordingViewProps {
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

type MicPermission = "checking" | PermissionState;

/**
 * Queries the current microphone permission state and subscribes to changes.
 * Falls back to `"prompt"` on browsers that don't support the Permissions API
 * for microphone (e.g. Safari), which is the safe default — calling
 * `getUserMedia` will show the dialog.
 */
function useMicPermission(): MicPermission {
  const [state, setState] = useState<MicPermission>("checking");

  useEffect(() => {
    let permStatus: PermissionStatus | null = null;

    async function query() {
      try {
        permStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        setState(permStatus.state);
        permStatus.onchange = () => setState(permStatus!.state);
      } catch {
        // Safari — assume prompt so we try getUserMedia normally.
        setState("prompt");
      }
    }

    void query();

    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  return state;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MeetingRecordingView({ onDone }: MeetingRecordingViewProps) {
  const {
    status,
    elapsedSeconds,
    notes,
    setNotes,
    errorMessage,
    isPermissionError,
    start,
    pause,
    resume,
    stop,
  } = useMeetingRecording();

  const micPermission = useMicPermission();

  // Auto-start only when permission is already granted.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (micPermission === "granted" && !autoStarted && status === "idle") {
      setAutoStarted(true);
      void start();
    }
  }, [micPermission, autoStarted, status, start]);

  // Auto-retry when the user resets mic permission while viewing the blocked
  // state — the permissions listener fires and we call start() which will
  // either succeed directly (granted) or show the browser dialog (prompt).
  const handlePermissionRestored = useCallback(() => {
    if (isPermissionError) {
      void start();
    }
  }, [isPermissionError, start]);

  useEffect(() => {
    if (!isPermissionError) return;

    // Re-subscribe after an error so we catch the next permission change.
    let permStatus: PermissionStatus | null = null;

    async function watch() {
      try {
        permStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        permStatus.onchange = () => {
          if (permStatus!.state === "granted" || permStatus!.state === "prompt") {
            handlePermissionRestored();
          }
        };
      } catch {
        // noop
      }
    }

    void watch();
    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, [isPermissionError, handlePermissionRestored]);

  const isProcessing = status === "stopping"
    || status === "uploading"
    || status === "transcribing";
  const recorderState = status === "paused" ? "paused" : "recording";

  // ----- Permission gate: waiting for user to click Start -----
  if (micPermission === "prompt" && status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Mic className="h-7 w-7 text-primary" />
        </div>
        <div className="text-center">
          <p className="font-medium">Ready to record</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your browser will ask for microphone access.
          </p>
        </div>
        <Button onClick={() => void start()}>
          Start Recording
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    );
  }

  // ----- Permission gate: loading permission state -----
  if (micPermission === "checking") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Preparing...</p>
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
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <StatusMessage status={status} />
        </div>
      ) : null}

      {status === "error" && isPermissionError ? (
        <div className="bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Microphone access is blocked</p>
          <p className="mt-1 text-muted-foreground">
            Your browser blocked microphone access. To fix this:
          </p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Click the <strong>icon to the left of the URL</strong> in your address bar</li>
            <li>Find <strong>Microphone</strong> and change it to <strong>Allow</strong></li>
            <li>Recording will start automatically</li>
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void start()}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Back to meetings
            </Button>
          </div>
        </div>
      ) : status === "error" && errorMessage ? (
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
