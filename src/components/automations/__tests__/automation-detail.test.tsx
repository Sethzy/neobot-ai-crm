/**
 * Tests for the automation detail page shell.
 * @module components/automations/__tests__/automation-detail
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/markdown-editor", () => ({
  MarkdownEditor: ({
    ariaLabel,
    disabled,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  preloadMarkdownEditor: vi.fn(),
}));

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
  prefetchTriggerInstructions: vi.fn(),
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

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

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
      data: {
        content: "# Weekly Stagnant Deals Check\n\nReview stagnant deals.",
        displayPath: "/agent/state/triggers/weekly-stagnant-deals.md",
      },
      isLoading: false,
      isError: false,
      error: null,
      save: {
        mutateAsync: vi.fn(),
      },
    });
  });

  it("switches to the instructions tab without crashing", () => {
    renderWithQueryClient(<AutomationDetail triggerId="trigger-1" />);

    expect(screen.getByRole("textbox", { name: "Automation instructions" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Automation instructions" }),
    ).toHaveValue("# Weekly Stagnant Deals Check\n\nReview stagnant deals.");
  });

  it("switches to the runs tab when clicked", () => {
    renderWithQueryClient(<AutomationDetail triggerId="trigger-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Runs" }));

    expect(screen.getByText("Runs panel")).toBeInTheDocument();
  });

  it("keeps showing the loading shell while the trigger query is still unresolved", () => {
    mockUseTrigger.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    renderWithQueryClient(<AutomationDetail triggerId="trigger-1" />);

    expect(screen.queryByText("Automation not found.")).not.toBeInTheDocument();
  });
});
