/**
 * Builds the prompt for auto-summarizing a meeting transcript.
 * Used by the ingest route with generateObject() to produce a title and summary.
 * @module lib/meetings/summary-prompt
 */

/**
 * Assembles the summary prompt from transcript text and optional user notes.
 * User notes are treated as authoritative and override the transcript where
 * they conflict.
 */
export function buildSummaryPrompt(transcript: string, notes: string): string {
  const notesSection = notes.trim().length > 0
    ? notes.trim()
    : "(No notes taken)";

  return `You are summarizing a meeting recording for a busy sales professional. They need to quickly see what happened and what needs to follow up.

## Instructions

- Generate a short, descriptive title for this meeting (e.g., "Portfolio Review with John Smith", "New Lead Intro Call", "Team Standup")
- Generate a bullet-point summary of the key points discussed, decisions made, and action items identified
- If User Notes are provided, treat them as authoritative - they override the transcript where they conflict
- Mark bullet points that came from or were influenced by user notes with "← note" at the end
- Keep the summary concise - aim for 5-10 bullet points for a 30-60 min meeting, fewer for shorter meetings
- Use plain language, not jargon
- Lead with the most important items (decisions, action items) before background discussion

## Transcript

${transcript}

## User Notes

${notesSection}`;
}
