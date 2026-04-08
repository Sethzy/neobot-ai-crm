/**
 * Collapsible transcript section for meeting detail pages.
 * @module components/meetings/transcript-section
 */
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

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

import { cleanStopWords, formatRecordingTime } from "@/lib/meetings/format-helpers";

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
}

export function TranscriptSection({ transcriptText, segments }: TranscriptSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasContent = (segments && segments.length > 0)
    || (transcriptText && transcriptText.trim().length > 0);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setIsOpen((currentState) => !currentState)}
        className="flex w-full items-center gap-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Transcript
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-2">
          {segments && segments.length > 0
            ? segments.map((segment, index) => (
              <div key={index} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
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
              ? <p className="whitespace-pre-wrap text-sm text-foreground">{transcriptText}</p>
              : null}
        </div>
      ) : null}
    </div>
  );
}
