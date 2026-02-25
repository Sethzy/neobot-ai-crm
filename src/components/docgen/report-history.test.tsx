/**
 * Tests for ReportHistory component.
 * @module components/docgen/report-history.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportHistory, type ReportHistoryItem } from "./report-history";

// Mock the useDownloadReport hook
vi.mock("@/hooks/use-docgen", () => ({
  useDownloadReport: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// Mock useClientConfigId hook
vi.mock("@/hooks/use-client-config", () => ({
  useClientConfigId: () => ({ data: "test-config" }),
}));

// Mock getClientConfig to return test tags
vi.mock("@/config/loader", () => ({
  getClientConfig: () => ({
    tags: [
      { id: "medical_expense", displayName: "Medical Expense" },
      { id: "other", displayName: "Other" },
    ],
  }),
}));

describe("ReportHistory", () => {
  it("renders empty state when no reports", () => {
    render(<ReportHistory reports={[]} />);
    expect(screen.getByText(/no reports generated/i)).toBeInTheDocument();
  });

  it("renders empty state when reports is null", () => {
    render(<ReportHistory reports={null} />);
    expect(screen.getByText(/no reports generated/i)).toBeInTheDocument();
  });

  it("renders report list with names and download buttons", () => {
    const reports: ReportHistoryItem[] = [
      {
        id: "1",
        report_type: "quick_report",
        name: "Quick Report",
        file_path: "case-1/report.xlsx",
        splits_count: 10,
        tags_included: ["medical_expense"],
        generated_at: new Date().toISOString(),
      },
    ];

    render(<ReportHistory reports={reports} />);

    expect(screen.getByText("Quick Report")).toBeInTheDocument();
    // Summary shows tag names
    expect(screen.getByText("Medical Expense")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders multiple reports", () => {
    const reports: ReportHistoryItem[] = [
      {
        id: "1",
        report_type: "quick_report",
        name: "Quick Report",
        file_path: "case-1/export.xlsx",
        splits_count: 10,
        tags_included: ["medical_expense"],
        generated_at: new Date().toISOString(),
      },
      {
        id: "2",
        report_type: "ai_analysis",
        name: "AI Analysis",
        file_path: "case-1/analysis.xlsx",
        splits_count: 15,
        tags_included: ["medical_expense", "other"],
        generated_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
    ];

    render(<ReportHistory reports={reports} />);

    expect(screen.getByText("Quick Report")).toBeInTheDocument();
    expect(screen.getByText("AI Analysis")).toBeInTheDocument();
    // Summary shows tag names (text is split across elements)
    expect(screen.getByText("Medical Expense")).toBeInTheDocument();
    expect(screen.getByText("Medical Expense, Other")).toBeInTheDocument();
  });

  it("displays ai_summary when present", () => {
    const reports: ReportHistoryItem[] = [
      {
        id: "1",
        report_type: "ai_analysis",
        name: "AI Analysis",
        file_path: "case-1/analysis.xlsx",
        splits_count: 20,
        tags_included: ["medical_expense"],
        generated_at: new Date().toISOString(),
        ai_summary: "Analyzed 20 invoices totaling $4,230.",
      },
    ];

    render(<ReportHistory reports={reports} />);

    expect(screen.getByText(/Analyzed 20 invoices/)).toBeInTheDocument();
  });

  it("displays tag names for quick_report without ai_summary", () => {
    const reports: ReportHistoryItem[] = [
      {
        id: "1",
        report_type: "quick_report",
        name: "Quick Report",
        file_path: "case-1/export.xlsx",
        splits_count: 10,
        tags_included: ["medical_expense", "other"],
        generated_at: new Date().toISOString(),
        ai_summary: null,
      },
    ];

    render(<ReportHistory reports={reports} />);

    expect(screen.getByText("Quick Report")).toBeInTheDocument();
    // Should show tag names
    expect(screen.getByText("Medical Expense, Other")).toBeInTheDocument();
    // Should not have any text containing "Analyzed"
    expect(screen.queryByText(/Analyzed/)).not.toBeInTheDocument();
  });
});
