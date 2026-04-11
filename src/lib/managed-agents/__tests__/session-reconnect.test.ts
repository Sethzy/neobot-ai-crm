/**
 * @module lib/managed-agents/__tests__/session-reconnect.test
 *
 * Tests for the history+live reconnect helper. Covers:
 *   - dedup by event id across history and live phases
 *   - terminal short-circuit when history already contains end_turn
 *   - terminal gate firing even on a duplicated terminal event
 */
import { describe, it, expect, vi } from "vitest";

import { iterateSessionEvents } from "../session-reconnect";

import {
  agentMessageTextEvent,
  statusIdleEvent,
} from "./fixtures/events";

function fakeClient(history: unknown[], live: unknown[]) {
  return {
    beta: {
      sessions: {
        events: {
          stream: vi.fn(() => ({
            [Symbol.asyncIterator]: async function* () {
              for (const e of live) yield e;
            },
          })),
          list: vi.fn(() => ({
            [Symbol.asyncIterator]: async function* () {
              for (const e of history) yield e;
            },
          })),
        },
      },
    },
  } as never;
}

describe("iterateSessionEvents", () => {
  it("does not yield the same event id twice", async () => {
    const shared = agentMessageTextEvent("evt_1", "hello");
    const client = fakeClient(
      [shared],
      [
        shared,
        agentMessageTextEvent("evt_2", "world"),
        statusIdleEvent("evt_idle", "end_turn"),
      ],
    );
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1")) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_1", "evt_2", "evt_idle"]);
  });

  it("short-circuits the live stream when history contains a terminal event", async () => {
    const historyTerminal = statusIdleEvent("evt_idle", "end_turn");
    const client = fakeClient(
      [historyTerminal],
      [agentMessageTextEvent("evt_live", "should not appear")],
    );
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1")) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_idle"]);
  });

  it("breaks on terminal event even if it was already yielded from history", async () => {
    const dup = statusIdleEvent("evt_idle", "end_turn");
    const client = fakeClient(
      [dup],
      [dup, agentMessageTextEvent("evt_after", "late")],
    );
    const seen: string[] = [];
    for await (const e of iterateSessionEvents(client, "sess_1")) {
      seen.push((e as { id: string }).id);
    }
    expect(seen).toEqual(["evt_idle"]);
  });
});
