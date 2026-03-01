/**
 * Tests for the main chat panel wiring.
 * @module components/chat/chat-panel.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./chat-panel";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-scroll-to-bottom", () => ({
  useScrollToBottom: () => ({
    containerRef: { current: null },
    endRef: { current: null },
    isAtBottom: true,
    scrollToBottom: vi.fn(),
  }),
}));

const mockUseChat = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

describe("ChatPanel", () => {
  const sendMessage = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "ready",
      error: undefined,
      sendMessage,
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });
  });

  it("renders list empty state and composer", () => {
    render(<ChatPanel chatId="thread-1" />);

    expect(mockUseChat).toHaveBeenCalledWith({ id: "thread-1", api: "/api/chat" });
    expect(screen.getByTestId("empty-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it("sends trimmed text via sendMessage", async () => {
    const user = userEvent.setup();

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/type a message/i), "  Hello there  ");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "Hello there" });
    });

    expect(screen.getByPlaceholderText(/type a message/i)).toHaveValue("");
  });

  it("disables composer while submitted or streaming", () => {
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "streaming",
      error: undefined,
      sendMessage,
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByPlaceholderText(/type a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("renders API errors", () => {
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "error",
      error: new Error("Gateway timeout"),
      sendMessage,
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText(/gateway timeout/i)).toBeInTheDocument();
  });
});
