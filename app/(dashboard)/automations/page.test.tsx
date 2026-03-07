/**
 * Tests for the Automations page.
 * @module app/(dashboard)/automations/page
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AutomationsPage from "./page";

const mockUseTriggers = vi.fn();
const mockUseSetTriggerEnabled = vi.fn();

vi.mock("@/hooks/use-triggers", () => ({
  useTriggers: () => mockUseTriggers(),
  useSetTriggerEnabled: () => mockUseSetTriggerEnabled(),
}));

describe("AutomationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders automation rows and toggles enabled state", () => {
    const mutate = vi.fn();
    mockUseTriggers.mockReturnValue({
      data: [
        {
          id: "trigger-1",
          thread_id: "thread-1",
          name: "PropertyGuru morning check",
          trigger_type: "rss",
          cron_expression: "*/15 * * * *",
          payload: { feed_url: "https://example.com/feed.xml" },
          enabled: true,
          next_fire_at: "2026-03-07T09:00:00.000Z",
          last_fired_at: "2026-03-06T09:00:00.000Z",
          last_status: "completed",
          invocation_message: "Review new listings",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseSetTriggerEnabled.mockReturnValue({
      mutate,
      variables: null,
    });

    render(<AutomationsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument();
    expect(screen.getByText("PropertyGuru morning check")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View thread" })).toHaveAttribute(
      "href",
      "/chat/thread-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(mutate).toHaveBeenCalledWith({
      triggerId: "trigger-1",
      enabled: false,
    });
  });

  it("renders an empty state when no automations exist", () => {
    mockUseTriggers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseSetTriggerEnabled.mockReturnValue({
      mutate: vi.fn(),
      variables: null,
    });

    render(<AutomationsPage />);

    expect(screen.getByText("No automations yet")).toBeInTheDocument();
  });

  it("renders a 'New automation' link that points to /chat", () => {
    mockUseTriggers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseSetTriggerEnabled.mockReturnValue({
      mutate: vi.fn(),
      variables: null,
    });

    render(<AutomationsPage />);

    const link = screen.getByRole("link", { name: /new automation/i });
    expect(link).toHaveAttribute("href", "/chat");
  });
});
