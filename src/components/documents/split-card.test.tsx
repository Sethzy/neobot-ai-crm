/**
 * Tests for SplitCard component.
 * @module components/documents/split-card.test
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SplitCard } from "./split-card";

const mockSplit = {
  observation: "This is a medical invoice from the hospital.",
  startPage: 1,
  endPage: 2,
  type: "invoices" as const,
  identifier: "INV-12345",
  document_date: "2023-09-19",
  potential_duplicate: null,
};

describe("SplitCard", () => {
  it("renders type badge and page range", () => {
    render(<SplitCard split={mockSplit} onPageClick={() => {}} />);

    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Pages 1 - 2")).toBeInTheDocument();
  });

  it("renders identifier when present", () => {
    render(<SplitCard split={mockSplit} onPageClick={() => {}} />);

    const identifier = screen.getByText(/Identifier:/);
    expect(identifier).toBeInTheDocument();
    expect(identifier).toHaveTextContent("INV-12345");
  });

  it("hides identifier when null", () => {
    const splitWithoutId = { ...mockSplit, identifier: null };
    render(<SplitCard split={splitWithoutId} onPageClick={() => {}} />);

    expect(screen.queryByText(/Identifier:/)).not.toBeInTheDocument();
  });

  it("renders formatted date when present", () => {
    render(<SplitCard split={mockSplit} onPageClick={() => {}} />);

    const date = screen.getByText(/Date:/);
    expect(date).toBeInTheDocument();
    expect(date).toHaveTextContent("19 Sept 2023");
  });

  it("renders OCR warning when potential_duplicate present", () => {
    const splitWithOcr = { ...mockSplit, potential_duplicate: "Blurry scan on page 2" };
    render(<SplitCard split={splitWithOcr} onPageClick={() => {}} />);

    expect(screen.getByText("Blurry scan on page 2")).toBeInTheDocument();
  });

  it("shows notes collapsed by default, expands on click", () => {
    render(<SplitCard split={mockSplit} onPageClick={() => {}} />);

    // Notes collapsed - observation text not visible
    expect(screen.queryByText(mockSplit.observation)).not.toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText("Notes"));

    // Now observation visible
    expect(screen.getByText(mockSplit.observation)).toBeInTheDocument();
  });

  it("calls onPageClick with startPage when card clicked", () => {
    const handleClick = vi.fn();
    render(<SplitCard split={mockSplit} onPageClick={handleClick} />);

    // Click the card (find by badge text and get parent)
    fireEvent.click(screen.getByText("Invoices").closest("div")!);

    expect(handleClick).toHaveBeenCalledWith(1);
  });

  it("renders type label with current neutral typography", () => {
    render(<SplitCard split={mockSplit} onPageClick={() => {}} />);

    const label = screen.getByText("Invoices");
    expect(label).toHaveClass("text-sm", "font-semibold");
  });
});
