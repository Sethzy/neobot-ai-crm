/**
 * Stream + events.list reconnect helper per Anthropic skill §1 + §7.
 *
 * The hard requirement: the live SSE stream must be subscribed BEFORE any
 * `user.message` is sent, otherwise we can miss the earliest events
 * (skill §7, "subscribe before you send"). Two sharp edges to avoid:
 *
 *   1. An `async function*` generator defers its body until the first
 *      `for await` step, so wrapping `events.stream(...)` in one means
 *      the real call fires AFTER the kickoff send — lost earliest events.
 *   2. `anthropic.beta.sessions.events.stream(sessionId)` does NOT return
 *      the iterable directly. It returns `APIPromise<Stream<...>>` — a
 *      Promise that resolves to the async-iterable stream once the SSE
 *      response headers have been received. You cannot `for await (x of
 *      promise)` — `for await` does not await its right-hand side, so it
 *      throws "X is not async iterable" synchronously.
 *
 * Third sharp edge (reused sessions): `conversation_threads.session_id`
 * is cached across turns, so on turn 2 of the same thread `events.list`
 * returns every event from prior turns, including prior `status_idle`
 * terminals. A naive "drain history, short-circuit on terminal" iterator
 * replays turn 1's events for turn 2 and collides on the same
 * `source_event_id` when persisting — which manifests as a duplicated
 * assistant reply plus an RLS UPDATE-denial on `conversation_messages`.
 *
 * So the helper is split into:
 *   1. `openSessionStream(client, sessionId)` — async. In parallel it
 *      (a) opens the live SSE stream via `events.stream()` and (b)
 *      snapshots every event id currently in `events.list()`. Both fire
 *      BEFORE the runner sends the kickoff. Awaiting the returned
 *      Promise gives a stronger subscribe-before-send guarantee than
 *      just firing the request: headers are received, the stream is
 *      live, and we have a precise "what was pre-kickoff" snapshot.
 *   2. `iterateSessionEvents(client, sessionId, handle)` — async iterator
 *      that drains history first (skipping anything in the pre-kickoff
 *      snapshot so prior turns can't replay), then resumes from the live
 *      handle, deduping by event id and breaking on terminal events that
 *      belong to the current turn.
 *
 * @module lib/managed-agents/session-reconnect
 */
import type Anthropic from "@anthropic-ai/sdk";

import { buildChatAnthropicRequestOptions } from "./chat-request-options";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

interface AnyEvent {
  id: string;
  type: string;
  stop_reason?: { type: string };
}

/**
 * Opaque handle returned by `openSessionStream`. Wraps the resolved live
 * iterable plus the set of event ids that already existed in the session
 * before the kickoff fired — the iterator uses that set to skip prior
 * turns on reused sessions.
 */
export interface LiveStreamHandle {
  live: AsyncIterable<unknown>;
  /**
   * Every event id present in `events.list(sessionId)` at the instant
   * `openSessionStream` was invoked. Empty for a brand-new session.
   * Populated on turn N>=2 of a reused chat thread, where it contains
   * every event from every prior turn.
   */
  preKickoffEventIds: ReadonlySet<string>;
}

/**
 * Opaque handle for "tail from cursor" consumption.
 *
 * `afterId` is the most recent event id that existed when the tail was
 * opened. Consumers drain `events.list()` first, skipping every event up
 * to and including that cursor id, then resume from the already-open
 * live handle.
 */
export interface SessionTailHandle {
  live: AsyncIterable<unknown>;
  afterId: string | null;
}

function isTerminal(event: AnyEvent): boolean {
  if (event.type === "session.status_terminated") return true;
  if (event.type === "session.status_idle") {
    const reason = event.stop_reason?.type;
    // NOTE: requires_action is intentionally NOT terminal here. The session
    // goes idle with requires_action when waiting for a custom tool result
    // or tool confirmation. The runner handles these mid-loop — it dispatches
    // the tool and sends the result back, then the session resumes. If the
    // iterator stopped here, the runner would exit before the session finishes.
    // The runner's translator-level terminal check handles the case where
    // requires_action should actually end the loop (e.g. approval pauses).
    return reason === "end_turn" || reason === "retries_exhausted";
  }
  return false;
}

function buildRequestOptions(
  signal?: AbortSignal,
): ReturnType<typeof buildChatAnthropicRequestOptions> {
  return buildChatAnthropicRequestOptions(signal);
}

async function getLatestSessionEventId(
  anthropic: Anthropic,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const page = await anthropic.beta.sessions.events.list(
    sessionId,
    { order: "desc", limit: 1 },
    buildRequestOptions(signal),
  );

  if (
    typeof page === "object" &&
    page !== null &&
    "data" in page &&
    Array.isArray((page as { data?: unknown }).data)
  ) {
    const latest = (page as { data: Array<{ id?: unknown }> }).data[0];
    return typeof latest?.id === "string" && latest.id.length > 0
      ? latest.id
      : null;
  }

  for await (const event of page as AsyncIterable<unknown>) {
    const latest = event as { id?: unknown };
    return typeof latest.id === "string" && latest.id.length > 0
      ? latest.id
      : null;
  }

  return null;
}

