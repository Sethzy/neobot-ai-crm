/**
 * Inline status card for meeting upload and transcription progress.
 * @module components/chat/upload-progress
 */
"use client";

import { CheckCircle2, Loader2 } from "@/components/icons/lucide-compat";

export type UploadPhase = "uploading" | "transcribing" | "done" | "error";

interface UploadProgressProps {
  phase: UploadPhase;
  progress?: number;
  durationMinutes?: number;
  noteCount?: number;
  error?: string;
}

export function UploadProgress({
  phase,
  progress,
  durationMinutes,
  noteCount,
  error,
}: UploadProgressProps) {
  if (phase === "error") {
    return (
      <div className="mx-4 my-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Upload failed: {error ?? "Unknown error"}
      </div>
    );
  }

  const phaseLabel = phase === "uploading"
    ? `Uploading recording... ${typeof progress === "number" ? `${progress}%` : ""}`.trim()
    : phase === "transcribing"
      ? "Transcribing..."
      : "Uploaded · Transcribing...";

  return (
    <div className="mx-4 my-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        {phase === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <span>{phaseLabel}</span>
      </div>

      {typeof durationMinutes === "number" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {durationMinutes} min recording
          {typeof noteCount === "number" && noteCount > 0 ? ` · ${noteCount} notes` : ""}
        </p>
      ) : null}
    </div>
  );
}
