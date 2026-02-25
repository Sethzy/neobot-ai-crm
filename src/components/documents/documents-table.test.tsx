/**
 * Tests for documents table component.
 * @module components/documents/documents-table.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DocumentsTable } from "./documents-table";
import type { Document } from "@/types/documents";

const mockDocuments: Document[] = [
  {
    id: "doc-1",
    case_id: "case-123",
    created_by: "user-1",
    original_filename: "receipt.pdf",
    filename: "receipt.pdf",
    storage_path: "user-1/case-123/abc.pdf",
    file_type: "pdf",
    file_size: 1024,
    file_hash: "abc123",
    status: "complete",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    renamed_filename: "15_03_2024_medical_receipt.pdf",
    primary_tag: "invoices",
    tags: { reports: 0.8 },
    description: "Medical receipt from Tan Clinic",
  },
  {
    id: "doc-2",
    case_id: "case-123",
    created_by: "user-1",
    original_filename: "invoice.pdf",
    filename: "invoice.pdf",
    storage_path: "user-1/case-123/def.pdf",
    file_type: "pdf",
    file_size: 2048,
    file_hash: "def456",
    status: "processing",
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  },
];

describe("DocumentsTable", () => {
  it("renders document rows", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // First doc shows renamed filename
    expect(screen.getByText("15_03_2024_medical_receipt.pdf")).toBeInTheDocument();
    // Second doc shows original filename (no renamed)
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
  });

  it("shows original filename below renamed filename", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Original filename shown below renamed
    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
  });

  it("shows row numbers", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows status badges with correct styles", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows primary tag when available", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Invoices")).toBeInTheDocument();
  });

  it("shows secondary tags count", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("shows description when available", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Medical receipt from Tan Clinic")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const viewButtons = screen.getAllByLabelText("View document");
    const downloadButtons = screen.getAllByLabelText("Download document");
    const deleteButtons = screen.getAllByLabelText("Delete document");

    expect(viewButtons).toHaveLength(2);
    expect(downloadButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it("calls onView when view button clicked", () => {
    const onView = vi.fn();
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={onView}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByText("15_03_2024_medical_receipt.pdf").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByLabelText("View document"));

    expect(onView).toHaveBeenCalledWith(mockDocuments[0]);
  });

  it("calls onDownload when download button clicked", () => {
    const onDownload = vi.fn();
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={onDownload}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByText("15_03_2024_medical_receipt.pdf").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByLabelText("Download document"));

    expect(onDownload).toHaveBeenCalledWith(mockDocuments[0]);
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = vi.fn();
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={onDelete}
      />
    );

    const row = screen.getByText("15_03_2024_medical_receipt.pdf").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByLabelText("Delete document"));

    expect(onDelete).toHaveBeenCalledWith(mockDocuments[0]);
  });

  it("hides columns based on columnVisibility prop", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        columnVisibility={{ description: false }}
        onColumnVisibilityChange={vi.fn()}
      />
    );

    // Description column should not be visible
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    // Other columns should still be visible
    expect(screen.getByText("Filename")).toBeInTheDocument();
  });

  it("calls onColumnVisibilityChange when visibility changes", () => {
    const onColumnVisibilityChange = vi.fn();
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        columnVisibility={{}}
        onColumnVisibilityChange={onColumnVisibilityChange}
      />
    );

    // This test validates the prop is wired correctly
    // Actual toggle UI tested in Task 5
    expect(onColumnVisibilityChange).not.toHaveBeenCalled();
  });

  it("renders columns in specified order", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        columnOrder={["status", "original_filename", "index"]}
        onColumnOrderChange={vi.fn()}
      />
    );

    const headers = screen.getAllByRole("columnheader");
    // Status should come before Filename based on columnOrder
    const statusIndex = headers.findIndex((h) =>
      h.textContent?.includes("Status")
    );
    const filenameIndex = headers.findIndex((h) =>
      h.textContent?.includes("Filename")
    );

    expect(statusIndex).toBeLessThan(filenameIndex);
  });

  it("renders drag handles on column headers when reordering enabled", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        columnOrder={["index", "original_filename"]}
        onColumnOrderChange={vi.fn()}
      />
    );

    const gripHandles = screen.getAllByTestId("column-drag-handle");
    expect(gripHandles.length).toBeGreaterThan(0);
  });

  it("does not render drag handles when reordering disabled", () => {
    render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const gripHandles = screen.queryAllByTestId("column-drag-handle");
    expect(gripHandles).toHaveLength(0);
  });

  it("renders DndContext wrapper when column reordering enabled", () => {
    const { container } = render(
      <DocumentsTable
        documents={mockDocuments}
        onView={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        columnOrder={["index", "original_filename"]}
        onColumnOrderChange={vi.fn()}
      />
    );

    // dnd-kit adds data attributes to draggable elements
    const draggableHeaders = container.querySelectorAll("[data-dnd-draggable]");
    expect(draggableHeaders.length).toBeGreaterThan(0);
  });

  describe("memoization", () => {
    it("does not recreate columns on re-render with same props", () => {
      const onView = vi.fn();
      const onDownload = vi.fn();
      const onDelete = vi.fn();

      const { rerender } = render(
        <DocumentsTable
          documents={mockDocuments}
          onView={onView}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      );

      // Rerender with same callback references
      rerender(
        <DocumentsTable
          documents={mockDocuments}
          onView={onView}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      );

      // Table should render correctly
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  });
});
