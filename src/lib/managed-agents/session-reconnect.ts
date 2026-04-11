/**
 * Stream + events.list reconnect helper per Anthropic skill §1 + §7.
 *
 * The hard requirement: the live SSE stream must be opened BEFORE any
 * `user.message` is sent, otherwise we can miss the earliest events
 * (skill §7, "subscribe before you send"). The previous implementation
 * was an `async function*` generator — calling it only constructed the
 * generator object, deferring the real `events.stream(...)` call until
 * the first `for await` step, which happens AFTER the kickoff send.
 *
 * Fix: split the helper into
 *   1. `openSessionStream(client, sessionId)` — synchronous, eagerly
 *      invokes `events.stream(sessionId)` and returns a `LiveStreamHandle`.
 *      The runner calls this BEFORE `events.send`.
 *   2. `iterateSessionEvents(client, sessionId, handle)` — async iterator
 *      that drains history first, then resumes from the live handle,
 *      deduping by event id and breaking on terminal events even when
 *      the terminal event is already-seen in history.
 *
 * @module lib/managed-agents/session-reconnect
 */
import type Anthropic from "@anthropic-ai/sdk";

interface AnyEvent {
  id: string;
  type: string;
  stop_reason?: { type: string };
}

/**
 * Opaque handle returned by `openSessionStream`. Currently just wraps the
 * raw live iterable, but kept as a struct so we can attach an `unsubscribe`
 * function or a buffered-events queue later without changing call sites.
 */
export interface LiveStreamHandle {
  live: AsyncIterable<unknown>;
}

function isTerminal(event: AnyEvent): boolean {
  if (event.type === "session.status_terminated") return true;
  if (event.type === "session.status_idle") {
    const reason = event.stop_reason?.type;
    return reason === "end_turn" || reason === "retries_exhausted";
  }
  return false;
}

/**
 * Eagerly open the live SSE stream for a session. Must be called BEFORE
 * the runner posts its kickoff `user.message` (skill §7).
 */
export function openSessionStream(
  anthropic: Anthropic,
  sessionId: string,
): LiveStreamHandle {
  const live = (
    anthropic.beta.sessions.events as unknown as {
      stream: (id: string) => AsyncIterable<unknown>;
    }
  ).stream(sessionId);
  return { live };
}

/**
 * Drain the session history first, then resume from the pre-opened live
 * stream. Yields events in arrival order, deduped by id, and breaks on
 * terminal events even if the terminal was already-seen in history
 * (skill §1).
 */
export async function* iterateSessionEvents(
  anthropic: Anthropic,
  sessionId: string,
  handle: LiveStreamHandle,
): AsyncGenerator<AnyEvent> {
  const seen = new Set<string>();
  let terminal = false;

  for await (const event of anthropic.beta.sessions.events.list(
    sessionId,
  ) as unknown as AsyncIterable<unknown>) {
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

  for await (const event of handle.live) {
    const typed = event as AnyEvent;
    if (!seen.has(typed.id)) {
      seen.add(typed.id);
      yield typed;
    }
    if (isTerminal(typed)) return;
  }
}
