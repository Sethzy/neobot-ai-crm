/**
 * Tests for the agent-context settings page.
 * @module app/(dashboard)/settings/agent-context/page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  resolveClientId: vi.fn(),
  createClient: vi.fn(),
  agentContextForm: vi.fn(
    ({
      initialClientProfile,
      initialUserPreferences,
    }: {
      initialClientProfile: string;
      initialUserPreferences: string;
    }) => (
      <div data-testid="agent-context-form">
        {initialClientProfile}::{initialUserPreferences}
      </div>
    ),
  ),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: pageMocks.resolveClientId,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: pageMocks.createClient,
}));

vi.mock("./agent-context-form", () => ({
  AgentContextForm: pageMocks.agentContextForm,
}));

import AgentContextPage from "./page";

describe("/settings/agent-context page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageMocks.resolveClientId.mockResolvedValue("client-1");
  });

  it("renders the form with the loaded client values", async () => {
    pageMocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                client_profile: "Calm, practical.",
                user_preferences: "Prefers bullets.",
              },
              error: null,
            }),
          })),
        })),
      })),
    });

    const element = await AgentContextPage();
    render(element);

    expect(screen.getByTestId("agent-context-form")).toHaveTextContent(
      "Calm, practical.::Prefers bullets.",
    );
  });

  it("fails closed when the initial load fails", async () => {
    pageMocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "boom" },
            }),
          })),
        })),
      })),
    });

    const element = await AgentContextPage();
    render(element);

    expect(screen.getByText("Failed to load agent context.")).toBeInTheDocument();
    expect(screen.getByText(/Refresh the page and retry before saving/i)).toBeInTheDocument();
    expect(screen.queryByTestId("agent-context-form")).not.toBeInTheDocument();
  });
});
