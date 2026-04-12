/**
 * Shared helpers for choosing stable per-turn idempotency keys from
 * Anthropic session events.
 *
 * @module lib/managed-agents/source-event-id
 */
import type { AnthropicEvent } from "./event-types";

/**
 * Pick a stable per-turn idempotency key from the accumulated events.
 *
 * Prefers the last terminal event (`session.status_idle` /
 * `session.status_terminated`) because that uniquely identifies the end
 * of the turn. Falls back to the last event id of any kind, then to a
 * synthetic `run:<runId>` key so managed-agent persistence never writes
 * without a source event id.
 */
export function pickSourceEventId(
  events: ReadonlyArray<AnthropicEvent>,
  runId: string,
): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      (event.type === "session.status_idle" ||
        event.type === "session.status_terminated") &&
      typeof event.id === "string" &&
      event.id.length > 0
    ) {
      return event.id;
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (typeof event.id === "string" && event.id.length > 0) {
      return event.id;
    }
  }

  return `run:${runId}`;
}
