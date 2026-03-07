/**
 * Tests for SuggestedTemplates card grid.
 * @module components/automations/__tests__/suggested-templates
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SuggestedTemplates } from "../suggested-templates";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/automations/templates", () => ({
  AUTOMATION_TEMPLATES: [
    {
      id: "test-briefing",
      title: "Morning briefing",
      description: "Daily CRM summary",
      category: "sales",
      prompt: "Set up a daily morning briefing automation.",
    },
    {
      id: "test-monitor",
      title: "Listing monitor",
      description: "Watch for new listings",
      category: "research",
      prompt: "Set up an RSS monitor for listings.",
    },
  ],
}));

describe("SuggestedTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a heading and template cards", () => {
    render(<SuggestedTemplates />);

    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("Morning briefing")).toBeInTheDocument();
    expect(screen.getByText("Listing monitor")).toBeInTheDocument();
    expect(screen.getByText("Daily CRM summary")).toBeInTheDocument();
  });

  it("navigates to /chat with encoded prompt on card click", async () => {
    const user = userEvent.setup();
    render(<SuggestedTemplates />);

    await user.click(screen.getByText("Morning briefing"));

    expect(mockPush).toHaveBeenCalledWith(
      `/chat?prompt=${encodeURIComponent("Set up a daily morning briefing automation.")}`,
    );
  });
});
