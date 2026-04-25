/**
 * Tests for the automation list component.
 * @module components/automations/__tests__/automations-list
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutomationsList } from "../automations-list";

describe("AutomationsList", () => {
  it("renders Daily Orchestrator like any other automation row", () => {
    render(
      <AutomationsList
        triggers={[
          {
            id: "trigger-orchestrator",
            thread_id: "thread-main",
            name: "Daily Orchestrator",
            trigger_type: "schedule",
            cron_expression: "0 8 * * *",
            payload: { cron: "0 8 * * *", timezone: "Asia/Singapore" },
            enabled: true,
            next_fire_at: "2026-04-25T00:00:00.000Z",
            last_fired_at: null,
            last_status: null,
            isRunning: false,
            invocation_message: "Run the Daily Orchestrator morning pass.",
            instruction_path: "state/triggers/daily-orchestrator.md",
          },
        ]}
        onToggleEnabled={vi.fn()}
      />,
    );

    expect(screen.getByText("Daily Orchestrator")).toBeInTheDocument();
  });

  it("renders a live running automation as Busy", () => {
    render(
      <AutomationsList
        triggers={[
          {
            id: "trigger-1",
            thread_id: "thread-1",
            name: "Daily briefing",
            trigger_type: "schedule",
            cron_expression: "0 9 * * *",
            payload: {},
            enabled: true,
            next_fire_at: null,
            last_fired_at: null,
            last_status: "queued",
            isRunning: true,
            invocation_message: null,
            instruction_path: "state/triggers/daily-briefing.md",
          },
        ]}
        onToggleEnabled={vi.fn()}
      />,
    );

    expect(screen.getByText("Busy")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("keeps a disabled but still-running automation visibly Busy", () => {
    render(
      <AutomationsList
        triggers={[
          {
            id: "trigger-1",
            thread_id: "thread-1",
            name: "Daily briefing",
            trigger_type: "schedule",
            cron_expression: "0 9 * * *",
            payload: {},
            enabled: false,
            next_fire_at: null,
            last_fired_at: null,
            last_status: "queued",
            isRunning: true,
            invocation_message: null,
            instruction_path: "state/triggers/daily-briefing.md",
          },
        ]}
        onToggleEnabled={vi.fn()}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Busy")).toBeInTheDocument();
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("does not leave a stale busy badge behind once the run is idle again", () => {
    render(
      <AutomationsList
        triggers={[
          {
            id: "trigger-1",
            thread_id: "thread-1",
            name: "Daily briefing",
            trigger_type: "schedule",
            cron_expression: "0 9 * * *",
            payload: {},
            enabled: true,
            next_fire_at: null,
            last_fired_at: null,
            last_status: "skipped_thread_busy",
            isRunning: false,
            invocation_message: null,
            instruction_path: "state/triggers/daily-briefing.md",
          },
        ]}
        onToggleEnabled={vi.fn()}
      />,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Busy")).not.toBeInTheDocument();
  });

  it("uses mobile-safe row layout and switch target", () => {
    render(
      <AutomationsList
        triggers={[
          {
            id: "trigger-1",
            thread_id: "thread-1",
            name: "Daily briefing",
            trigger_type: "schedule",
            cron_expression: "0 9 * * *",
            payload: {},
            enabled: true,
            next_fire_at: "2026-04-25T00:00:00.000Z",
            last_fired_at: null,
            last_status: "completed",
            isRunning: false,
            invocation_message: null,
            instruction_path: "state/triggers/daily-briefing.md",
          },
        ]}
        onToggleEnabled={vi.fn()}
      />,
    );

    expect(screen.getByTestId("automation-row-trigger-1")).toHaveClass("max-sm:items-start");
    expect(screen.getByRole("switch")).toHaveClass("max-sm:after:-inset-3");
  });
});
