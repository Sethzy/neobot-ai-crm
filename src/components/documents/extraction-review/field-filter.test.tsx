/**
 * @file FieldFilter component tests
 * @description Tests for multi-select field filter dropdown
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldFilter } from "./field-filter";
import type { FieldFilters, FieldCounts } from "@/lib/field-filter-utils";

describe("FieldFilter", () => {
  const defaultProps = {
    filters: { lowConfidence: false, needsReview: false, nonNull: false } as FieldFilters,
    onChange: vi.fn(),
    counts: {
      total: 14,
      lowConfidence: 3,
      needsReview: 2,
      nonNull: 10,
      visible: 14,
    } as FieldCounts,
  };

  it("should render filter button", () => {
    render(<FieldFilter {...defaultProps} />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should show dropdown with filter options when clicked", async () => {
    const user = userEvent.setup();
    render(<FieldFilter {...defaultProps} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Low confidence fields")).toBeInTheDocument();
    expect(screen.getByText("Needs review fields")).toBeInTheDocument();
    expect(screen.getByText("Non-null fields")).toBeInTheDocument();
  });

  it("should show visible count in dropdown", async () => {
    const user = userEvent.setup();
    render(<FieldFilter {...defaultProps} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Showing 14 of 14 fields")).toBeInTheDocument();
  });

  it("should call onChange when low confidence checkbox toggled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FieldFilter {...defaultProps} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByLabelText("Low confidence fields"));

    expect(onChange).toHaveBeenCalledWith({
      lowConfidence: true,
      needsReview: false,
      nonNull: false,
    });
  });

  it("should call onChange when needs review checkbox toggled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FieldFilter {...defaultProps} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByLabelText("Needs review fields"));

    expect(onChange).toHaveBeenCalledWith({
      lowConfidence: false,
      needsReview: true,
      nonNull: false,
    });
  });

  it("should show filter indicator when filters active", () => {
    render(
      <FieldFilter
        {...defaultProps}
        filters={{ lowConfidence: true, needsReview: false, nonNull: false }}
        counts={{ ...defaultProps.counts, visible: 3 }}
      />
    );

    // Should show active filter count badge
    expect(screen.getByTestId("active-filter-count")).toHaveTextContent("1");
  });

  it("should show count of active filters", () => {
    render(
      <FieldFilter
        {...defaultProps}
        filters={{ lowConfidence: true, needsReview: true, nonNull: false }}
        counts={{ ...defaultProps.counts, visible: 5 }}
      />
    );

    expect(screen.getByTestId("active-filter-count")).toHaveTextContent("2");
  });
});
