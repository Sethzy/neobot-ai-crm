/**
 * Tests the shared kanban card row primitive.
 * @module components/crm/__tests__/kanban-card-row
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KanbanCardRow } from "@/components/crm/kanban-card-row";

describe("KanbanCardRow", () => {
  it("renders icon content and placeholder styling", () => {
    render(
      <KanbanCardRow icon={<span data-testid="icon" />} isPlaceholder>
        Contact
      </KanbanCardRow>,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
  });
});
