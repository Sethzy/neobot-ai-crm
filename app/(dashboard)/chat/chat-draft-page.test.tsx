/**
 * Tests for chat draft client wrapper.
 * @module app/(dashboard)/chat/chat-draft-page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatDraftPage } from "./chat-draft-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({ chatId, autoResume, initialPrompt, initialQuota }: { chatId: string; autoResume?: boolean; initialPrompt?: string; initialQuota?: { messagesRemaining: number } | null }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="auto-resume">{String(autoResume)}</div>
      <div data-testid="quota-remaining">{String(initialQuota?.messagesRemaining ?? "none")}</div>
      {initialPrompt ? <div data-testid="initial-prompt">{initialPrompt}</div> : null}
    </div>
  ),
}));

describe("ChatDraftPage", () => {
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
      />,
    );

    expect(screen.getByTestId("chat-id")).toHaveTextContent("thread-draft");
    expect(screen.getByTestId("auto-resume")).toHaveTextContent("false");
    expect(screen.getByTestId("quota-remaining")).toHaveTextContent("80");
  });
});
