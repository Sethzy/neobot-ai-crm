/**
 * Tests for SplitResultsPane component.
 * @module components/documents/split-results-pane.test
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SplitResultsPane } from "./split-results-pane";

const mockSplits = [
  {
    observation: "First invoice",
    startPage: 1,
    endPage: 2,
    type: "invoices" as const,
    identifier: "INV-001",
    document_date: "2023-09-19",
    potential_duplicate: null,
  },
  {
    observation: "Second invoice",
    startPage: 3,
    endPage: 4,
    type: "invoices" as const,
    identifier: "INV-002",
    document_date: "2023-09-20",
    potential_duplicate: null,
  },
];

describe("SplitResultsPane", () => {
  it("renders header with split count", () => {
    render(<SplitResultsPane splits={mockSplits} onPageClick={() => {}} />);

    expect(screen.getByText("Splitter Results")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("renders all split cards", () => {
    render(<SplitResultsPane splits={mockSplits} onPageClick={() => {}} />);

    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.getByText("INV-002")).toBeInTheDocument();
  });

  it("passes onPageClick to SplitCard", () => {
    const handleClick = vi.fn();
    render(<SplitResultsPane splits={mockSplits} onPageClick={handleClick} />);

    // Click first card
    fireEvent.click(screen.getByText("INV-001").closest(".rounded-lg")!);

    expect(handleClick).toHaveBeenCalledWith(1);
  });

  it("renders empty state when no splits", () => {
    render(<SplitResultsPane splits={[]} onPageClick={() => {}} />);

    expect(screen.getByText("(0)")).toBeInTheDocument();
    expect(screen.getByText("No splits found")).toBeInTheDocument();
  });

  it("renders document type summary when tags provided", () => {
    const mockTags = {
      reports: 6,
      invoices: 5,
      contracts: 1,
      correspondence: 1,
    };
    render(
      <SplitResultsPane
        splits={mockSplits}
        tags={mockTags}
        onPageClick={() => {}}
      />
    );

    expect(screen.getByText(/6 reports/)).toBeInTheDocument();
    expect(screen.getByText(/5 invoices/)).toBeInTheDocument();
    expect(screen.getByText(/1 contract/)).toBeInTheDocument();
    expect(screen.getByText(/1 correspondence/)).toBeInTheDocument();
  });

  it("does not render summary when tags is null", () => {
    render(
      <SplitResultsPane
        splits={mockSplits}
        tags={null}
        onPageClick={() => {}}
      />
    );

    expect(screen.queryByText(/reports/)).not.toBeInTheDocument();
  });

  it("renders duplicate summary when splits have potential_duplicate", () => {
    const splitsWithDuplicates = [
      { ...mockSplits[0], potential_duplicate: null },
      { ...mockSplits[1], potential_duplicate: "Duplicate of pages 1", startPage: 3, endPage: 3 },
      {
        observation: "Third split",
        startPage: 7,
        endPage: 7,
        type: "reports" as const,
        identifier: null,
        document_date: null,
        potential_duplicate: "Final version of draft",
      },
    ];
    render(
      <SplitResultsPane splits={splitsWithDuplicates} onPageClick={() => {}} />
    );

    expect(screen.getByText(/Potential duplicates on pages 3, 7/)).toBeInTheDocument();
  });

  it("does not render duplicate summary when no splits have potential_duplicate", () => {
    render(<SplitResultsPane splits={mockSplits} onPageClick={() => {}} />);

    expect(screen.queryByText(/Potential duplicates/)).not.toBeInTheDocument();
  });
});
