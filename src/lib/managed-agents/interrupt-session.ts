/**
 * Posts a `user.interrupt` event to a Managed Agents session.
 *
 * Interrupts use the same session events endpoint as `user.message`; only
 * the event `type` changes. Once Anthropic accepts the event, the session
 * emits follow-up status changes on its event stream and any live
 * subscribers can react to the stop immediately.
 *
 * @module lib/managed-agents/interrupt-session
 */
import type Anthropic from "@anthropic-ai/sdk";

export async function interruptSession(
  anthropic: Anthropic,
  sessionId: string,
): Promise<void> {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.interrupt" }],
  } as never);
}
