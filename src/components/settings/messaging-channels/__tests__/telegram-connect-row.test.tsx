/**
 * Tests for the TelegramConnectRow state machine.
 * @module components/settings/messaging-channels/telegram-connect-row.test
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TelegramConnectRow } from "../telegram-connect-row";

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

function withQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function hasRenderPhaseWarning(errorSpy: ReturnType<typeof vi.spyOn>) {
  return errorSpy.mock.calls.some((call) =>
    call.some((value) =>
      String(value).includes("Cannot update a component while rendering a different component")
    )
  );
}

describe("TelegramConnectRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders idle state when Telegram is available and not yet connected", () => {
    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={null}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    expect(screen.getByText("Connect Telegram")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("renders unavailable state when Telegram is not configured", () => {
    render(
      withQueryClient(
        <TelegramConnectRow
          availabilityMessage="Telegram is not configured yet."
          initialConnection={null}
          isAvailable={false}
          realtimeUserId="user-1"
        />,
      ),
    );

    expect(screen.getByRole("button", { name: "Not configured" })).toBeDisabled();
    expect(screen.getByText("Telegram is not configured yet.")).toBeInTheDocument();
  });

  it("renders connected state when initial connection is passed", () => {
    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={{
            chatId: "987654321",
            targetThreadId: "thread-1",
          }}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    expect(screen.getByText("987654321")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("POSTs to generate-pairing-link and shows the manual code + deep link on success", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          botUsername: "GooseworksBot",
          displayCode: "GW-22E14A",
          expiresInSeconds: 600,
          openUrl: "https://t.me/gooseworks_bot?start=abc123",
        }),
        { status: 200 },
      ),
    );

    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={null}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/telegram/generate-pairing-link", {
        method: "POST",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open Telegram" })).toHaveAttribute(
        "href",
        "https://t.me/gooseworks_bot?start=abc123",
      );
    });
    expect(screen.getByText("GW-22E14A")).toBeInTheDocument();
    expect(screen.getByText(/@GooseworksBot/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for connection/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows an error message when generate-pairing-link fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "No Telegram bot token configured." }),
        { status: 500 },
      ),
    );

    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={null}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByText("No Telegram bot token configured.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("DELETEs to disconnect when the Disconnect button is clicked", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={{
            chatId: "987654321",
            targetThreadId: "thread-1",
          }}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/telegram/disconnect", {
        method: "DELETE",
      });
    });
  });

  it("copies the manual pairing code", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          botUsername: "GooseworksBot",
          displayCode: "GW-22E14A",
          expiresInSeconds: 600,
          openUrl: "https://t.me/gooseworks_bot?start=abc123",
        }),
        { status: 200 },
      ),
    );

    render(
      withQueryClient(
        <TelegramConnectRow
          initialConnection={null}
          isAvailable
          realtimeUserId="user-1"
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("GW-22E14A");
    });
  });

  it("resets pairing state when the connection key changes without render-phase warnings", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          botUsername: "GooseworksBot",
          displayCode: "GW-22E14A",
          expiresInSeconds: 600,
          openUrl: "https://t.me/gooseworks_bot?start=abc123",
        }),
        { status: 200 },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TelegramConnectRow
          initialConnection={null}
          isAvailable
          realtimeUserId="user-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByText("GW-22E14A")).toBeInTheDocument();
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <TelegramConnectRow
          initialConnection={{
            chatId: "987654321",
            targetThreadId: "thread-1",
          }}
          isAvailable
          realtimeUserId="user-2"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    });

    expect(screen.queryByText("GW-22E14A")).not.toBeInTheDocument();
    expect(hasRenderPhaseWarning(consoleErrorSpy)).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});
