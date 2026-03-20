/**
 * Tests for chat panel streaming + persistence wiring.
 * @module components/chat/chat-panel.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { threadKeys } from "@/hooks/use-threads";
import { ChatPanel } from "./chat-panel";

const { mockTransportConstructor } = vi.hoisted(() => ({
  mockTransportConstructor: vi.fn(),
}));
const { mockSetDataStream } = vi.hoisted(() => ({
  mockSetDataStream: vi.fn(),
}));
const { mockInvalidateQueries, mockSetQueriesData } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockSetQueriesData: vi.fn(),
}));
const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));
const { mockUseMessageQuota } = vi.hoisted(() => ({
  mockUseMessageQuota: vi.fn(),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
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
    invalidateQueries: mockInvalidateQueries,
    setQueriesData: mockSetQueriesData,
  }),
}));

vi.mock("@/hooks/use-message-quota", () => ({
  messageQuotaKeys: {
    all: ["message-quota"],
    current: ["message-quota", "current"],
  },
  useMessageQuota: (...args: unknown[]) => mockUseMessageQuota(...args),
}));

vi.mock("./steps-summary", () => ({
  StepsSummary: ({ isStreaming, onToolApproval }: { parts: Array<{ type: string }>; isStreaming: boolean; hasTextParts: boolean; messageId: string; onToolApproval?: unknown }) => (
    <div data-testid="steps-summary" data-streaming={isStreaming} data-has-approval={!!onToolApproval} />
  ),
}));

vi.mock("./ask-user-question-inline", () => ({
  AskUserQuestionInline: ({ questions, onSubmit, disabled }: {
    questions: Array<{ question: string }>;
    onSubmit: (text: string) => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid="ask-user-question-inline"
      data-question-count={questions.length}
      data-disabled={!!disabled}
      onClick={() => onSubmit("Option A")}
    />
  ),
}));

vi.mock("./data-stream-provider", () => ({
  useDataStream: () => ({
    dataStream: [],
    setDataStream: mockSetDataStream,
  }),
}));

describe("ChatPanel", () => {
  const mockFetch = vi.fn();
  const sendMessage = vi.fn(async () => {});
  const setMessages = vi.fn();
  const stop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "ready",
      error: undefined,
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop,
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });
    mockUseMessageQuota.mockReturnValue({
      data: null,
      isLoading: false,
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
      generateId?: () => string;
      experimental_throttle?: number;
    };
    expect(options.id).toBe("thread-1");
    expect(options.messages).toEqual(initialMessages);
    expect(options.transport).toEqual(expect.objectContaining({ api: "/api/chat" }));
    expect(typeof options.generateId).toBe("function");
    expect(options.experimental_throttle).toBe(50);
    expect(options.generateId?.()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
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

  it("prepareSendMessagesRequest does not treat historical approvals as a continuation", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockTransportConstructor.mock.calls[0][0] as {
      prepareSendMessagesRequest: (payload: { id: string; messages: UIMessage[] }) => {
        body: Record<string, unknown>;
      };
    };

    const result = options.prepareSendMessagesRequest({
      id: "thread-1",
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "tool-write_file", state: "approval-responded", approval: { approved: true } }],
        } as UIMessage,
        { id: "u1", role: "user", parts: [{ type: "text", text: "Approved earlier" }] } as UIMessage,
        { id: "a2", role: "assistant", parts: [{ type: "text", text: "Done." }] } as UIMessage,
        { id: "u2", role: "user", parts: [{ type: "text", text: "New request" }] } as UIMessage,
      ],
    });

    expect(result.body.id).toBe("thread-1");
    expect(result.body.message).toEqual({
      id: "u2",
      role: "user",
      parts: [{ type: "text", text: "New request" }],
    });
    expect(result.body.messages).toBeUndefined();
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

  it("invalidates thread queries when a stream finishes", async () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: () => void;
    };

    options.onFinish?.();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: threadKeys.all });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["message-quota"] });
  });

  it("invalidates quota queries when the chat request errors", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onError?: (error: Error) => void;
    };

    options.onError?.(new Error("boom"));

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["message-quota"] });
  });

  it("ignores unrelated stream data parts to avoid extra client re-renders", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onData?: (data: unknown) => void;
    };

    options.onData?.({
      type: "data-unrelated-part",
      data: "skip",
    });

    expect(mockSetDataStream).not.toHaveBeenCalled();
  });

  it("sends trimmed text via sendMessage", async () => {
    const user = userEvent.setup();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      status: "ready",
      error: undefined,
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop,
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "  Hello there  ");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "Hello there" });
    });

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue("");
  });

  it("shows a friendly quota error instead of raw json when the server rejects over-limit sends", () => {
    mockUseChat.mockReturnValueOnce({
      id: "thread-1",
      messages: [],
      status: "error",
      error: new Error(
        JSON.stringify({
          error: "Monthly message limit reached.",
          code: "message-quota-exceeded",
        }),
      ),
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop,
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText("Monthly message limit reached.")).toBeInTheDocument();
    expect(screen.queryByText(/"message-quota-exceeded"/i)).not.toBeInTheDocument();
  });

  it("rolls back optimistic draft navigation when a new-thread send is rejected for quota exhaustion", async () => {
    const user = userEvent.setup();
    sendMessage.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          error: "Monthly message limit reached.",
          code: "message-quota-exceeded",
        }),
      ),
    );
    window.history.replaceState({}, "", "/chat");

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/describe a task/i), "Need help");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "Need help" });
    });

    expect(window.location.pathname).toBe("/chat");
    expect(mockSetQueriesData).toHaveBeenCalledTimes(2);

    const removalUpdater = mockSetQueriesData.mock.calls[1]?.[1] as (
      old: Array<Record<string, unknown>> | undefined,
    ) => Array<Record<string, unknown>> | undefined;
    expect(removalUpdater([
      { thread_id: "thread-1", title: null },
      { thread_id: "thread-2", title: "Existing" },
    ])).toEqual([{ thread_id: "thread-2", title: "Existing" }]);
  });

  it("keeps the stop button enabled while streaming", async () => {
    const user = userEvent.setup();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      status: "streaming",
      error: undefined,
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop,
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(stop).toHaveBeenCalledTimes(1);
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

  it("pre-fills composer when a template card is clicked instead of sending", async () => {
    const user = userEvent.setup();
    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText(/what can i do for you/i)).toBeInTheDocument();
    expect(screen.getByText("Morning CRM briefing")).toBeInTheDocument();

    await user.click(screen.getByText("Morning CRM briefing"));

    // Should pre-fill the composer, NOT send immediately
    expect(sendMessage).not.toHaveBeenCalled();
    const textarea = screen.getByPlaceholderText(/describe a task/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Set up a daily morning briefing automation.");
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

    expect(screen.queryByText(/what can i do for you/i)).not.toBeInTheDocument();
  });

  it("wires addToolApprovalResponse from useChat to MessageList as onToolApproval", () => {
    const mockAddToolApproval = vi.fn();
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Thinking..." },
            { type: "text", text: "Done." },
          ],
        },
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
      addToolApprovalResponse: mockAddToolApproval,
    });

    render(<ChatPanel chatId="thread-1" />);

    // The steps-summary should have data-has-approval="true" because
    // ChatPanel wires addToolApprovalResponse → MessageList → MessageBubble → StepsSummary
    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-approval", "true");
  });

  it("pushes /chat/{id} before sending from the draft route", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    window.history.replaceState({}, "", "/chat");

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/describe a task/i), "Hello from draft");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/chat/thread-1");
      expect(sendMessage).toHaveBeenCalledWith({ text: "Hello from draft" });
    });

    pushStateSpy.mockRestore();
  });

  it("optimistically adds thread to cache when sending from draft route", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/chat");

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/describe a task/i), "Hello");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: threadKeys.all },
        expect.any(Function),
      );
    });

    // Verify the updater function prepends the new thread
    const updater = mockSetQueriesData.mock.calls[0][1] as (old: unknown[] | undefined) => unknown;
    const result = updater([{ thread_id: "existing", title: "Old" }]) as Array<{ thread_id: string }>;
    expect(result[0].thread_id).toBe("thread-1");
    expect(result).toHaveLength(2);

    // Returns undefined for empty cache (no-op)
    expect(updater(undefined)).toBeUndefined();
  });

  it("does not optimistically add thread when sending from existing thread route", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/chat/thread-1");

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      status: "ready",
      error: undefined,
      sendMessage,
      setMessages,
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop,
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "Follow up");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });

    expect(mockSetQueriesData).not.toHaveBeenCalled();
  });

  it("passes initialPrompt through to ChatComposer as initialValue", () => {
    render(<ChatPanel chatId="thread-1" initialPrompt="Set up a daily briefing" />);

    expect(screen.getByPlaceholderText(/describe a task/i)).toHaveValue(
      "Set up a daily briefing",
    );
  });

  it("sends file-only messages via the AI SDK files shortcut", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/chat-attachments/client-1/photo.png",
          pathname: "photo.png",
          contentType: "image/png",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<ChatPanel chatId="thread-1" />);

    await user.upload(
      screen.getByLabelText(/upload attachments/i),
      new File(["image-data"], "photo.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        files: [
          {
            type: "file",
            url: "https://storage.example.com/chat-attachments/client-1/photo.png",
            filename: "photo.png",
            mediaType: "image/png",
          },
        ],
      });
    });
  });

  it("configures sendAutomaticallyWhen for auto-resume after tool approval", () => {
    render(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      sendAutomaticallyWhen?: (ctx: { messages: UIMessage[] }) => boolean;
    };

    expect(typeof options.sendAutomaticallyWhen).toBe("function");

    // Should return false for normal messages
    expect(
      options.sendAutomaticallyWhen?.({
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] } as UIMessage,
        ],
      }),
    ).toBe(false);

    // Should return true when last message has an approved tool approval
    expect(
      options.sendAutomaticallyWhen?.({
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [
              { type: "tool-write_file", state: "approval-responded", approval: { approved: true } },
            ],
          } as UIMessage,
        ],
      }),
    ).toBe(true);

    // Should return false when tool approval was denied
    expect(
      options.sendAutomaticallyWhen?.({
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [
              { type: "tool-write_file", state: "approval-responded", approval: { approved: false } },
            ],
          } as UIMessage,
        ],
      }),
    ).toBe(false);
  });

  it("wires onQuestionSubmit to send user answer via sendMessage", async () => {
    const user = userEvent.setup();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-ask_user_question",
              toolCallId: "tc-ask-1",
              state: "output-available",
              input: { questions: [{ question: "Pick?", options: ["Option A", "Option B"], type: "single_select" }] },
              output: { questions: [{ question: "Pick?", options: ["Option A", "Option B"], type: "single_select" }], status: "awaiting_response" },
            },
            { type: "text", text: "Choose one:" },
          ],
        },
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

    // The mock AskUserQuestionInline calls onSubmit("Option A") on click
    await user.click(screen.getByTestId("ask-user-question-inline"));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "Option A" });
    });
  });
});
