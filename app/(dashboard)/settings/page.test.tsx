/**
 * Tests for the dashboard settings page.
 * @module app/(dashboard)/settings/page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: vi.fn().mockResolvedValue("client-123"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }

      if (table === "conversation_channel_mappings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === "autopilot_config") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  }),
}));

vi.mock("../pricing/submit-button", () => ({
  SubmitButton: ({ idleLabel }: { idleLabel: string }) => <button>{idleLabel}</button>,
}));

import SettingsPage from "./page";

describe("/settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current billing, channels, and skills controls", async () => {
    const element = await SettingsPage({
      searchParams: Promise.resolve({}),
    });

    render(element);

    expect(screen.getByRole("heading", { name: /Workspace controls/i })).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText(/Manage your plan, payment, and invoices in Stripe/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open billing/i })).toHaveAttribute(
      "href",
      "/settings/billing",
    );
    expect(screen.getByRole("button", { name: /Generate pairing link/i })).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open skills/i })).toHaveAttribute("href", "/skills");
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open agent context/i })).toHaveAttribute(
      "href",
      "/settings/agent-context",
    );
  });

  it("shows a destructive connection alert when the callback returns an error", async () => {
    const element = await SettingsPage({
      searchParams: Promise.resolve({
        connection: "error",
        reason: "ownership",
      }),
    });

    render(element);

    expect(screen.getByText(/Connection update failed/i)).toBeInTheDocument();
    expect(screen.getByText(/ownership/i)).toBeInTheDocument();
  });

  it("shows a success connection alert when the callback completes", async () => {
    const element = await SettingsPage({
      searchParams: Promise.resolve({
        connection: "success",
      }),
    });

    render(element);

    expect(screen.getByText(/Connection updated/i)).toBeInTheDocument();
    expect(
      screen.getByText(/external account handshake completed and the connection state was saved/i),
    ).toBeInTheDocument();
  });
});
