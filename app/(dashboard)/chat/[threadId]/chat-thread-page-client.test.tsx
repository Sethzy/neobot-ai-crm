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
    autoResume,
    initialQuota,
    initialChatModel,
  }: {
    chatId: string;
    initialMessages: UIMessage[];
    autoResume?: boolean;
    initialQuota?: { messagesRemaining: number } | null;
    initialChatModel?: string;
  }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="initial-message-count">{initialMessages.length}</div>
      <div data-testid="auto-resume">{String(autoResume)}</div>
      <div data-testid="quota-remaining">{String(initialQuota?.messagesRemaining ?? "none")}</div>
      <div data-testid="initial-chat-model">{initialChatModel ?? "none"}</div>
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
        initialQuota={{
          clientId: "client-1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 20,
          messagesRemaining: 80,
          periodStart: "2026-03-01",
          nextResetDate: "2026-04-01",
        }}
        initialChatModel="minimax/minimax-m2.7"
      />,
    );

    expect(screen.getByTestId("chat-id")).toHaveTextContent("thread-abc");
    expect(screen.getByTestId("initial-message-count")).toHaveTextContent("1");
    expect(screen.getByTestId("auto-resume")).toHaveTextContent("true");
    expect(screen.getByTestId("quota-remaining")).toHaveTextContent("80");
    expect(screen.getByTestId("initial-chat-model")).toHaveTextContent("minimax/minimax-m2.7");
  });
});
