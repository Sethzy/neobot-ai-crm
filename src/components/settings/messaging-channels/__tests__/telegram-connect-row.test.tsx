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

describe("TelegramConnectRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders idle state when no chatId is passed", () => {
    render(
      withQueryClient(
        <TelegramConnectRow clientId="client-1" initialChatId={null} />,
      ),
    );

    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("renders connected state when initialChatId is passed", () => {
    render(
      withQueryClient(
        <TelegramConnectRow clientId="client-1" initialChatId="987654321" />,
      ),
    );

    expect(screen.getByText("987654321")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("POSTs to generate-pairing-link and shows the deep link on success", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: "https://t.me/sunder_bot?start=abc123",
          expiresInSeconds: 600,
        }),
        { status: 200 },
      ),
    );

    render(
      withQueryClient(
        <TelegramConnectRow clientId="client-1" initialChatId={null} />,
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
        "https://t.me/sunder_bot?start=abc123",
      );
    });
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
        <TelegramConnectRow clientId="client-1" initialChatId={null} />,
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
        <TelegramConnectRow clientId="client-1" initialChatId="987654321" />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/telegram/disconnect", {
        method: "DELETE",
      });
    });
  });
});
