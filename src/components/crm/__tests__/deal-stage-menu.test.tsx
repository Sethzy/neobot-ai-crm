/**
 * Tests explicit board stage changes for deal cards.
 * @module components/crm/__tests__/deal-stage-menu
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealStageMenu } from "@/components/crm/deal-stage-menu";

describe("DealStageMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a new stage from the menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);

    render(
      <DealStageMenu
        currentStage="leads"
        stages={["leads", "offer"]}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /deal stage/i }),
      "offer",
    );

    expect(onChange).toHaveBeenCalledWith("offer");
  });

  it("shows the current stage label", () => {
    render(
      <DealStageMenu
        currentStage="offer"
        stages={["leads", "offer"]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Offer")).toBeInTheDocument();
  });
});
