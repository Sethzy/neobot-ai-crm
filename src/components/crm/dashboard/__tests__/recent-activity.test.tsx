/**
 * Tests for the customers dashboard recent-activity panel.
 * @module components/crm/dashboard/__tests__/recent-activity
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RecentActivity,
  formatRelativeInteractionTime,
} from "@/components/crm/dashboard/recent-activity";

vi.mock("@/hooks/use-recent-interactions", () => ({
  useRecentInteractions: vi.fn(),
}));

describe("formatRelativeInteractionTime", () => {
  it("formats recent activity timestamps as short relative labels", () => {
    expect(
      formatRelativeInteractionTime(
        "2026-03-10T10:00:00+08:00",
        new Date("2026-03-10T12:00:00+08:00"),
      ),
    ).toBe("2 hours ago");
  });
});

describe("RecentActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders interaction rows with contact links and summary text", async () => {
    const { useRecentInteractions } = await import("@/hooks/use-recent-interactions");

    vi.mocked(useRecentInteractions).mockReturnValue({
      data: [
        {
          interaction_id: "interaction-1",
          client_id: "client-1",
          contact_id: "contact-1",
          deal_id: null,
          type: "call",
          summary: "Discussed viewing slots for the Holland Drive unit",
          occurred_at: "2026-03-10T10:00:00+08:00",
          created_at: "2026-03-10T10:00:00+08:00",
          updated_at: "2026-03-10T10:00:00+08:00",
          contacts: {
            contact_id: "contact-1",
            first_name: "Sarah",
            last_name: "Chen",
          },
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    render(<RecentActivity />);

    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
    expect(
      screen.getByText(/Discussed viewing slots for the Holland Drive unit/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute(
      "href",
      "/customers/people",
    );
    expect(screen.getAllByRole("link")[1]).toHaveAttribute(
      "href",
      "/customers/people/contact-1",
    );
  });

  it("shows an empty state when there is no activity yet", async () => {
    const { useRecentInteractions } = await import("@/hooks/use-recent-interactions");

    vi.mocked(useRecentInteractions).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    render(<RecentActivity />);

    expect(screen.getByText(/no recent activity yet/i)).toBeInTheDocument();
  });

  it("shows an error state and retries on demand", async () => {
    const { useRecentInteractions } = await import("@/hooks/use-recent-interactions");
    const mockRefetch = vi.fn();
    const user = userEvent.setup();

    vi.mocked(useRecentInteractions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<RecentActivity />);

    expect(
      screen.getByText(/unable to load recent activity/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
