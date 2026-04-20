/**
 * Tests for the automation detail header.
 * @module components/automations/__tests__/automation-header
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AutomationHeader } from "../automation-header";

const baseTrigger = {
  id: "trigger-1",
  client_id: "client-1",
  thread_id: "thread-1",
  trigger_type: "schedule",
  name: "Daily briefing",
  cron_expression: "0 9 * * *",
  payload: {},
  enabled: true,
  current_run_id: null,
  next_fire_at: null,
  last_fired_at: null,
  last_status: null,
  retry_count: 0,
  webhook_secret: null,
  invocation_message: "Run the daily briefing",
  instruction_path: "state/triggers/daily-briefing.md",
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: "2026-04-19T00:00:00.000Z",
};

describe("AutomationHeader", () => {
  it("renders the automation name as the title", () => {
    render(<AutomationHeader trigger={baseTrigger} />);

    expect(screen.getByRole("heading", { level: 1, name: "Daily briefing" })).toBeInTheDocument();
  });

  it("renders Active status in the metadata row when enabled", () => {
    render(<AutomationHeader trigger={baseTrigger} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders Disabled status when the trigger is off", () => {
    render(<AutomationHeader trigger={{ ...baseTrigger, enabled: false }} />);

    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });
});
