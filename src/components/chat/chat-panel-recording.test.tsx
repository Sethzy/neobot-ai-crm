/**
 * Tests for chat panel meeting recorder integration.
 * @module components/chat/chat-panel-recording.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseChat = vi.fn();
const mockSetDataStream = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockSetQueriesData = vi.fn();
const mockUseMessageQuota = vi.fn();
const mockStart = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockStop = vi.fn();

const recorderState = {
  state: "idle" as "idle" | "recording" | "paused" | "uploading",
  elapsedSeconds: 125,
  error: null as string | null,
  start: mockStart,
  pause: mockPause,
  resume: mockResume,
  stop: mockStop,
};

vi.mock("ai", () => ({
  DefaultChatTransport: class {
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options);
    }
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

vi.mock("@/hooks/use-audio-recorder", () => ({
  useAudioRecorder: () => recorderState,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
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

describe("ChatPanel meeting recording integration", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    recorderState.state = "idle";
    recorderState.elapsedSeconds = 125;
    recorderState.error = null;

    vi.stubGlobal("fetch", mockFetch);

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

  it("starts recording when the composer mic button is clicked", async () => {
    const user = userEvent.setup();

    render(<ChatPanel chatId="thread-1" />);

    await user.click(screen.getByRole("button", { name: /record meeting/i }));

    expect(mockStart).toHaveBeenCalledOnce();
  });

  it("renders the recording UI when the recorder is active", () => {
    recorderState.state = "recording";

    render(<ChatPanel chatId="thread-1" />);

    expect(screen.getByText("Recording")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type notes during your meeting/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record meeting/i })).not.toBeInTheDocument();
  });

  it("uploads the recording and triggers ingest when recording stops", async () => {
    recorderState.state = "recording";
    mockStop.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          uploadUrl: "https://storage.example.com/upload",
          storagePath: "client-1/meetings/raw/recording.webm",
          token: "signed-token",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          meetingRecordId: "meeting-1",
          transcriptPath: "home/meetings/2026-04-06-meeting-1.md",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

    const user = userEvent.setup();
    render(<ChatPanel chatId="thread-1" />);

    await user.type(screen.getByPlaceholderText(/type notes during your meeting/i), "Call back Thursday");
    await user.click(screen.getByRole("button", { name: /stop recording/i }));

    await waitFor(() => {
      expect(mockStop).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/meetings/upload-url",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://storage.example.com/upload",
      expect.objectContaining({
        method: "PUT",
        body: expect.any(Blob),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/meetings/ingest",
      expect.objectContaining({
        method: "POST",
      }),
    );

    const ingestRequest = mockFetch.mock.calls[2]?.[1] as { body: string };
    expect(JSON.parse(ingestRequest.body)).toEqual({
      storagePath: "client-1/meetings/raw/recording.webm",
      durationSeconds: 125,
      notes: "Call back Thursday",
      threadId: "thread-1",
      idempotencyKey: expect.any(String),
    });
  });
});
