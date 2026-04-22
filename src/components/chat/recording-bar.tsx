/**
 * Compact recorder controls shown while a meeting is actively being captured.
 * @module components/chat/recording-bar
 */
"use client";

import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";

import type { RecorderState } from "@/hooks/use-audio-recorder";
import { Button } from "@/components/ui/button";

interface RecordingBarProps {
  state: RecorderState;
  elapsedSeconds: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  controlsDisabled?: boolean;
  statusLabel?: string;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function RecordingBar({
  state,
  elapsedSeconds,
  onPause,
  onResume,
  onStop,
  controlsDisabled = false,
  statusLabel,
}: RecordingBarProps) {
  const isPaused = state === "paused";

  return (
    <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
      <span
        aria-hidden
        className={`h-2.5 w-2.5 rounded-full ${isPaused ? "bg-muted-foreground/50" : "bg-destructive animate-pulse"}`}
      />

      <span className="font-mono text-meta tabular-nums text-foreground">
        {formatTime(elapsedSeconds)}
      </span>

      <span className="type-row-meta text-muted-foreground">
        {statusLabel ?? (isPaused ? "Paused" : "Recording")}
      </span>

      <div className="flex-1" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={isPaused ? "Resume recording" : "Pause recording"}
        onClick={isPaused ? onResume : onPause}
        disabled={controlsDisabled}
      >
        {isPaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
      </Button>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        aria-label="Stop recording"
        onClick={onStop}
        disabled={controlsDisabled}
      >
        <SquareIcon className="mr-1.5 h-3.5 w-3.5" />
        Stop
      </Button>
    </div>
  );
}
