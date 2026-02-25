/**
 * @file Tests for document navigator popover
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentNavigator } from "./document-navigator";
import type { SplitExtraction } from "@/types/extraction";

const mockSplits: SplitExtraction[] = [
  {
    id: "split-1",
    documentId: "doc-1",
    tagId: "medical_expense",
    startPage: 1,
    endPage: 2,
    splitIndex: 0,
    extractedData: {},
    originalExtractedData: {},
    extractionMetadata: {},
    pageWidth: 612,
    pageHeight: 792,
  },
  {
    id: "split-2",
    documentId: "doc-1",
    tagId: "income_document",
    startPage: 3,
    endPage: 3,
    splitIndex: 1,
    extractedData: {},
    originalExtractedData: {},
    extractionMetadata: {},
    pageWidth: 612,
    pageHeight: 792,
  },
] as SplitExtraction[];

describe("DocumentNavigator", () => {
  it("shows document count with icon", () => {
    render(
      <DocumentNavigator splits={mockSplits} onSplitSelect={vi.fn()} />
    );
    expect(screen.getByText("2 documents")).toBeInTheDocument();
  });

  it("shows singular 'document' for count of 1", () => {
    render(
      <DocumentNavigator splits={[mockSplits[0]]} onSplitSelect={vi.fn()} />
    );
    expect(screen.getByText("1 document")).toBeInTheDocument();
  });

  it("calls onSplitSelect when split is clicked", async () => {
    const onSplitSelect = vi.fn();
    render(
      <DocumentNavigator splits={mockSplits} onSplitSelect={onSplitSelect} />
    );

    // Open popover
    fireEvent.click(screen.getByText("2 documents"));

    // Click first split
    fireEvent.click(await screen.findByText("Medical expense"));

    expect(onSplitSelect).toHaveBeenCalledWith("split-1", 1);
  });

  it("formats page range correctly for single page", async () => {
    render(
      <DocumentNavigator splits={mockSplits} onSplitSelect={vi.fn()} />
    );

    fireEvent.click(screen.getByText("2 documents"));

    expect(await screen.findByText("Page 3")).toBeInTheDocument();
  });

  it("formats page range correctly for multiple pages", async () => {
    render(
      <DocumentNavigator splits={mockSplits} onSplitSelect={vi.fn()} />
    );

    fireEvent.click(screen.getByText("2 documents"));

    expect(await screen.findByText("Pages 1-2")).toBeInTheDocument();
  });
});
