/**
 * Tests for the meeting detail page handoff flow.
 * @module app/(dashboard)/meetings/[id]/page.test
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { threadKeys } from "@/hooks/use-threads";

const mockPush = vi.fn();
const mockUseMeeting = vi.fn();
const mockUseClientId = vi.fn();
const mockDownloadTranscript = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "meeting-1" }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/hooks/use-meetings", () => ({
  useMeeting: (...args: unknown[]) => mockUseMeeting(...args),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: (...args: unknown[]) => mockUseClientId(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        download: (...args: unknown[]) => mockDownloadTranscript(...args),
      }),
    },
  },
}));

import MeetingDetailPage from "./page";

function renderWithQueryClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MeetingDetailPage />
    </QueryClientProvider>,
  );
}

describe("MeetingDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClientId.mockReturnValue({ data: "client-1" });
    mockUseMeeting.mockReturnValue({
      data: {
        meeting_record_id: "meeting-1",
        title: "Portfolio Review",
        summary: JSON.stringify({
          key_discussion_points: ["Discussed portfolio review"],
          action_items: [],
          client_concerns: [],
          personal_details: [],
          next_steps: ["Follow up next week"],
        }),
        notes: null,
        duration_seconds: 60,
        transcript_path: null,
        thread_id: null,
        status: "completed",
        created_at: "2026-04-19T10:00:00.000Z",
      },
      isLoading: false,
    });
    mockDownloadTranscript.mockResolvedValue({
      data: null,
      error: { message: "not-found" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ threadId: "thread-new" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it("optimistically inserts the new thread into the sidebar cache before navigation", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(threadKeys.list("client-1"), [
      {
        thread_id: "existing-thread",
        client_id: "client-1",
        title: "Existing chat",
        is_pinned: false,
        is_primary: false,
        is_archived: false,
        source_type: "chat",
        created_at: "2026-04-18T09:00:00.000Z",
        updated_at: "2026-04-18T09:00:00.000Z",
      },
    ]);

    renderWithQueryClient(queryClient);

    await user.click(screen.getByRole("button", { name: "Send to agent" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/thread-new");
    });

    const threads = queryClient.getQueryData<Array<Record<string, unknown>>>(
      threadKeys.list("client-1"),
    );

    expect(threads?.[0]).toMatchObject({
      thread_id: "thread-new",
      client_id: "client-1",
      title: "Portfolio Review",
      source_type: "chat",
    });
  });

  it("shows a pending label and spinner while creating the handoff thread", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const queryClient = new QueryClient();
    queryClient.setQueryData(threadKeys.list("client-1"), []);

    renderWithQueryClient(queryClient);

    await user.click(screen.getByRole("button", { name: "Send to agent" }));

    expect(screen.getByRole("button", { name: /Opening agent\.\.\./ })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

    resolveFetch?.(
      new Response(JSON.stringify({ threadId: "thread-new" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/thread-new");
    });
  });

  it("does not load transcript storage until the transcript is opened", async () => {
    const user = userEvent.setup();
    mockUseMeeting.mockReturnValue({
      data: {
        meeting_record_id: "meeting-1",
        title: "Portfolio Review",
        summary: JSON.stringify({
          key_discussion_points: ["Discussed portfolio review"],
          action_items: [],
          client_concerns: [],
          personal_details: [],
          next_steps: ["Follow up next week"],
        }),
        notes: null,
        duration_seconds: 60,
        transcript_path: "meetings/transcript-1.md",
        thread_id: null,
        status: "completed",
        created_at: "2026-04-19T10:00:00.000Z",
      },
      isLoading: false,
    });
    mockDownloadTranscript.mockImplementationOnce(
      () =>
        new Promise<{ data: { text: () => Promise<string> }; error: null }>(() => {}),
    );

    const queryClient = new QueryClient();

    renderWithQueryClient(queryClient);

    expect(mockDownloadTranscript).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /transcript/i }));

    await waitFor(() => {
      expect(mockDownloadTranscript).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Loading transcript...")).toBeInTheDocument();
    expect(screen.queryByText("Transcript unavailable.")).not.toBeInTheDocument();
  });
});
