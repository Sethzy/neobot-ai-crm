import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewPicker } from "../view-picker";

const mockUseCrmViews = vi.fn();

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: (...args: unknown[]) => mockUseCrmViews(...args),
}));

describe("ViewPicker", () => {
  beforeEach(() => {
    mockUseCrmViews.mockReturnValue({
      data: [
        { view_id: "v1", name: "Active pipeline", entity_type: "deals", is_seeded: true },
        { view_id: "v2", name: "Closing this month", entity_type: "deals", is_seeded: false },
      ],
      isLoading: false,
    });
  });

  it("renders All pill plus saved views", () => {
    render(
      <ViewPicker entityType="deals" activeViewId={null} onViewChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Closing this month" })).toBeInTheDocument();
  });

  it("highlights the active view", () => {
    render(
      <ViewPicker entityType="deals" activeViewId="v1" onViewChange={vi.fn()} />,
    );
    const activeBtn = screen.getByRole("button", { name: "Active pipeline" });
    expect(activeBtn).toHaveAttribute("data-active", "true");
  });

  it("calls onViewChange with null when All is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <ViewPicker entityType="deals" activeViewId="v1" onViewChange={onViewChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onViewChange).toHaveBeenCalledWith(null);
  });

  it("calls onViewChange with view_id when a view pill is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <ViewPicker entityType="deals" activeViewId={null} onViewChange={onViewChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Active pipeline" }));
    expect(onViewChange).toHaveBeenCalledWith("v1");
  });

  it("renders the All pill when there are no saved views", () => {
    mockUseCrmViews.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(
      <ViewPicker entityType="companies" activeViewId={null} onViewChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });
});
