/**
 * @file CaseHeader tests
 * @description Tests for slim case header with inline editing
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaseHeader } from "./case-header";
import type { Case } from "@/types/cases";

// Mock the hooks
vi.mock("@/hooks/use-documents", () => ({
  useDocumentsWithStatus: vi.fn(() => ({
    data: [
      { id: "doc-1", is_reviewed: true },
      { id: "doc-2", is_reviewed: false },
      { id: "doc-3", is_reviewed: true },
    ],
    isLoading: false,
  })),
}));

const baseCase: Case = {
  id: "case-1",
  case_name: "Test Case",
  case_ref: "TC-001",
  description: null,
  case_opened_at: "2026-01-15T00:00:00Z",
  event_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: "user-1",
  validation_review_completed_at: null,
  validation_review_completed_by: null,
};

describe("CaseHeader", () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Read Mode", () => {
    it("displays case name as title", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      expect(
        screen.getByRole("heading", { name: "Test Case" })
      ).toBeInTheDocument();
    });

    it("shows edit button", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      expect(
        screen.getByRole("button", { name: /edit case/i })
      ).toBeInTheDocument();
    });

    it("displays created date", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      expect(screen.getByText(/created/i)).toBeInTheDocument();
      expect(screen.getByText(/15 jan 2026/i)).toBeInTheDocument();
    });

    it("displays reviewed badge with correct count", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      // Mock returns 3 documents, 2 reviewed
      expect(screen.getByText(/reviewed/i)).toBeInTheDocument();
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
    });
  });

  describe("Edit Mode", () => {
    it("enters edit mode when edit button is clicked", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /edit case/i }));

      // Should show form fields
      expect(screen.getByLabelText(/case name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/case reference/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it("calls onSave with updated data when save is clicked", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit case/i }));

      // Update case name
      const nameInput = screen.getByLabelText(/case name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Case Name" } });

      // Save
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          case_name: "Updated Case Name",
        })
      );
    });

    it("reverts changes when cancel is clicked", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={false}
        />
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit case/i }));

      // Update case name
      const nameInput = screen.getByLabelText(/case name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Case Name" } });

      // Cancel
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      // Should be back to read mode with original name
      expect(
        screen.getByRole("heading", { name: "Test Case" })
      ).toBeInTheDocument();
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it("disables save button when isSaving is true", () => {
      render(
        <CaseHeader
          caseId="case-1"
          caseData={baseCase}
          onSave={mockOnSave}
          isSaving={true}
        />
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit case/i }));

      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
  });
});
