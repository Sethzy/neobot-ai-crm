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
  ChatPanel: ({ chatId, autoResume, initialPrompt }: { chatId: string; autoResume?: boolean; initialPrompt?: string }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="auto-resume">{String(autoResume)}</div>
      {initialPrompt ? <div data-testid="initial-prompt">{initialPrompt}</div> : null}
    </div>
  ),
}));

describe("ChatDraftPage", () => {
  it("renders chat panel with autoResume disabled", () => {
    render(<ChatDraftPage id="thread-draft" />);

    expect(screen.getByTestId("chat-id")).toHaveTextContent("thread-draft");
    expect(screen.getByTestId("auto-resume")).toHaveTextContent("false");
  });
});
