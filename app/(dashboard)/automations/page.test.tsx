/**
 * Tests for the automations client page body.
 * @module app/(dashboard)/automations/page
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationsPageClient } from "./automations-page-client";

const mockUseTriggers = vi.fn();
const mockUseSetTriggerEnabled = vi.fn();

vi.mock("@/hooks/use-triggers", () => ({
  useTriggers: () => mockUseTriggers(),
  useSetTriggerEnabled: () => mockUseSetTriggerEnabled(),
}));

vi.mock("@/components/automations/automation-launcher-composer", () => ({
  AutomationLauncherComposer: () => (
    <div data-testid="automation-launcher-composer">Describe an automation to create...</div>
  ),
}));

describe("AutomationsPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders automation rows grouped by active status", () => {
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
          instruction_path: "state/triggers/propertyguru.md",
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

    render(<AutomationsPageClient />);

    expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument();
    expect(screen.getByText("PropertyGuru morning check")).toBeInTheDocument();
    // Card rows link to the detail page
    expect(screen.getByRole("link", { name: /PropertyGuru morning check/i })).toHaveAttribute(
      "href",
      "/automations/trigger-1",
    );
    // Toggle switch is present
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("describes automations as a creation and management surface", () => {
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

    render(<AutomationsPageClient />);

    expect(
      screen.getByText("Create and manage automated tasks that run on a schedule."),
    ).toBeInTheDocument();
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

    render(<AutomationsPageClient />);

    expect(screen.getByText("No automations yet")).toBeInTheDocument();
  });

  it("renders the sticky launcher composer instead of a separate new-automation link", () => {
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

    render(<AutomationsPageClient />);

    expect(screen.getByTestId("automation-launcher-composer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new automation/i })).not.toBeInTheDocument();
  });
});
