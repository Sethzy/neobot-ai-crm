/**
 * @module lib/managed-agents/__tests__/session-reconnect.test
 *
 * Tests for the eager-stream-open helper + history+live dedup iterator.
 *
 * The helper must satisfy three constraints simultaneously:
 *   1. Skill §7 ("subscribe before you send"): the live SSE stream must
 *      be opened BEFORE we post the kickoff `user.message`, or we can
 *      miss the earliest events on a cold session.
 *   2. `anthropic.beta.sessions.events.stream()` returns
 *      `APIPromise<Stream<...>>` — a Promise, not the iterable — and the
 *      helper must `await` it so callers can `for await...of` the result.
 *   3. Reused sessions: `conversation_threads.session_id` is cached
 *      across chat turns, so turn N>=2's `events.list()` returns every
 *      prior-turn event including prior `status_idle` terminals. The
 *      iterator must skip those so we neither replay prior turn content
 *      nor short-circuit on an old terminal.
 *
 * The dedup iterator (`iterateSessionEvents`) covers:
 *   - skipping every event id present in the pre-kickoff snapshot (the
 *     reused-session guard)
 *   - dedup by event id across history and live phases within the
 *     current turn
 *   - terminal short-circuit only on current-turn terminals
 */
import { describe, it, expect, vi } from "vitest";

import {
  iterateSessionEvents,
  iterateSessionEventsAfter,
  openSessionTail,
  openSessionStream,
} from "../session-reconnect";

import {
  agentMessageTextEvent,
  statusIdleEvent,
} from "./fixtures/events";

/**
 * Build a fake Anthropic client.
 *
 * @param preKickoffHistory  The events that `events.list()` returns at
 *   the instant `openSessionStream` runs — i.e. whatever existed in the
 *   session before the new turn's kickoff was sent. Maps to the
 *   `preKickoffEventIds` snapshot.
 * @param postKickoffHistory The events that `events.list()` returns on
 *   the SECOND call (the one from inside `iterateSessionEvents`).
 *   Represents what history looks like after the kickoff has had a
 *   chance to produce new events. Usually a superset of
 *   `preKickoffHistory` plus the current turn's events, or empty if the
 *   turn is exclusively arriving via the live stream.
 * @param live The events yielded by the live SSE stream.
 *
 * `list` is implemented as a stateful mock so the first call returns
 * `preKickoffHistory` and all subsequent calls return
 * `postKickoffHistory`. Each call returns a FRESH async iterator
 * because async generators can only be iterated once.
 */
function fakeClient(
  preKickoffHistory: unknown[],
  postKickoffHistory: unknown[],
  live: unknown[],
) {
  // `events.stream()` returns `APIPromise<Stream<...>>` in the real SDK
  // — i.e. a Promise resolving to an async iterable. Matching that
  // shape matters: a previous version of this mock returned the
  // iterable directly and let a "handle.live is not async iterable"
  // regression slip through.
  const stream = vi.fn(() =>
    Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        for (const e of live) yield e;
      },
    }),
  );

  let listCallCount = 0;
  const list = vi.fn(() => {
    const isFirstCall = listCallCount === 0;
    listCallCount += 1;
    const events = isFirstCall ? preKickoffHistory : postKickoffHistory;
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const e of events) yield e;
      },
    };
  });

  return {
    client: {
      beta: { sessions: { events: { stream, list } } },
    } as never,
    stream,
    list,
  };
}

