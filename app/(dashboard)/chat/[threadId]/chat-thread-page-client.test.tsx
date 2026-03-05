/**
 * Tests for the chat thread page client wrapper.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client.test
 */
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import { ChatThreadPageClient } from "./chat-thread-page-client";

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({
    chatId,
    initialMessages,
  }: {
    chatId: string;
    initialMessages: UIMessage[];
  }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="initial-message-count">{initialMessages.length}</div>
    </div>
  ),
}));

describe("ChatThreadPageClient", () => {
  it("renders ChatPanel with server-loaded initialMessages", () => {
    const initialMessages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "Loaded from server" }] },
    ] as UIMessage[];

    render(
      <ChatThreadPageClient
        threadId="thread-abc"
        initialMessages={initialMessages}
      />,
    );

    expect(screen.getByTestId("chat-id")).toHaveTextContent("thread-abc");
    expect(screen.getByTestId("initial-message-count")).toHaveTextContent("1");
  });
});
