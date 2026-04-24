/**
 * Tests for Settings → Agent → General.
 * @module app/settings/agent/general/page
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AgentGeneralPage from "./page";

describe("AgentGeneralPage", () => {
  it("points proactive work configuration back to Automations", async () => {
    const page = await AgentGeneralPage();

    render(page);

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage proactive work from Automations/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Autopilot/i)).not.toBeInTheDocument();
  });
});
