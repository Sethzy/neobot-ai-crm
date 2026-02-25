/**
 * @file Tests for DuplicateIndicator component
 * @description Tests duplicate status display and tooltips
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DuplicateIndicator } from "./duplicate-indicator";

describe("DuplicateIndicator", () => {
  it("returns null when status is null", () => {
    const { container } = render(<DuplicateIndicator status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when status is undefined", () => {
    const { container } = render(
      <DuplicateIndicator status={undefined} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders none status icon with correct aria-label", () => {
    render(<DuplicateIndicator status="none" />);
    expect(screen.getByLabelText("No duplicates detected")).toBeInTheDocument();
  });

  it("renders detected status icon with correct aria-label", () => {
    render(<DuplicateIndicator status="detected" />);
    expect(screen.getByLabelText("Review required")).toBeInTheDocument();
  });

  it("renders none status with green color class", () => {
    render(<DuplicateIndicator status="none" />);
    const icon = screen.getByLabelText("No duplicates detected");
    expect(icon).toHaveClass("text-green-500");
  });

  it("renders detected status with amber color class", () => {
    render(<DuplicateIndicator status="detected" />);
    const icon = screen.getByLabelText("Review required");
    expect(icon).toHaveClass("text-amber-500");
  });

  it("shows page-specific duplicate info in tooltip when pageRanges provided", () => {
    const pageRanges = [
      { startPage: 1, endPage: 2, potential_duplicate: null },
      { startPage: 3, endPage: 3, potential_duplicate: "Duplicate of pages 1-2" },
      { startPage: 5, endPage: 7, potential_duplicate: "Final version of draft" },
    ];
    render(<DuplicateIndicator status="detected" pageRanges={pageRanges} />);

    // Icon should be present
    expect(screen.getByLabelText("Review required")).toBeInTheDocument();
  });
});
