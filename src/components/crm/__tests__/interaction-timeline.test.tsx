/**
 * Tests for deal interaction timeline rendering.
 * @module components/crm/__tests__/interaction-timeline
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InteractionTimeline } from "../interaction-timeline";

const sampleInteractions = [
  {
    interaction_id: "i-1",
    client_id: "cl-1",
    contact_id: "c-1",
    deal_id: "d-1",
    type: "call" as const,
    summary: "Discussed pricing and timeline",
    occurred_at: "2026-03-01T14:30:00+08:00",
    created_at: "2026-03-01T14:30:00+08:00",
    updated_at: "2026-03-01T14:30:00+08:00",
    contacts: { first_name: "John", last_name: "Smith" },
  },
  {
    interaction_id: "i-2",
    client_id: "cl-1",
    contact_id: "c-1",
    deal_id: "d-1",
    type: "viewing" as const,
    summary: "Viewing at 123 Orchard Road",
    occurred_at: "2026-02-28T10:00:00+08:00",
    created_at: "2026-02-28T10:00:00+08:00",
    updated_at: "2026-02-28T10:00:00+08:00",
    contacts: { first_name: "John", last_name: "Smith" },
  },
];

describe("InteractionTimeline", () => {
  it("renders interaction type labels and summaries", () => {
    render(<InteractionTimeline interactions={sampleInteractions} />);

    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
    expect(screen.getByText(/Discussed pricing and timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Viewing at 123 Orchard Road/i)).toBeInTheDocument();
  });

  it("renders contact names for linked interactions", () => {
    render(<InteractionTimeline interactions={sampleInteractions} />);

    expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
  });

  it("shows empty state when interactions are empty", () => {
    render(<InteractionTimeline interactions={[]} />);

    expect(screen.getByText(/no interactions yet/i)).toBeInTheDocument();
  });
});
