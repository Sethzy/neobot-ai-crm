/**
 * @file ExtractionList component tests
 * @description Tests for scrollable list of extraction cards with filtering
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExtractionList } from "./extraction-list";
import { HighlightProvider } from "@/contexts/highlight-context";
import type { SplitExtraction } from "@/types/extraction";

/** Wrapper with required providers */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HighlightProvider>{children}</HighlightProvider>
    </QueryClientProvider>
  );
};

describe("ExtractionList", () => {
  const mockOnCardClick = vi.fn();

  const mockSplits: SplitExtraction[] = [
    {
      id: "split-1",
      documentId: "doc-1",
      splitIndex: 0,
      startPage: 1,
      endPage: 2,
      tagId: "invoices",
      identifier: "INV-001",
      documentDate: "2024-01-15",
      potentialDuplicate: null,
      observation: "Test",
      extendProcessorId: "dp_001",
      extractedData: { total: 100 },
      originalExtractedData: { total: 100 },
      extractionMetadata: { total: { ocrConfidence: 0.95 } },
      extractionStatus: "complete",
      extractionError: null,
      validationFailures: [],
      lowConfidenceFields: [],
      dismissedRuleIds: [],
      pageWidth: 612,
      pageHeight: 792,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
    },
    {
      id: "split-2",
      documentId: "doc-1",
      splitIndex: 1,
      startPage: 3,
      endPage: 5,
      tagId: "reports",
      identifier: null,
      documentDate: null,
      potentialDuplicate: null,
      observation: "Test",
      extendProcessorId: "dp_002",
      extractedData: { summary: "Report" },
      originalExtractedData: { summary: "Report" },
      extractionMetadata: { summary: { ocrConfidence: 0.72 } },
      extractionStatus: "needs_review",
      extractionError: null,
      validationFailures: [],
      lowConfidenceFields: [{ field: "summary", ocrConfidence: 0.72 }],
      dismissedRuleIds: [],
      pageWidth: 612,
      pageHeight: 792,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
    },
  ];

  const defaultProps = {
    splits: mockSplits,
    onCardClick: mockOnCardClick,
  };

  it("renders DocumentNavigator with total count", () => {
    render(<ExtractionList {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByText("2 documents")).toBeInTheDocument();
  });

  it("shows type breakdown in DocumentNavigator popover when clicked", async () => {
    render(<ExtractionList {...defaultProps} />, { wrapper: createWrapper() });
    // Click to open popover
    fireEvent.click(screen.getByText("2 documents"));
    // Verify types shown in popover (also appear in cards, so use getAllByText)
    const invoicesElements = await screen.findAllByText("Invoices");
    const reportsElements = await screen.findAllByText("Reports");
    // Should have at least 2 each (popover + card)
    expect(invoicesElements.length).toBeGreaterThanOrEqual(2);
    expect(reportsElements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders FieldFilter button", () => {
    render(<ExtractionList {...defaultProps} />, { wrapper: createWrapper() });
    // Filter button should be visible
    expect(screen.getByRole("button", { name: /filter fields/i })).toBeInTheDocument();
  });

  it("shows filter options in dropdown when clicked", async () => {
    const user = userEvent.setup();
    render(<ExtractionList {...defaultProps} />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /filter fields/i }));

    expect(screen.getByText("Low confidence fields")).toBeInTheDocument();
    expect(screen.getByText("Needs review fields")).toBeInTheDocument();
    expect(screen.getByText("Non-null fields")).toBeInTheDocument();
  });

  it("filters to show only low confidence fields when selected", async () => {
    const user = userEvent.setup();
    render(<ExtractionList {...defaultProps} />, { wrapper: createWrapper() });

    // Both cards visible initially
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();

    // Open filter dropdown and select low confidence
    await user.click(screen.getByRole("button", { name: /filter fields/i }));
    await user.click(screen.getByLabelText("Low confidence fields"));

    // Only reports card (which has low confidence field) should be visible
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });

  it("shows empty message when no extractions", () => {
    render(<ExtractionList {...defaultProps} splits={[]} />, { wrapper: createWrapper() });
    expect(screen.getByText("No extractions available")).toBeInTheDocument();
  });
});

