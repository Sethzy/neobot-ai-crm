/**
 * @module lib/managed-agents/__tests__/session-reconnect.test
 *
 * Tests for the eager-stream-open helper + history+live dedup iterator.
 *
 * Skill §7 ("subscribe before you send") requires the live SSE stream to
 * be opened BEFORE we post the kickoff `user.message`, otherwise we can
 * miss the earliest events. The previous async-generator approach
 * deferred the actual stream() call until the first iteration — this
 * test pins the contract: `events.stream` must be invoked synchronously
 * by `openSessionStream`, before any iteration begins.
 *
 * The dedup iterator (`iterateSessionEvents`) covers:
 *   - dedup by event id across history and live phases
 *   - terminal short-circuit when history already contains end_turn
 *   - terminal gate firing even on a duplicated terminal event
 */
import { describe, it, expect, vi } from "vitest";

import {
  iterateSessionEvents,
  openSessionStream,
} from "../session-reconnect";

import {
  agentMessageTextEvent,
  statusIdleEvent,
} from "./fixtures/events";

function fakeClient(history: unknown[], live: unknown[]) {
  const stream = vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      for (const e of live) yield e;
    },
  }));
  const list = vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      for (const e of history) yield e;
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

describe("openSessionStream", () => {
  it("invokes events.stream synchronously, before any iteration", () => {
    const { client, stream } = fakeClient([], []);
    const handle = openSessionStream(client, "sess_1");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledWith("sess_1");
    expect(handle).toBeDefined();
  });
});

describe("iterateSessionEvents", () => {
  it("does not yield the same event id twice", async () => {
    const shared = agentMessageTextEvent("evt_1", "hello");
    const { client } = fakeClient(
      [shared],
      [
        shared,
        agentMessageTextEvent("evt_2", "world"),
        statusIdleEvent("evt_idle", "end_turn"),
      ],
    );
    const handle = openSessionStream(client, "sess_1");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1", handle)) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_1", "evt_2", "evt_idle"]);
  });

  it("short-circuits the live stream when history contains a terminal event", async () => {
    const historyTerminal = statusIdleEvent("evt_idle", "end_turn");
    const { client } = fakeClient(
      [historyTerminal],
      [agentMessageTextEvent("evt_live", "should not appear")],
    );
    const handle = openSessionStream(client, "sess_1");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1", handle)) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_idle"]);
  });

  it("breaks on terminal event even if it was already yielded from history", async () => {
    const dup = statusIdleEvent("evt_idle", "end_turn");
    const { client } = fakeClient(
      [dup],
      [dup, agentMessageTextEvent("evt_after", "late")],
    );
    const handle = openSessionStream(client, "sess_1");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1", handle)) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_idle"]);
  });
});
