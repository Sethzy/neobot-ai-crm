/**
 * Stream + events.list reconnect helper per Anthropic skill §1.
 *
 * Yields events in order, deduped by id, but ALWAYS breaks on terminal
 * events (end_turn / retries_exhausted / status_terminated) — even if the
 * terminal event was already-seen in the history response.
 *
 * The live SSE stream is opened FIRST (skill §7), so the server starts
 * buffering events for us before we drain history. After history finishes
 * (or short-circuits on a terminal event), we resume from the live cursor.
 *
 * @module lib/managed-agents/session-reconnect
 */
import type Anthropic from "@anthropic-ai/sdk";

interface AnyEvent {
  id: string;
  type: string;
  stop_reason?: { type: string };
}

function isTerminal(event: AnyEvent): boolean {
  if (event.type === "session.status_terminated") return true;
  if (event.type === "session.status_idle") {
    const reason = event.stop_reason?.type;
    return reason === "end_turn" || reason === "retries_exhausted";
  }
  return false;
}

export async function* iterateSessionEvents(
  anthropic: Anthropic,
  sessionId: string,
): AsyncGenerator<AnyEvent> {
  // Stream-first, then history (skill §1 + §7). The live stream buffers
  // server-side while we drain history.
  const liveStream = anthropic.beta.sessions.events.stream(sessionId);
  const seen = new Set<string>();
  let terminal = false;

  for await (const event of anthropic.beta.sessions.events.list(sessionId)) {
    const typed = event as AnyEvent;
    if (!seen.has(typed.id)) {
      seen.add(typed.id);
      yield typed;
    }
    if (isTerminal(typed)) {
      terminal = true;
      break;
    }
  }
  if (terminal) return;

  for await (const event of liveStream as AsyncIterable<AnyEvent>) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      yield event;
    }
    if (isTerminal(event)) return;
  }
}
