/**
 * Tests for chat panel streaming + persistence wiring.
 * @module components/chat/chat-panel.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
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

vi.mock("ai", () => ({
  DefaultChatTransport: class {
    api: string | undefined;

    constructor(options: { api?: string }) {
      this.api = options.api;
    }
  },
}));

const mockUseChat = vi.fn();
const mockUseChatMessages = vi.fn();
const mockUseSaveMessages = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

vi.mock("@/hooks/use-chat-messages", () => ({
  useChatMessages: (...args: unknown[]) => mockUseChatMessages(...args),
  useSaveMessages: (...args: unknown[]) => mockUseSaveMessages(...args),
}));

describe("ChatPanel", () => {
  const sendMessage = vi.fn(async () => {});
  const setMessages = vi.fn();
  const saveMessages = vi.fn(async () => []);

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "ready",
      error: undefined,
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    mockUseChatMessages.mockReturnValue({
      data: [],
      isLoading: false,
    });

    mockUseSaveMessages.mockReturnValue({
      mutateAsync: saveMessages,
    });
  });

  it("configures useChat with explicit transport", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      id: string;
      transport: { api?: string };
    };
    expect(options.id).toBe("thread-1");
    expect(options.transport).toEqual(expect.objectContaining({ api: "/api/chat" }));
  });

  it("loads persisted database messages into the chat state", async () => {
    const dbRows = [
      {
        message_id: "message-1",
        thread_id: "thread-1",
        role: "assistant",
        content: "Loaded from DB",
        parts: [{ type: "text", text: "Loaded from DB" }],
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    mockUseChatMessages.mockReturnValue({
      data: dbRows,
      isLoading: false,
    });

    render(<ChatPanel chatId="thread-1" />);

    await waitFor(() =>
      expect(setMessages).toHaveBeenCalledWith([
        {
          id: "message-1",
          role: "assistant",
          parts: [{ type: "text", text: "Loaded from DB" }],
        },
      ]),
    );
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

  it("persists new messages after the assistant finishes streaming", async () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: (payload: { messages: UIMessage[] }) => Promise<void> | void;
    };

    const streamedMessages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello there" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hi! How can I help?" }],
      },
    ] as UIMessage[];

    await options.onFinish?.({ messages: streamedMessages });

    await waitFor(() => {
      expect(saveMessages).toHaveBeenCalledWith([
        {
          role: "user",
          content: "Hello there",
          parts: [{ type: "text", text: "Hello there" }],
        },
        {
          role: "assistant",
          content: "Hi! How can I help?",
          parts: [{ type: "text", text: "Hi! How can I help?" }],
        },
      ]);
    });
  });

  it("disables composer while submitted or streaming", () => {
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "streaming",
      error: undefined,
      sendMessage,
      setMessages,
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
      setMessages,
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
