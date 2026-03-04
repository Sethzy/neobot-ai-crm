/**
 * Tests for chat transport request shaping.
 * @module components/chat/chat-transport.test
 */
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { prepareChatSendMessagesRequest } from "./chat-transport";

describe("prepareChatSendMessagesRequest", () => {
  it("sends only the latest message payload for submit-message trigger", async () => {
    const messages = [
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "How can I help?" }] },
      { id: "u1", role: "user", parts: [{ type: "text", text: "Show my pipeline." }] },
    ] as UIMessage[];

    const prepared = await prepareChatSendMessagesRequest({
      api: "/api/chat",
      id: "thread-123",
      messages,
      trigger: "submit-message",
      messageId: undefined,
      body: {},
      headers: {},
      credentials: undefined,
      requestMetadata: undefined,
    });

    expect(prepared.body).toEqual({
      id: "thread-123",
      trigger: "submit-message",
      messageId: undefined,
      message: messages[1],
    });
  });

  it("sends full messages payload for regenerate-message trigger", async () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Draft response." }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Draft answer." }] },
    ] as UIMessage[];

    const prepared = await prepareChatSendMessagesRequest({
      api: "/api/chat",
      id: "thread-123",
      messages,
      trigger: "regenerate-message",
      messageId: "a1",
      body: {},
      headers: {},
      credentials: undefined,
      requestMetadata: undefined,
    });

    expect(prepared.body).toEqual({
      id: "thread-123",
      trigger: "regenerate-message",
      messageId: "a1",
      messages,
    });
  });
});
