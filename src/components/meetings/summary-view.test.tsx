/**
 * Tests for meeting summary rendering.
 * @module components/meetings/summary-view.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryView } from "./summary-view";

describe("SummaryView", () => {
  it("renders structured JSON summaries by section", () => {
    render(
      <SummaryView
        status="completed"
        summary={JSON.stringify({
          key_discussion_points: ["Reviewed portfolio performance"],
          action_items: ["Send allocation update"],
          client_concerns: [],
          personal_details: [],
          next_steps: ["Follow up next Tuesday"],
        })}
      />,
    );

    expect(screen.getByText("Key Discussion Points")).toBeInTheDocument();
    expect(screen.getByText("Reviewed portfolio performance")).toBeInTheDocument();
    expect(screen.getByText("Action Items")).toBeInTheDocument();
    expect(screen.getByText("Send allocation update")).toBeInTheDocument();
  });

  it("falls back to plain text for legacy summaries", () => {
    render(
      <SummaryView
        status="completed"
        summary="- Discussed portfolio review\n- Follow up Thursday"
      />,
    );

    expect(
      screen.getByText((content) =>
        content.includes("- Discussed portfolio review")
        && content.includes("- Follow up Thursday")
      ),
    ).toBeInTheDocument();
  });
});
