/**
 * @file Tests for ReviewActions component
 * @description Tests for review toggle button
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewActions } from "./review-actions";

describe("ReviewActions", () => {
  const mockOnToggleReviewed = vi.fn();

  const defaultProps = {
    isReviewed: false,
    onToggleReviewed: mockOnToggleReviewed,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Mark reviewed' button when not reviewed", () => {
    render(<ReviewActions {...defaultProps} />);

    const button = screen.getByRole("button", { name: /Mark reviewed/i });
    expect(button).toBeInTheDocument();
  });

  it("renders 'Reviewed' button with check icon when reviewed", () => {
    render(<ReviewActions {...defaultProps} isReviewed={true} />);

    const button = screen.getByRole("button", { name: /Reviewed/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onToggleReviewed when clicking 'Mark reviewed'", async () => {
    const user = userEvent.setup();
    render(<ReviewActions {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /Mark reviewed/i }));

    expect(mockOnToggleReviewed).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleReviewed when clicking reviewed button to unmark", async () => {
    const user = userEvent.setup();
    render(<ReviewActions {...defaultProps} isReviewed={true} />);

    await user.click(screen.getByRole("button", { name: /Reviewed/i }));

    expect(mockOnToggleReviewed).toHaveBeenCalledTimes(1);
  });

  it("has different visual style when reviewed vs not reviewed", () => {
    const { rerender } = render(<ReviewActions {...defaultProps} />);

    // Not reviewed: foreground style
    const unreviewedButton = screen.getByRole("button");
    expect(unreviewedButton).toHaveClass("bg-foreground");

    rerender(<ReviewActions {...defaultProps} isReviewed={true} />);

    // Reviewed: emerald style
    const reviewedButton = screen.getByRole("button");
    expect(reviewedButton).toHaveClass("bg-success");
  });
});
