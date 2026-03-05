/**
 * Tests for chat panel streaming + persistence wiring.
 * @module components/chat/chat-panel.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./chat-panel";

const { mockTransportConstructor } = vi.hoisted(() => ({
  mockTransportConstructor: vi.fn(),
}));
const { mockSetDataStream } = vi.hoisted(() => ({
  mockSetDataStream: vi.fn(),
}));

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

    constructor(options: { api?: string; prepareSendMessagesRequest?: unknown }) {
      mockTransportConstructor(options);
      this.api = options.api;
      Object.assign(this, options);
    }
  },
}));

const mockUseChat = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("./data-stream-provider", () => ({
  useDataStream: () => ({
    dataStream: [],
    setDataStream: mockSetDataStream,
  }),
}));

describe("ChatPanel", () => {
  const sendMessage = vi.fn(async () => {});
  const setMessages = vi.fn();

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
  });

  it("configures useChat with explicit transport and server-loaded initialMessages", () => {
    const initialMessages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "Loaded from server" }] },
    ] as UIMessage[];
    render(<ChatPanel chatId="thread-1" initialMessages={initialMessages} />);

    const options = mockUseChat.mock.calls[0][0] as {
      id: string;
      messages: UIMessage[];
      transport: { api?: string };
    };
    expect(options.id).toBe("thread-1");
    expect(options.messages).toEqual(initialMessages);
    expect(options.transport).toEqual(expect.objectContaining({ api: "/api/chat" }));
  });

  it("configures transport with prepareSendMessagesRequest", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockTransportConstructor.mock.calls[0][0] as {
      api: string;
      prepareSendMessagesRequest?: unknown;
    };
    expect(options.api).toBe("/api/chat");
    expect(typeof options.prepareSendMessagesRequest).toBe("function");
  });

  it("prepareSendMessagesRequest sends only last user message for normal sends", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockTransportConstructor.mock.calls[0][0] as {
      prepareSendMessagesRequest: (payload: { id: string; messages: UIMessage[] }) => {
        body: Record<string, unknown>;
      };
    };

    const result = options.prepareSendMessagesRequest({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] } as UIMessage,
      ],
    });

    expect(result.body.id).toBe("thread-1");
    expect(result.body.message).toEqual({
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    });
    expect(result.body.messages).toBeUndefined();
  });

  it("prepareSendMessagesRequest sends full messages for approval continuation", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockTransportConstructor.mock.calls[0][0] as {
      prepareSendMessagesRequest: (payload: { id: string; messages: UIMessage[] }) => {
        body: Record<string, unknown>;
      };
    };

    const continuationMessages = [
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "tool-call", toolCallId: "t1", toolName: "write_file", args: {} }],
      },
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Approve it" }, { type: "tool-write_file", state: "approval-responded" }],
      },
    ] as UIMessage[];

    const result = options.prepareSendMessagesRequest({
      id: "thread-1",
      messages: continuationMessages,
    });

    expect(result.body.id).toBe("thread-1");
    expect(result.body.messages).toEqual(continuationMessages);
    expect(result.body.message).toBeUndefined();
  });

  it("appends incoming stream data parts to data stream context", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onData?: (data: unknown) => void;
    };

    options.onData?.({
      type: "data-chat-title",
      data: "Generated title",
    });

    expect(mockSetDataStream).toHaveBeenCalledTimes(1);
  });

  it("sends trimmed text via sendMessage", async () => {
    const user = userEvent.setup();

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "  Hello there  ");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "Hello there" });
    });

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue("");
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

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop/i })).toBeDisabled();
  });

  it("calls onAutoName with first user message text on first completion", async () => {
    const onAutoName = vi.fn();
    render(<ChatPanel chatId="thread-1" onAutoName={onAutoName} />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: (payload: { messages: UIMessage[] }) => Promise<void> | void;
    };

    await options.onFinish?.({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "What are my deals?" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Here they are." }] },
      ] as UIMessage[],
    });

    expect(onAutoName).toHaveBeenCalledWith("What are my deals?");
  });

  it("does not auto-name an existing thread that already has user messages", async () => {
    const onAutoName = vi.fn();
    const initialMessages = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "Existing first message" }] },
      { id: "a0", role: "assistant", parts: [{ type: "text", text: "Existing answer" }] },
    ] as UIMessage[];

    render(<ChatPanel chatId="thread-1" onAutoName={onAutoName} initialMessages={initialMessages} />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: (payload: { messages: UIMessage[] }) => Promise<void> | void;
    };

    await options.onFinish?.({
      messages: [
        ...initialMessages,
        { id: "u1", role: "user", parts: [{ type: "text", text: "Follow up" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Reply" }] },
      ] as UIMessage[],
    });

    expect(onAutoName).not.toHaveBeenCalled();
  });

  it("does not call onAutoName on subsequent completions", async () => {
    const onAutoName = vi.fn();
    render(<ChatPanel chatId="thread-1" onAutoName={onAutoName} />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: (payload: { messages: UIMessage[] }) => Promise<void> | void;
    };

    // First completion
    await options.onFinish?.({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "First msg" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Reply" }] },
      ] as UIMessage[],
    });

    onAutoName.mockClear();

    // Second completion
    await options.onFinish?.({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "First msg" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Reply" }] },
        { id: "u2", role: "user", parts: [{ type: "text", text: "Second msg" }] },
        { id: "a2", role: "assistant", parts: [{ type: "text", text: "Reply 2" }] },
      ] as UIMessage[],
    });

    expect(onAutoName).not.toHaveBeenCalled();
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

  it("uses MessageList as the single empty-state source and does not render suggestion chips", () => {
    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
    expect(screen.queryByText("Brief me on today's tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Check my deal pipeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Draft a follow-up email")).not.toBeInTheDocument();
    expect(screen.queryByText("Summarize my recent contacts")).not.toBeInTheDocument();
  });

  it("does not render empty-state copy when messages exist", () => {
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      ],
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

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.queryByText(/start a conversation/i)).not.toBeInTheDocument();
  });

  it("pushes /chat/{id} before sending from the draft route", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    window.history.replaceState({}, "", "/chat");

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "Hello from draft");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/chat/thread-1");
      expect(sendMessage).toHaveBeenCalledWith({ text: "Hello from draft" });
    });

    pushStateSpy.mockRestore();
  });
});
