/**
 * Collapsible transcript section for meeting detail pages.
 * @module components/meetings/transcript-section
 */
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cleanStopWords, formatRecordingTime } from "@/lib/meetings/format-helpers";

/**
 * Cycles through Flexoki semantic accent tokens, one per unique speaker.
 * Keeps Speaker 1 as the "self" color (info/blue) and Speaker 2 as the
 * client color (stage-leads/orange) — the most common two-person pattern.
 */
const SPEAKER_COLOR_CYCLE = [
  "text-info",
  "text-stage-leads",
  "text-success",
  "text-stage-offer",
] as const;

function getSpeakerColor(speaker: string): string {
  const match = /(\d+)$/.exec(speaker);
  if (!match) {
    return "text-muted-foreground";
  }
  const index = (parseInt(match[1], 10) - 1) % SPEAKER_COLOR_CYCLE.length;
  return SPEAKER_COLOR_CYCLE[index];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string | null;
}

interface TranscriptSectionProps {
  /** Raw transcript text when no segment timestamps are available. */
  transcriptText?: string;
  /** Segment-level transcript rows with timestamps. */
  segments?: TranscriptSegment[];
  /** Whether the meeting has a transcript available to open. */
  hasTranscript: boolean;
  /** Whether at least one transcript load attempt has completed. */
  hasResolvedTranscript?: boolean;
  /** Whether transcript content is currently being fetched. */
  isLoading?: boolean;
  /** Current accordion state. */
  isOpen: boolean;
  /** Called when the transcript accordion is toggled. */
  onOpenChange: (isOpen: boolean) => void;
}

export function TranscriptSection({
  transcriptText,
  segments,
  hasTranscript,
  hasResolvedTranscript = false,
  isLoading = false,
  isOpen,
  onOpenChange,
}: TranscriptSectionProps) {
  const hasContent = (segments && segments.length > 0)
    || (transcriptText && transcriptText.trim().length > 0);

  if (!hasTranscript) {
    return null;
  }

  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="flex w-full items-center gap-1.5 text-left type-control text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Transcript
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <p className="type-control-muted text-muted-foreground">Loading transcript...</p>
          ) : segments && segments.length > 0
            ? segments.map((segment, index) => (
              <div key={index} className="flex gap-2 text-meta">
                <span className="mt-0.5 shrink-0 font-mono text-caption text-muted-foreground">
                  {formatRecordingTime(segment.start)}
                </span>
                <span className="text-foreground">
                  {segment.speaker ? (
                    <span className={`font-medium ${getSpeakerColor(segment.speaker)}`}>
                      {segment.speaker}:{" "}
                    </span>
                  ) : null}
                  {cleanStopWords(segment.text)}
                </span>
              </div>
            ))
            : transcriptText
              ? <p className="whitespace-pre-wrap text-meta text-foreground">{transcriptText}</p>
              : hasContent
                ? null
                : hasResolvedTranscript
                  ? <p className="type-control-muted text-muted-foreground">Transcript unavailable.</p>
                  : null}
        </div>
      ) : null}
    </div>
  );
}
