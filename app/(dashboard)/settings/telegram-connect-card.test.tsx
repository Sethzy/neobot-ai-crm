/**
 * Tests for the Telegram connect/disconnect settings card.
 * @module app/(dashboard)/settings/telegram-connect-card.test
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TelegramConnectCard } from "./telegram-connect-card";

describe("TelegramConnectCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a pairing link and renders the open button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          url: "https://t.me/SunderBot?start=token-123",
          expiresInSeconds: 600,
        }),
      }),
    );

    render(<TelegramConnectCard initialChatId={null} />);

    fireEvent.click(screen.getByRole("button", { name: /generate pairing link/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /open telegram/i })).toHaveAttribute(
        "href",
        "https://t.me/SunderBot?start=token-123",
      );
    });
  });

  it("disconnects an existing Telegram connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );

    render(<TelegramConnectCard initialChatId="12345" />);

    fireEvent.click(screen.getByRole("button", { name: /disconnect telegram/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate pairing link/i })).toBeInTheDocument();
    });
  });

  it("shows an inline error when the pairing request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "failed" }),
      }),
    );

    render(<TelegramConnectCard initialChatId={null} />);

    fireEvent.click(screen.getByRole("button", { name: /generate pairing link/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });
});
