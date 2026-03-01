/**
 * Tests for shared chat and thread types.
 * @module types/chat.test
 */
import { describe, expect, it } from "vitest";

import { CHAT_STATUSES, type ChatStatus, type Thread } from "./chat";

describe("chat types", () => {
  it("defines the thread structure", () => {
    const thread: Thread = {
      id: "thread-1",
      title: "New Chat",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    };

    expect(thread.id).toBe("thread-1");
    expect(thread.title).toBe("New Chat");
    expect(thread.createdAt).toBeInstanceOf(Date);
  });

  it("exposes chat statuses in SDK order", () => {
    expect(CHAT_STATUSES).toEqual(["ready", "submitted", "streaming", "error"]);
  });

  it("accepts valid chat statuses", () => {
    const statuses: ChatStatus[] = ["ready", "submitted", "streaming", "error"];
    expect(statuses).toHaveLength(4);
  });
});
