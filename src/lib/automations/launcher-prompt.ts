/**
 * Builds the visible kickoff message used when the Automations page launches a
 * normal chat thread. The prefix makes the transcript read like an automation
 * setup request instead of a generic chat.
 * @module lib/automations/launcher-prompt
 */

/**
 * Prefixes the user's automation request with the launcher framing used in the
 * reference UX. Returns an empty string for empty input so callers can no-op.
 */
export function buildAutomationLauncherPrompt(request: string): string {
  const trimmedRequest = request.trim();

  if (trimmedRequest.length === 0) {
    return "";
  }

  return `Create an automation: ${trimmedRequest}`;
}
