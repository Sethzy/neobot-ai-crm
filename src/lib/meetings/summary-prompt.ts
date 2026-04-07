/**
 * Builds the prompt for auto-summarizing a meeting transcript.
 * Used by the ingest route with generateObject() to produce structured sections.
 * @module lib/meetings/summary-prompt
 */

/**
 * Assembles the summary prompt from transcript text and optional user notes.
 * The prompt is extraction-focused: only use information explicitly stated
 * in the transcript. Returns empty arrays for sections with no content.
 */
export function buildSummaryPrompt(transcript: string, notes: string): string {
  const notesSection = notes.trim().length > 0
    ? notes.trim()
    : "(No notes taken)";

  return `You are extracting structured meeting notes for a busy advisory sales professional (real estate agent, insurance advisor, financial planner). Only extract information explicitly stated in the transcript. Do not infer, assume, or add anything not said.

## Instructions

- Generate a short, descriptive title for this meeting (e.g., "Portfolio Review with John Smith", "New Lead Intro Call")
- Extract information into the following sections. If a section has no relevant content, return an empty array.
- If User Notes are provided, treat them as authoritative — they override the transcript where they conflict
- Mark items that came from or were influenced by user notes with "(note)" at the end

## Sections

**Key Discussion Points** — Main topics discussed during the meeting. One bullet per topic.

**Action Items** — Tasks with owners if mentioned (e.g., "Send proposal by Thursday", "Speaker 1 to follow up on pricing"). Include deadlines when stated.

**Client Concerns** — Hesitations, objections, worries, or negative sentiment expressed by the client. These are critical for follow-up strategy.

**Personal Details** — Non-business details worth remembering for relationship building (e.g., "daughter Maya graduating in June", "going on vacation next week"). These compound over time.

**Next Steps** — Follow-up meetings, calls, or milestones discussed (e.g., "next meeting in two weeks", "will review proposal Monday").

## Transcript

${transcript}

## User Notes

${notesSection}

`;
}
