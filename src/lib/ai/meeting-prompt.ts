/**
 * Meeting-specific runner instructions for post-recording follow-up work.
 * @module lib/ai/meeting-prompt
 */

export interface MeetingPromptInput {
  /** Workspace-relative transcript path persisted to agent file storage. */
  transcriptPath: string;
  /** User-authored notes captured while the meeting was recorded. */
  notes: string;
  /** Rounded meeting duration in minutes for model context. */
  durationMinutes: number;
}

function toAgentPath(path: string): string {
  if (path.startsWith("/agent/")) {
    return path;
  }

  return `/agent/${path.replace(/^\/+/, "")}`;
}

/**
 * Builds a focused instruction block for the background follow-up run so the
 * model reads the transcript from storage instead of assuming it is inline in
 * thread history.
 */
export function buildMeetingInstructions({
  transcriptPath,
  notes,
  durationMinutes,
}: MeetingPromptInput): string {
  const agentTranscriptPath = toAgentPath(transcriptPath);
  const trimmedNotes = notes.trim();

  return [
    `You just received a ${durationMinutes}-minute meeting recording that has already been transcribed.`,
    "",
    "Your job is to process the meeting carefully and only take external-facing actions after the user confirms them.",
    "",
    "1. Read the transcript first.",
    `Call read_file with path "${agentTranscriptPath}". Do not assume the transcript is already in the conversation.`,
    "",
    "2. Identify the CRM entities involved.",
    "Use search_crm to find matches for contacts, companies, or deals mentioned in the transcript.",
    "",
    "3. Confirm the correct CRM link with the user.",
    "Use ask_user_question before linking records or creating new CRM entries when the identity is uncertain.",
    "",
    "4. Save a concise meeting summary.",
    "Use write_file to save a bullet-point summary, action items, personal details, and decisions to an appropriate file in /agent/home/ or /agent/memory/.",
    "",
    "5. Suggest follow-up actions as a numbered list.",
    "Ask the user which actions to execute before creating tasks, updating deals, drafting emails, or saving CRM notes.",
    "",
    "Important rules:",
    "- User-authored notes override ambiguous transcript wording.",
    "- Keep summaries concise and structured.",
    "- Do not claim you read the transcript until you actually call read_file.",
    "- Do not update CRM records or create follow-up tasks until the user explicitly confirms the actions.",
    trimmedNotes.length > 0
      ? `\nUser Notes (these are authoritative):\n${trimmedNotes}`
      : "",
  ].filter(Boolean).join("\n");
}
