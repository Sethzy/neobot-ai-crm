/**
 * Tests for `iterateSessionEventsForever` — the long-lived wrapper that
 * re-subscribes after each terminal event, exiting only when the abort
 * signal fires.
 *
 * @module lib/managed-agents/__tests__/session-reconnect-forever.test
 */
import { describe, it, expect, vi } from "vitest";

import { iterateSessionEventsForever } from "../session-reconnect";

import {
  agentMessageTextEvent,
  statusIdleEvent,
} from "./fixtures/events";

/**
 * Build a fake Anthropic client whose `events.stream()` returns a fresh
 * async iterable each time it's called, pulling from `batches[callIndex]`.
 */
function fakeForeverClient(batches: unknown[][]) {
  let callIndex = 0;
  const stream = vi.fn(() => {
    const events = batches[callIndex] ?? [];
    callIndex += 1;
    return Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        for (const e of events) yield e;
      },
    });
  });
  const list = vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      // Empty history — forever iterator doesn't drain history.
    },
  }));
  return {
    client: {
      beta: { sessions: { events: { stream, list } } },
    } as never,
    stream,
    list,
  };
}

describe("iterateSessionEventsForever", () => {
  it("yields events across multiple inner-iterator cycles", async () => {
    const { client } = fakeForeverClient([
      // Cycle 1: one message, then terminal
      [
        agentMessageTextEvent("evt_1", "hello"),
        statusIdleEvent("evt_idle_1", "end_turn"),
      ],
      // Cycle 2: another message, then terminal
      [
        agentMessageTextEvent("evt_2", "world"),
        statusIdleEvent("evt_idle_2", "end_turn"),
      ],
    ]);

    const ac = new AbortController();
    const seen: string[] = [];

    for await (const event of iterateSessionEventsForever(
      client,
      "sess_1",
      ac.signal,
    )) {
      seen.push((event as { id: string }).id);
      // Abort after seeing the second cycle's message
      if (seen.length >= 3) {
        ac.abort();
      }
    }

    // Should have yielded events from both cycles before aborting
    expect(seen).toContain("evt_1");
    expect(seen).toContain("evt_idle_1");
    expect(seen).toContain("evt_2");
  });

  it("exits immediately when signal is already aborted", async () => {
    const { client, stream } = fakeForeverClient([
      [agentMessageTextEvent("evt_1", "hello")],
    ]);

    const ac = new AbortController();
    ac.abort();

    const seen: string[] = [];
    for await (const event of iterateSessionEventsForever(
      client,
      "sess_1",
      ac.signal,
    )) {
      seen.push((event as { id: string }).id);
    }

    expect(seen).toEqual([]);
    expect(stream).not.toHaveBeenCalled();
  });

  it("re-subscribes after the inner stream ends on terminal", async () => {
    const { client, stream } = fakeForeverClient([
      [statusIdleEvent("evt_idle_1", "end_turn")],
      [
        agentMessageTextEvent("evt_2", "resumed"),
        statusIdleEvent("evt_idle_2", "end_turn"),
      ],
    ]);

    const ac = new AbortController();
    const seen: string[] = [];

    for await (const event of iterateSessionEventsForever(
      client,
      "sess_1",
      ac.signal,
    )) {
      seen.push((event as { id: string }).id);
      if ((event as { id: string }).id === "evt_idle_2") {
        ac.abort();
      }
    }

    // stream() was called twice — once per cycle
    expect(stream).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["evt_idle_1", "evt_2", "evt_idle_2"]);
  });

  it("replays missed history after a reconnect gap before resuming live events", async () => {
    let streamCallCount = 0;
    let listCallCount = 0;

    const stream = vi.fn(() => {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        return Promise.resolve({
          [Symbol.asyncIterator]: async function* () {
            yield agentMessageTextEvent("evt_1", "hello");
            yield statusIdleEvent("evt_idle_1", "end_turn");
          },
        });
      }

      return Promise.resolve({
        [Symbol.asyncIterator]: async function* () {
          yield agentMessageTextEvent("evt_3", "live");
          yield statusIdleEvent("evt_idle_2", "end_turn");
        },
      });
    });

    const list = vi.fn(() => {
      listCallCount += 1;

      // Cycle 1 history drain — afterId is null so cursorReached is
      // true immediately. Empty history for the first turn.
      if (listCallCount === 1) {
        return {
          [Symbol.asyncIterator]: async function* () {
            // no-op
          },
        };
      }

      // Cycle 2 history drain after reconnect. afterId is "evt_idle_1"
      // (last event from cycle 1). `evt_2` landed while the client was
      // disconnected, so it only exists in history.
      return {
        [Symbol.asyncIterator]: async function* () {
          yield agentMessageTextEvent("evt_1", "hello");
          yield statusIdleEvent("evt_idle_1", "end_turn");
          yield agentMessageTextEvent("evt_2", "gap");
          yield agentMessageTextEvent("evt_3", "live");
          yield statusIdleEvent("evt_idle_2", "end_turn");
        },
      };
    });

    const client = {
      beta: { sessions: { events: { stream, list } } },
    } as never;

    const ac = new AbortController();
    const seen: string[] = [];

    for await (const event of iterateSessionEventsForever(
      client,
      "sess_1",
      ac.signal,
    )) {
      seen.push((event as { id: string }).id);
      if ((event as { id: string }).id === "evt_idle_2") {
        ac.abort();
      }
    }

    expect(seen).toEqual([
      "evt_1",
      "evt_idle_1",
      "evt_2",
      "evt_3",
      "evt_idle_2",
    ]);
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
