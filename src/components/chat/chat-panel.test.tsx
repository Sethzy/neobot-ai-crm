/**
 * Tests for chat panel streaming + persistence wiring.
 * @module components/chat/chat-panel.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import type { ImgHTMLAttributes, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { threadKeys } from "@/hooks/use-threads";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { ChatPanel } from "./chat-panel";

const { mockLastAssistantMessageIsCompleteWithApprovalResponses } = vi.hoisted(() => ({
  mockLastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(),
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
const { mockUseAudioRecorder } = vi.hoisted(() => ({
  mockUseAudioRecorder: vi.fn(),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized, ...imgProps } = props;
    void unoptimized;
    return <img {...imgProps} alt={imgProps.alt ?? ""} />;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
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
  lastAssistantMessageIsCompleteWithApprovalResponses:
    mockLastAssistantMessageIsCompleteWithApprovalResponses,
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

vi.mock("@/hooks/use-audio-recorder", () => ({
  useAudioRecorder: (...args: unknown[]) => mockUseAudioRecorder(...args),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name, onToolApproval }: { name: string; onToolApproval?: unknown }) => (
    <div data-testid="tool-call-inline" data-name={name} data-has-approval={!!onToolApproval}>{name}</div>
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

const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
const mockChannel = vi.fn().mockReturnValue({ on: mockOn });
const mockRemoveChannel = vi.fn();
const mockUploadToSignedUrl = vi.fn();
const mockStorageFrom = vi.fn().mockReturnValue({
  uploadToSignedUrl: mockUploadToSignedUrl,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    storage: {
      from: mockStorageFrom,
    },
  }),
}));

vi.mock("@/lib/chat/message-normalization", () => ({
  mapDbMessageToUiMessage: vi.fn((row: { message_id: string; role: string; parts: unknown }) => ({
    id: row.message_id,
    role: row.role,
    parts: Array.isArray(row.parts) ? row.parts : [],
  })),
}));

function renderPanel(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ChatPanel", () => {
  const mockFetch = vi.fn();
  const sendMessage = vi.fn(async () => {});
  const setMessages = vi.fn();
  const stop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    document.cookie = "chat-model=; path=/; max-age=0";
    mockUploadToSignedUrl.mockResolvedValue({
      data: { path: "uploads/photo.png" },
      error: null,
    });

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
    mockUseAudioRecorder.mockReturnValue({
      state: "idle",
      elapsedSeconds: 0,
      error: null,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    });
  });

  it("uses the default useChat request path with server-loaded initialMessages", () => {
    const initialMessages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "Loaded from server" }] },
    ] as UIMessage[];
    renderPanel(<ChatPanel chatId="thread-1" initialMessages={initialMessages} />);

    const options = mockUseChat.mock.calls[0][0] as {
      id: string;
      messages: UIMessage[];
      transport?: unknown;
      generateId?: () => string;
      experimental_throttle?: number;
    };
    expect(options.id).toBe("thread-1");
    expect(options.messages).toEqual(initialMessages);
    expect(options.transport).toBeUndefined();
    expect(typeof options.generateId).toBe("function");
    expect(options.experimental_throttle).toBe(50);
    expect(options.generateId?.()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("appends incoming stream data parts to data stream context", () => {
    renderPanel(<ChatPanel chatId="thread-1" />);

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
    renderPanel(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onFinish?: () => void;
    };

    options.onFinish?.();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: threadKeys.all });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["message-quota"] });
  });

  it("invalidates quota queries when the chat request errors", () => {
    renderPanel(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      onError?: (error: Error) => void;
    };

    options.onError?.(new Error("boom"));

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["message-quota"] });
  });

  it("ignores unrelated stream data parts to avoid extra client re-renders", () => {
    renderPanel(<ChatPanel chatId="thread-1" />);

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

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "  Hello there  ");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        { text: "Hello there" },
        { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
      );
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

    renderPanel(<ChatPanel chatId="thread-1" />);

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

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/describe a task/i), "Need help");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        { text: "Need help" },
        { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
      );
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

  it("keeps the composer disabled while streaming and wires the stop button to /api/chat/interrupt", async () => {
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
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    renderPanel(<ChatPanel chatId="thread-1" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(mockFetch).toHaveBeenCalledWith("/api/chat/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: "thread-1" }),
    });
  });

  it("does not expose the stop button while the request is only submitted", () => {
    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      status: "submitted",
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

    renderPanel(<ChatPanel chatId="thread-1" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("shows a toast when interrupting the stream fails", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "no active run" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
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
      stop: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    });

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to stop the current run.");
    });
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

    renderPanel(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText(/gateway timeout/i)).toBeInTheDocument();
  });

  it("pre-fills composer when a template card is clicked instead of sending", async () => {
    const user = userEvent.setup();
    renderPanel(<ChatPanel chatId="thread-1" />);

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

    renderPanel(<ChatPanel chatId="thread-1" />);

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
            { type: "tool-run_sql", toolCallId: "tc1", state: "output-available", input: {}, output: {} },
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

    renderPanel(<ChatPanel chatId="thread-1" />);

    // ToolCallInline should have data-has-approval="true" because
    // ChatPanel wires addToolApprovalResponse → MessageList → MessageBubble → ToolCallInline
    expect(screen.getByTestId("tool-call-inline")).toHaveAttribute("data-has-approval", "true");
  });

  it("pushes /chat/{id} before sending from the draft route", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    window.history.replaceState({}, "", "/chat");

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/describe a task/i), "Hello from draft");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/chat/thread-1");
      expect(sendMessage).toHaveBeenCalledWith(
        { text: "Hello from draft" },
        { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
      );
    });

    pushStateSpy.mockRestore();
  });

  it("optimistically adds thread to cache when sending from draft route", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/chat");

    renderPanel(<ChatPanel chatId="thread-1" />);

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

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "Follow up");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });

    expect(mockSetQueriesData).not.toHaveBeenCalled();
  });

  it("passes initialPrompt through to ChatComposer as initialValue", () => {
    renderPanel(<ChatPanel chatId="thread-1" initialPrompt="Set up a daily briefing" />);

    expect(screen.getByPlaceholderText(/describe a task/i)).toHaveValue(
      "Set up a daily briefing",
    );
  });

  it("sends file-only messages via the AI SDK files shortcut", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            path: "client-1/uploads/photo.png",
            token: "upload-token",
            storagePath: "uploads/photo.png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/agent-files/client-1/uploads/photo.png",
          storagePath: "uploads/photo.png",
          pathname: "photo.png",
          contentType: "image/png",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
      );

    renderPanel(<ChatPanel chatId="thread-1" />);

    await user.upload(
      screen.getByLabelText(/upload attachments/i),
      new File(["image-data"], "photo.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
        "client-1/uploads/photo.png",
        "upload-token",
        expect.any(File),
        {
          cacheControl: "3600",
          upsert: false,
        },
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        {
          files: [
            {
              type: "file",
              url: "https://storage.example.com/agent-files/client-1/uploads/photo.png",
              filename: "photo.png",
              mediaType: "image/png",
              storagePath: "uploads/photo.png",
            },
          ],
        },
        { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
      );
    });
  });

  it("configures sendAutomaticallyWhen for approval continuations", () => {
    renderPanel(<ChatPanel chatId="thread-1" />);

    const options = mockUseChat.mock.calls[0][0] as {
      sendAutomaticallyWhen?: unknown;
    };

    expect(options.sendAutomaticallyWhen).toBe(
      mockLastAssistantMessageIsCompleteWithApprovalResponses,
    );
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

    renderPanel(<ChatPanel chatId="thread-1" />);

    // The mock AskUserQuestionInline calls onSubmit("Option A") on click
    await user.click(screen.getByTestId("ask-user-question-inline"));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        { text: "Option A" },
        { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
      );
    });
  });

  describe("background job delivery via Realtime", () => {
    it("subscribes to conversation_messages on mount with chatId", () => {
      renderPanel(<ChatPanel chatId="thread-abc" />);

      expect(mockChannel).toHaveBeenCalledWith("bg-jobs-thread-abc");
      expect(mockOn).toHaveBeenCalledWith(
        "postgres_changes",
        expect.objectContaining({
          event: "INSERT",
          table: "conversation_messages",
          filter: "thread_id=eq.thread-abc",
        }),
        expect.any(Function),
      );
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it("unsubscribes on unmount", () => {
      const { unmount } = renderPanel(<ChatPanel chatId="thread-abc" />);
      unmount();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });
  });
});
