/**
 * Tests for the automation list component.
 * @module components/automations/__tests__/automations-list
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutomationsList } from "../automations-list";

describe("AutomationsList", () => {
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
});