describe("openSessionStream", () => {
  it("invokes events.stream synchronously in the async body, before any await resolves", async () => {
    const { client, stream, list } = fakeClient([], [], []);
    // Call without awaiting first — the async function body runs up to
    // its first await, which means `events.stream(sessionId)` fires
    // synchronously. Skill §7 relies on this: the fetch must be
    // in-flight before the runner posts the kickoff.
    const handlePromise = openSessionStream(client, "sess_1");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledWith(
      "sess_1",
      undefined,
      expect.objectContaining({
        maxRetries: 0,
      }),
    );
    expect(list).toHaveBeenCalledWith(
      "sess_1",
      undefined,
      expect.objectContaining({
        maxRetries: 0,
      }),
    );
    const handle = await handlePromise;
    expect(handle.live).toBeDefined();
    // Regression guard for "handle.live is not async iterable": the
    // awaited handle's `live` must actually be iterable with `for await`.
    expect(
      (handle.live as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator],
    ).toBeTypeOf("function");
  });

  it("snapshots every pre-kickoff event id into preKickoffEventIds", async () => {
    const priorTurnEvents = [
      agentMessageTextEvent("evt_prior_1", "prior text"),
      statusIdleEvent("evt_prior_idle", "end_turn"),
    ];
    const { client } = fakeClient(priorTurnEvents, [], []);
    const handle = await openSessionStream(client, "sess_reused");
    expect(Array.from(handle.preKickoffEventIds).sort()).toEqual([
      "evt_prior_1",
      "evt_prior_idle",
    ]);
  });
});

describe("openSessionTail", () => {
  it("captures only the latest pre-kickoff event id", async () => {
    const stream = vi.fn(() =>
      Promise.resolve({
        [Symbol.asyncIterator]: async function* () {},
      }),
    );
    const list = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "evt_latest" }],
      }),
    );

    const client = {
      beta: { sessions: { events: { stream, list } } },
    } as never;

    const handle = await openSessionTail(client, "sess_reused");

    expect(list).toHaveBeenCalledWith(
      "sess_reused",
      { order: "desc", limit: 1 },
      expect.objectContaining({
        maxRetries: 0,
      }),
    );
    expect(handle.afterId).toBe("evt_latest");
  });
});

describe("iterateSessionEvents", () => {
  it("yields every new event once across history and live", async () => {
    // Fresh session: no pre-kickoff history. History call inside the
    // iterator returns the first half of the turn's events, live stream
    // delivers the rest. Iterator should yield each exactly once.
    const { client } = fakeClient(
      [],
      [agentMessageTextEvent("evt_1", "hello")],
      [
        agentMessageTextEvent("evt_1", "hello"), // dup — already seen from history
        agentMessageTextEvent("evt_2", "world"),
        statusIdleEvent("evt_idle", "end_turn"),
      ],
    );
    const handle = await openSessionStream(client, "sess_fresh");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_fresh", handle)) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_1", "evt_2", "evt_idle"]);
  });

  it("skips prior-turn events on a reused session and does NOT terminal-short-circuit on their status_idle", async () => {
    // Regression test for the reused-session replay bug:
    //   1. Turn 1 ran on this session earlier — its events (including an
    //      `end_turn` status_idle) are still in history.
    //   2. Turn 2 kicks off. `openSessionStream` must snapshot turn 1's
    //      event ids and the iterator must skip them entirely — neither
    //      yielding them (which would replay turn 1's content as turn 2)
    //      nor terminal-short-circuiting on turn 1's status_idle (which
    //      would never process turn 2 at all).
    //
    // Before the fix, both failures occurred: iterateSessionEvents
    // yielded turn 1's events and broke on their terminal, leaving the
    // runner to persist turn 1's assistant row a SECOND time — which
    // hit the ON CONFLICT DO UPDATE path and got rejected by RLS on
    // `conversation_messages` (no UPDATE policy).
    const turn1 = [
      agentMessageTextEvent("evt_t1_msg", "turn-1 reply"),
      statusIdleEvent("evt_t1_idle", "end_turn"),
    ];
    const turn2 = [
      agentMessageTextEvent("evt_t2_msg", "turn-2 reply"),
      statusIdleEvent("evt_t2_idle", "end_turn"),
    ];
    const { client } = fakeClient(
      turn1, // pre-kickoff snapshot — captured before turn 2's kickoff fires
      [...turn1, ...turn2], // post-kickoff history — turn 2 events have landed
      [], // no new live events (history drain catches everything)
    );
    const handle = await openSessionStream(client, "sess_reused");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_reused", handle)) {
      seen.push((e as { id: string }).id);
    }
    // Exactly turn 2's events, in order. Zero events from turn 1.
    expect(seen).toEqual(["evt_t2_msg", "evt_t2_idle"]);
  });

  it("short-circuits history iteration when the current turn's terminal arrives in history", async () => {
    // Turn 2 has already finalized by the time the iterator drains
    // history — the current turn's status_idle is in the post-kickoff
    // history call. The iterator should stop there and skip the live
    // stream entirely. (If there were prior turns in the pre-kickoff
    // snapshot, those would be skipped — this test uses a fresh session
    // so the snapshot is empty.)
    const { client } = fakeClient(
      [],
      [statusIdleEvent("evt_idle", "end_turn")],
      [agentMessageTextEvent("evt_live", "should not appear")],
    );
    const handle = await openSessionStream(client, "sess_fresh");
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_fresh", handle)) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_idle"]);
  });
});

