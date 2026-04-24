/**
 * Tests the generic CRM status badge primitive.
 * @module components/crm/__tests__/status-badge
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/crm/status-badge";

describe("StatusBadge", () => {
  it("renders the supplied label with the mapped badge variant", () => {
    const { container } = render(
      <StatusBadge
        label="In progress"
        value="in_progress"
        variantMap={{ in_progress: "secondary" }}
      />,
    );

    expect(screen.getByText("In progress")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });
});
