/**
 * Tests for the DealCard view component.
 * @module components/views/deal-card.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/stage-badge", () => ({
  StageBadge: ({ stage }: { stage: string }) => (
    <span data-testid="stage-badge">{stage}</span>
  ),
}));

import { DealCard } from "./deal-card";

describe("DealCard", () => {
  it("renders address and price", () => {
    render(<DealCard address="Blk 322 Jurong" price="$1.2M" />);

    expect(screen.getByText("Blk 322 Jurong")).toBeInTheDocument();
    expect(screen.getByText("$1.2M")).toBeInTheDocument();
  });

  it("renders the stage badge when provided", () => {
    const { container } = render(
      <DealCard
        address="Marine Parade"
        price="$2.1M"
        stage="leads"
      />,
    );

    expect(screen.getByTestId("stage-badge")).toHaveTextContent("leads");
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild).toHaveClass("border-l-stage-leads");
  });
});
