/**
 * Helpers for passing the first draft message from /chat to /chat/[threadId].
 * @module lib/chat/initial-message-handoff
 */

/**
 * Builds the sessionStorage key used for a one-time initial chat message handoff.
 */
export function getInitialMessageHandoffKey(threadId: string): string {
  return `initial_msg_${threadId}`;
}

