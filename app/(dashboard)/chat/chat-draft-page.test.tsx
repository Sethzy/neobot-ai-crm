/**
 * Tests for chat draft client wrapper.
 * @module app/(dashboard)/chat/chat-draft-page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatDraftPage } from "./chat-draft-page";

const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({ chatId, autoResume, initialPrompt, autoSubmitInitialPrompt, initialQuota, initialChatModel }: { chatId: string; autoResume?: boolean; initialPrompt?: string; autoSubmitInitialPrompt?: boolean; initialQuota?: { messagesRemaining: number } | null; initialChatModel?: string }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="auto-resume">{String(autoResume)}</div>
      <div data-testid="auto-submit-initial-prompt">{String(autoSubmitInitialPrompt)}</div>
      <div data-testid="quota-remaining">{String(initialQuota?.messagesRemaining ?? "none")}</div>
      <div data-testid="initial-chat-model">{initialChatModel ?? "none"}</div>
      {initialPrompt ? <div data-testid="initial-prompt">{initialPrompt}</div> : null}
    </div>
  ),
}));

describe("ChatDraftPage", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("renders chat panel with autoResume disabled", () => {
    render(
      <ChatDraftPage
        id="thread-draft"
        initialQuota={{
          clientId: "client-1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 20,
          messagesRemaining: 80,
          periodStart: "2026-03-01",
          nextResetDate: "2026-04-01",
        }}
        initialChatModel="anthropic/claude-sonnet-4-6"
      />,
    );

    expect(screen.getByTestId("chat-id")).toHaveTextContent("thread-draft");
    expect(screen.getByTestId("auto-resume")).toHaveTextContent("false");
    expect(screen.getByTestId("auto-submit-initial-prompt")).toHaveTextContent("false");
    expect(screen.getByTestId("quota-remaining")).toHaveTextContent("80");
    expect(screen.getByTestId("initial-chat-model")).toHaveTextContent("anthropic/claude-sonnet-4-6");
  });

  it("passes prompt and autosubmit query params through to ChatPanel", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("prompt=Create+an+automation%3A+daily+briefing&autosubmit=1"),
    );

    render(
      <ChatDraftPage
        id="thread-draft"
        initialQuota={null}
        initialChatModel="anthropic/claude-sonnet-4-6"
      />,
    );

    expect(screen.getByTestId("initial-prompt")).toHaveTextContent(
      "Create an automation: daily briefing",
    );
    expect(screen.getByTestId("auto-submit-initial-prompt")).toHaveTextContent("true");
  });
});