describe("iterateSessionEventsAfter", () => {
  it("can consume the already-open live stream directly on fresh sessions", async () => {
    const list = vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield agentMessageTextEvent("evt_history", "should be skipped");
      },
    }));

    const client = {
      beta: { sessions: { events: { list } } },
    } as never;

    const handle = {
      live: {
        [Symbol.asyncIterator]: async function* () {
          yield agentMessageTextEvent("evt_live", "hello");
          yield statusIdleEvent("evt_idle", "end_turn");
        },
      },
      afterId: null,
    };

    const seen: string[] = [];
    for await (const event of iterateSessionEventsAfter(
      client,
      "sess_fresh",
      handle,
      { preferLiveOnly: true },
    )) {
      seen.push((event as { id: string }).id);
    }

    expect(list).not.toHaveBeenCalled();
    expect(seen).toEqual(["evt_live", "evt_idle"]);
  });

  it("does not drain history when preferLiveOnly is true on a reused session", async () => {
    const list = vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield agentMessageTextEvent("evt_history", "should not be read");
      },
    }));

    const client = {
      beta: { sessions: { events: { list } } },
    } as never;

    const handle = {
      live: {
        [Symbol.asyncIterator]: async function* () {
          yield agentMessageTextEvent("evt_live", "hello");
          yield statusIdleEvent("evt_idle", "end_turn");
        },
      },
      afterId: "evt_prev",
    };

    const seen: string[] = [];
    for await (const event of iterateSessionEventsAfter(
      client,
      "sess_reused",
      handle,
      { preferLiveOnly: true },
    )) {
      seen.push((event as { id: string }).id);
    }

    expect(list).not.toHaveBeenCalled();
    expect(seen).toEqual(["evt_live", "evt_idle"]);
  });

  it("skips events up to and including the cursor, yields the rest", async () => {
    const list = vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        // The cursor event and everything before it should be skipped
        yield agentMessageTextEvent("evt_1", "hello");
        yield agentMessageTextEvent("evt_2", "world");
        yield statusIdleEvent("evt_idle", "end_turn");
      },
    }));

    const client = {
      beta: { sessions: { events: { list } } },
    } as never;

    const handle = {
      live: {
        [Symbol.asyncIterator]: async function* () {},
      },
      afterId: "evt_1",
    };

    const seen: string[] = [];
    for await (const event of iterateSessionEventsAfter(
      client,
      "sess_reused",
      handle,
    )) {
      seen.push((event as { id: string }).id);
    }

    // after_id is no longer sent to the API — client-side skip instead
    expect(list).toHaveBeenCalledWith(
      "sess_reused",
      undefined,
      expect.objectContaining({
        maxRetries: 0,
      }),
    );
    expect(seen).toEqual(["evt_2", "evt_idle"]);
  });
});
