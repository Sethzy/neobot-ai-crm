/**
 * Tests for the chat thread client wrapper.
 * @module app/(dashboard)/chat/[threadId]/chat-thread-page-client.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatThreadPageClient } from "./chat-thread-page-client";

const mockUpdateThreadTitle = vi.fn();
const mockGenerateThreadTitle = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    updateThreadTitle: (...args: unknown[]) => mockUpdateThreadTitle(...args),
  }),
}));

vi.mock("@/lib/chat/thread-title", () => ({
  generateThreadTitle: (...args: unknown[]) => mockGenerateThreadTitle(...args),
}));

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({
    chatId,
    onAutoName,
    initialMessages,
    initialMessage,
    onCanonicalThreadId,
  }: {
    chatId: string;
    onAutoName?: (message: string) => void;
    initialMessages: UIMessage[];
    initialMessage?: string;
    onCanonicalThreadId?: (threadId: string) => void;
  }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="initial-message-count">{initialMessages.length}</div>
      <div data-testid="initial-message">{initialMessage ?? ""}</div>
      <button type="button" onClick={() => onAutoName?.("hello from user")}>
        trigger-auto-name
      </button>
      <button type="button" onClick={() => onCanonicalThreadId?.("thread-canonical")}>
        trigger-canonical-thread-id
      </button>
    </div>
  ),
}));

describe("ChatThreadPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateThreadTitle.mockReturnValue("Hello from user");
  });

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

  it("auto-names thread from first user message", async () => {
    const user = userEvent.setup();
    render(<ChatThreadPageClient threadId="thread-abc" initialMessages={[]} />);

    await user.click(screen.getByRole("button", { name: /trigger-auto-name/i }));

    expect(mockGenerateThreadTitle).toHaveBeenCalledWith("hello from user");
    expect(mockUpdateThreadTitle).toHaveBeenCalledWith("thread-abc", "Hello from user");
  });

  it("passes and consumes initial draft message handoff for empty threads", () => {
    sessionStorage.setItem("initial_msg_thread-abc", "Draft handoff message");

    render(<ChatThreadPageClient threadId="thread-abc" initialMessages={[]} />);

    expect(screen.getByTestId("initial-message")).toHaveTextContent("Draft handoff message");
    expect(sessionStorage.getItem("initial_msg_thread-abc")).toBeNull();
  });

  it("does not pass draft handoff when initial messages already exist", () => {
    sessionStorage.setItem("initial_msg_thread-abc", "Draft handoff message");
    const initialMessages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "Loaded from server" }] },
    ] as UIMessage[];

    render(<ChatThreadPageClient threadId="thread-abc" initialMessages={initialMessages} />);

    expect(screen.getByTestId("initial-message")).toHaveTextContent("");
    expect(sessionStorage.getItem("initial_msg_thread-abc")).toBeNull();
  });

  it("replaces URL when canonical thread id differs", async () => {
    const user = userEvent.setup();

    render(<ChatThreadPageClient threadId="thread-draft" initialMessages={[]} />);
    await user.click(screen.getByRole("button", { name: /trigger-canonical-thread-id/i }));

    expect(mockReplace).toHaveBeenCalledWith("/chat/thread-canonical");
  });
});