/**
 * Open the live SSE stream for a session AND snapshot the pre-kickoff
 * event ids. Must be awaited BEFORE the runner posts its kickoff
 * `user.message` (skill §7, "subscribe before you send"). The Anthropic
 * SDK's `events.stream()` returns `APIPromise<Stream<...>>`, so we must
 * `await` it to get the iterable — a raw, unawaited call returns a
 * Promise that cannot be used with `for await...of`.
 *
 * Both the stream open and the history snapshot fire in parallel. They
 * must both complete before the caller sends the kickoff so the snapshot
 * is a true "before this turn" baseline.
 */
export async function openSessionStream(
  anthropic: Anthropic,
  sessionId: string,
): Promise<LiveStreamHandle> {
  const tStart = performance.now();
  const logPrefix = `[session-reconnect:${sessionId.slice(-8)}]`;
  // Called synchronously in the async function body — both underlying
  // fetches are in-flight the moment we enter this function, matching
  // the spike pattern at
  // `scripts/spike/managed-agents-custom-tool-spike.ts`.
  const livePromise = anthropic.beta.sessions.events.stream(
    sessionId,
    undefined,
    buildRequestOptions(),
  );
  const snapshotPromise = (async () => {
    const tSnapshotStart = performance.now();
    const ids = new Set<string>();
    for await (const event of anthropic.beta.sessions.events.list(
      sessionId,
      undefined,
      buildRequestOptions(),
    ) as unknown as AsyncIterable<unknown>) {
      const id = (event as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) {
        ids.add(id);
      }
    }
    console.log(`${logPrefix} snapshot drain: ${ids.size} pre-kickoff events in ${Math.round(performance.now() - tSnapshotStart)}ms`);
    return ids;
  })();

  const [live, preKickoffEventIds] = await Promise.all([
    livePromise,
    snapshotPromise,
  ]);

  console.log(`${logPrefix} openSessionStream total: ${Math.round(performance.now() - tStart)}ms (stream + ${preKickoffEventIds.size} snapshot events)`);

  return {
    live: live as unknown as AsyncIterable<unknown>,
    preKickoffEventIds,
  };
}

/**
 * Open a live SSE stream and capture the current latest event id as a
 * cursor. Unlike `openSessionStream`, this helper is safe to use AFTER a
 * send has already happened because callers provide an `afterId` cursor
 * boundary instead of relying on a "pre-kickoff snapshot".
 *
 * When `afterId` is omitted, the helper queries the current latest event
 * id in parallel with opening the live stream. Consumers then drain
 * history and skip through that cursor, which tails from "now" without
 * replaying older history.
 */