describe("ExtractionList - multi-filter logic", () => {
  const mockOnCardClick = vi.fn();

  const createMockSplit = (overrides: Partial<SplitExtraction> = {}): SplitExtraction => ({
    id: "split-1",
    documentId: "doc-1",
    splitIndex: 0,
    startPage: 1,
    endPage: 1,
    tagId: "invoices",
    identifier: null,
    documentDate: null,
    potentialDuplicate: null,
    observation: null,
    extendProcessorId: "dp_test",
    extractedData: { field1: "value1", field2: null },
    originalExtractedData: { field1: "value1", field2: null },
    extractionMetadata: {
      field1: { ocrConfidence: 0.95 },
      field2: { ocrConfidence: 0.5 },
    },
    extractionStatus: "complete",
    extractionError: null,
    validationFailures: null,
    lowConfidenceFields: [{ field: "field2", ocrConfidence: 0.5 }],
    dismissedRuleIds: [],
    pageWidth: 612,
    pageHeight: 792,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  });

  it("filters to show only fields with validation failures when selected", async () => {
    const user = userEvent.setup();
    const splitWithFailures = createMockSplit({
      id: "split-with-failures",
      validationFailures: [
        { ruleId: "rule1", ruleName: "Rule 1", message: "Failure", description: "Field validation rule", field: "field1" },
      ],
    });
    const splitNoFailures = createMockSplit({
      id: "split-no-failures",
      tagId: "reports",
      validationFailures: null,
    });

    render(
      <ExtractionList
        splits={[splitWithFailures, splitNoFailures]}
        onCardClick={mockOnCardClick}
      />,
      { wrapper: createWrapper() }
    );

    // Both cards visible initially
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();

    // Open filter dropdown and select needs review
    await user.click(screen.getByRole("button", { name: /filter fields/i }));
    await user.click(screen.getByLabelText("Needs review fields"));

    // Only invoices card (which has validation failure) should be visible
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
  });

  it("uses OR logic when multiple filters selected", async () => {
    const user = userEvent.setup();
    // Split 1: has validation failure on field1, high confidence
    const split1 = createMockSplit({
      id: "split-1",
      tagId: "invoices",
      extractedData: { field1: "value" },
      extractionMetadata: { field1: { ocrConfidence: 0.95 } },
      validationFailures: [
        { ruleId: "rule1", ruleName: "Rule 1", message: "Failure", description: "Field validation rule", field: "field1" },
      ],
    });
    // Split 2: no validation failure, low confidence
    const split2 = createMockSplit({
      id: "split-2",
      tagId: "reports",
      extractedData: { field2: "value" },
      extractionMetadata: { field2: { ocrConfidence: 0.5 } },
      lowConfidenceFields: [{ field: "field2", ocrConfidence: 0.5 }],
      validationFailures: null,
    });
    // Split 3: neither low confidence nor validation failure
    const split3 = createMockSplit({
      id: "split-3",
      tagId: "contracts",
      extractedData: { field3: "value" },
      extractionMetadata: { field3: { ocrConfidence: 0.95 } },
      lowConfidenceFields: [],
      validationFailures: null,
    });

    render(
      <ExtractionList
        splits={[split1, split2, split3]}
        onCardClick={mockOnCardClick}
      />,
      { wrapper: createWrapper() }
    );

    // Open filter and select both low confidence AND needs review
    await user.click(screen.getByRole("button", { name: /filter fields/i }));
    await user.click(screen.getByLabelText("Low confidence fields"));
    await user.click(screen.getByLabelText("Needs review fields"));

    // Split 1 (validation failure) and Split 2 (low confidence) should be visible
    // Split 3 (neither) should be hidden
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.queryByText("Contracts")).not.toBeInTheDocument();
  });
});

describe("ExtractionList - editable mode", () => {
  const mockOnCardClick = vi.fn();
  const mockOnFieldValueChange = vi.fn();

  const mockSplits: SplitExtraction[] = [
    {
      id: "split-1",
      documentId: "doc-1",
      splitIndex: 0,
      startPage: 1,
      endPage: 2,
      tagId: "invoices",
      identifier: "INV-001",
      documentDate: "2024-01-15",
      potentialDuplicate: null,
      observation: "Test",
      extendProcessorId: "dp_001",
      extractedData: { total: 100 },
      originalExtractedData: { total: 100 },
      extractionMetadata: { total: { ocrConfidence: 0.95 } },
      extractionStatus: "complete",
      extractionError: null,
      validationFailures: [],
      lowConfidenceFields: [],
      dismissedRuleIds: [],
      pageWidth: 612,
      pageHeight: 792,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
    },
  ];

  it("passes onFieldValueChange to ExtractionCard", () => {
    render(
      <ExtractionList
        splits={mockSplits}
        onCardClick={mockOnCardClick}
        onFieldValueChange={mockOnFieldValueChange}
      />,
      { wrapper: createWrapper() }
    );

    // Find an input (indicates edit mode is enabled)
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThan(0);
  });
});
