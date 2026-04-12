/**
 * Tests for chat panel cleanup after moving meeting recording to /meetings.
 * @module components/chat/chat-panel-recording.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLastAssistantMessageIsCompleteWithApprovalResponses } = vi.hoisted(() => ({
  mockLastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(),
}));
const mockUseChat = vi.fn();
const mockSetDataStream = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockSetQueriesData = vi.fn();
const mockUseMessageQuota = vi.fn();

vi.mock("ai", () => ({
  lastAssistantMessageIsCompleteWithApprovalResponses:
    mockLastAssistantMessageIsCompleteWithApprovalResponses,
}));

vi.mock("./session-chat-transport", () => ({
  SessionChatTransport: class {
    chatId: string;
    constructor(chatId: string) {
      this.chatId = chatId;
    }
    destroy() {}
  },
}));

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

vi.mock("@/hooks/use-auto-resume", () => ({
  useAutoResume: () => ({
    isWaitingForResponse: false,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({
        subscribe: () => ({ unsubscribe: vi.fn() }),
      }),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("./data-stream-provider", () => ({
  useDataStream: () => ({
    dataStream: [],
    setDataStream: mockSetDataStream,
  }),
}));

vi.mock("./message-list", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

import { ChatPanel } from "./chat-panel";

describe("ChatPanel meeting recording cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChat.mockReturnValue({
      id: "thread-1",
      messages: [],
      status: "ready",
      error: undefined,
      sendMessage: vi.fn(async () => {}),
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
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

  it("does not render a record meeting button in chat", () => {
    render(<ChatPanel chatId="thread-1" />);

    expect(screen.queryByRole("button", { name: /record meeting/i })).not.toBeInTheDocument();
  });

  it("does not render meeting notes UI in chat", () => {
    render(<ChatPanel chatId="thread-1" />);

    expect(screen.queryByPlaceholderText(/type notes during your meeting/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Recording")).not.toBeInTheDocument();
  });

  it("still renders the normal chat composer", () => {
    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByPlaceholderText(/describe a task or responsibility/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeInTheDocument();
  });
});
