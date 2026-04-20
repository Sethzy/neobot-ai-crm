/**
 * Tests for the automation detail page shell.
 * @module components/automations/__tests__/automation-detail
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseTrigger,
  mockUseTriggerRuns,
  mockUseTriggerInstructions,
} = vi.hoisted(() => ({
  mockUseTrigger: vi.fn(),
  mockUseTriggerRuns: vi.fn(),
  mockUseTriggerInstructions: vi.fn(),
}));

vi.mock("@/hooks/use-triggers", () => ({
  useTrigger: () => mockUseTrigger(),
  useSetTriggerEnabled: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-trigger-runs", () => ({
  useTriggerRuns: () => mockUseTriggerRuns(),
  useManualRun: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-trigger-instructions", () => ({
  useTriggerInstructions: () => mockUseTriggerInstructions(),
}));

vi.mock("../automation-header", () => ({
  AutomationHeader: () => <div>Header</div>,
}));

vi.mock("../automation-runs", () => ({
  AutomationRuns: () => <div>Runs panel</div>,
}));

vi.mock("../automation-schedule-sidebar", () => ({
  AutomationScheduleSidebar: () => <div>Sidebar</div>,
}));

import { AutomationDetail } from "../automation-detail";

const trigger = {
  id: "trigger-1",
  client_id: "client-1",
  thread_id: "thread-1",
  trigger_type: "schedule",
  name: "Weekly Stagnant Deals Check",
  cron_expression: "0 9 * * 1",
  payload: {},
  enabled: true,
  current_run_id: null,
  next_fire_at: "2026-04-20T01:00:00.000Z",
  last_fired_at: "2026-04-19T13:31:00.000Z",
  last_status: "completed",
  retry_count: 0,
  webhook_secret: null,
  invocation_message: "Weekly stagnant deals check complete",
  instruction_path: "state/triggers/weekly-stagnant-deals.md",
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: "2026-04-19T00:00:00.000Z",
};

describe("AutomationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTrigger.mockReturnValue({
      data: trigger,
      isLoading: false,
      isError: false,
    });
    mockUseTriggerRuns.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseTriggerInstructions.mockReturnValue({
      data: "# Weekly Stagnant Deals Check\n\nReview stagnant deals.",
      isLoading: false,
      isError: false,
      error: null,
      save: {
        mutateAsync: vi.fn(),
      },
    });
  });

  it("switches to the instructions tab without crashing", () => {
    render(<AutomationDetail triggerId="trigger-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    expect(screen.getByRole("textbox", { name: "Automation instructions" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Automation instructions" }),
    ).toHaveValue("# Weekly Stagnant Deals Check\n\nReview stagnant deals.");
  });

  it("renders automation instructions with the shared plain-text markdown editor contract", () => {
    render(<AutomationDetail triggerId="trigger-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    const instructionsInput = screen.getByRole("textbox", {
      name: "Automation instructions",
    });

    expect(instructionsInput).toHaveAttribute("spellcheck", "false");
    expect(instructionsInput).toHaveAttribute("autocapitalize", "off");
    expect(instructionsInput).toHaveAttribute("autocorrect", "off");
    expect(instructionsInput).toHaveClass("font-mono");
  });
});