export async function openSessionTail(
  anthropic: Anthropic,
  sessionId: string,
  options: {
    afterId?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<SessionTailHandle> {
  const tStart = performance.now();
  const logPrefix = `[session-reconnect:${sessionId.slice(-8)}]`;
  const livePromise = anthropic.beta.sessions.events.stream(
    sessionId,
    undefined,
    buildRequestOptions(options.signal),
  );
  const afterIdPromise =
    options.afterId === undefined
      ? (async () => {
          const tLookupStart = performance.now();
          const afterId = await getLatestSessionEventId(
            anthropic,
            sessionId,
            options.signal,
          );
          console.log(
            `${logPrefix} latest event lookup: ${Math.round(performance.now() - tLookupStart)}ms afterId=${afterId ?? "null"}`,
          );
          return afterId;
        })()
      : Promise.resolve(options.afterId);

  const [live, afterId] = await Promise.all([livePromise, afterIdPromise]);

  console.log(
    `${logPrefix} openSessionTail total: ${Math.round(performance.now() - tStart)}ms afterId=${afterId ?? "null"}`,
  );

  return {
    live: live as unknown as AsyncIterable<unknown>,
    afterId,
  };
}

/**
 * Drain the session history first, then resume from the pre-opened live
 * stream. Yields events in arrival order, deduped by id, skips every
 * pre-kickoff event (so turn N>=2 does not replay prior-turn events), and
 * breaks on terminal events that belong to the current turn (skill §1).
 */
export async function* iterateSessionEvents(
  anthropic: Anthropic,
  sessionId: string,
  handle: LiveStreamHandle,
): AsyncGenerator<AnyEvent> {
  const logPrefix = `[session-reconnect:${sessionId.slice(-8)}]`;
  const tIterateStart = performance.now();
  // Pre-seed `seen` with every event id that existed before we sent the
  // kickoff. Those are prior-turn events on a reused session and must
  // never reach the consumer — yielding them would misattribute old
  // text to the new turn, and terminal-short-circuiting on them would
  // cause the iterator to stop before processing the current turn at
  // all. The current implementation of the loop skips events whose id
  // is already in `seen` entirely (no yield, no terminal check), which
  // is exactly what we want here.
  const seen = new Set<string>(handle.preKickoffEventIds);
  let terminal = false;
  let historyYielded = 0;
  let historySkipped = 0;

  for await (const event of anthropic.beta.sessions.events.list(
    sessionId,
  ) as unknown as AsyncIterable<unknown>) {
    const typed = event as AnyEvent;
    if (seen.has(typed.id)) {
      historySkipped++;
      continue;
    }
    seen.add(typed.id);
    historyYielded++;
    yield typed;
    if (isTerminal(typed)) {
      terminal = true;
      break;
    }
  }
  const tHistoryDone = performance.now();
  console.log(`${logPrefix} history drain: yielded=${historyYielded} skipped=${historySkipped} in ${Math.round(tHistoryDone - tIterateStart)}ms terminal=${terminal}`);
  if (terminal) return;

  let liveYielded = 0;
  for await (const event of handle.live) {
    const typed = event as AnyEvent;
    if (seen.has(typed.id)) continue;
    seen.add(typed.id);
    liveYielded++;
    if (liveYielded === 1) {
      console.log(`${logPrefix} first live event: ${Math.round(performance.now() - tHistoryDone)}ms after history drain`);
    }
    yield typed;
    if (isTerminal(typed)) return;
  }
}

/**
 * Drain events after a known cursor, then continue from an already-open
 * live stream.
 *
 * This is the correct iterator when the caller opens the subscription
 * before a boundary event (for example, before `user.message` send) and
 * wants to consume everything after that boundary without replaying
 * older history.
 */
export async function* iterateSessionEventsAfter(
  anthropic: Anthropic,
  sessionId: string,
  handle: SessionTailHandle,
  options: {
    preferLiveOnly?: boolean;
    signal?: AbortSignal;
    stopOnTerminal?: boolean;
  } = {},
): AsyncGenerator<AnyEvent> {
  const seen = new Set<string>();
  const stopOnTerminal = options.stopOnTerminal ?? true;
  if (options.preferLiveOnly) {
    for await (const event of handle.live) {
      if (options.signal?.aborted) return;

      const typed = event as AnyEvent;
      if (seen.has(typed.id)) continue;

      seen.add(typed.id);
      yield typed;

      if (options.signal?.aborted) return;
      if (stopOnTerminal && isTerminal(typed)) return;
    }

    return;
  }

  // The Anthropic events.list API no longer accepts `after_id`. Valid
  // parameters are `limit`, `order`, `page`. We list all events and
  // skip client-side until we've passed the cursor.
  let pastCursor = handle.afterId === null;

  for await (const event of anthropic.beta.sessions.events.list(
    sessionId,
    undefined,
    buildRequestOptions(options.signal),
  ) as unknown as AsyncIterable<unknown>) {
    if (options.signal?.aborted) return;

    const typed = event as AnyEvent;

    if (!pastCursor) {
      if (typed.id === handle.afterId) {
        pastCursor = true;
      }
      continue;
    }

    if (seen.has(typed.id)) continue;

    seen.add(typed.id);
    yield typed;

    if (options.signal?.aborted) return;
    if (stopOnTerminal && isTerminal(typed)) return;
  }

  for await (const event of handle.live) {
    if (options.signal?.aborted) return;

    const typed = event as AnyEvent;
    if (seen.has(typed.id)) continue;

    seen.add(typed.id);
    yield typed;

    if (options.signal?.aborted) return;
    if (stopOnTerminal && isTerminal(typed)) return;
  }
}

/**
 * Like `iterateSessionEvents` but doesn't exit on terminal states — keeps
 * reopening the SSE subscription until the abort signal fires. Used by the
 * thread-level stream endpoint where "terminal" only means "the current
 * turn is done, wait for the next one".
 *
 * Simpler than the one-turn helper: no history drain, no pre-kickoff
 * snapshot. Just open the live SSE stream, yield events, loop on terminal.
 */
export async function* iterateSessionEventsForever(
  anthropic: Anthropic,
  sessionId: string,
  signal: AbortSignal,
  options: { afterId?: string | null } = {},
): AsyncGenerator<AnyEvent> {
  // When the caller supplies an afterId, tail from that cursor. When
  // absent (undefined), the first iteration passes null → drain ALL
  // history from the session start. This ensures a fresh SSE
  // connection (or reconnect) replays everything the client hasn't
  // seen yet, with the client dedup set filtering duplicates.
  let lastSeenEventId: string | null | undefined =
    options.afterId !== undefined ? options.afterId : null;

  while (!signal.aborted) {
    const handle = await openSessionTail(anthropic, sessionId, {
      afterId: lastSeenEventId,
      signal,
    });

    for await (const event of iterateSessionEventsAfter(
      anthropic,
      sessionId,
      handle,
      {
        signal,
        stopOnTerminal: false,
      },
    )) {
      lastSeenEventId = event.id;
      yield event;
    }
  }
}
