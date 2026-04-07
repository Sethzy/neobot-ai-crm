/**
 * Display format helpers for meeting timestamps and transcript cleanup.
 * Copied from the Meetily reference patterns for the meetings surface.
 * @module lib/meetings/format-helpers
 */

/** Formats seconds as MM:SS for the recording timer display. */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/** Formats seconds as [MM:SS] for transcript segment timestamps. */
export function formatRecordingTime(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "[--:--]";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `[${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;
}

const STOP_WORDS = ["uh", "um", "er", "ah", "hmm", "hm", "eh", "oh"];

/**
 * Removes filler words from transcript text before display.
 * This is a presentation-only cleanup and should not be applied to stored data.
 */
export function cleanStopWords(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleanedText = text;

  for (const stopWord of STOP_WORDS) {
    const pattern = new RegExp(`\\b${stopWord}\\b[,\\s]*`, "gi");
    cleanedText = cleanedText.replace(pattern, " ");
  }

  return cleanedText.replace(/\s+/g, " ").trim();
}
