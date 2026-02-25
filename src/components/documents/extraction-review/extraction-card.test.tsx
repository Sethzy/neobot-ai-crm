/**
 * @file ExtractionCard tests
 * @description Tests for extraction card displaying split with fields
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtractionCard, arePropsEqual } from "./extraction-card";
import { HighlightProvider } from "@/contexts/highlight-context";
import type { SplitExtraction } from "@/types/extraction";

/** Wrapper with required providers */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HighlightProvider>{children}</HighlightProvider>
);

describe("ExtractionCard", () => {
  const mockOnCardClick = vi.fn();

  const mockSplit: SplitExtraction = {
    id: "split-123",
    documentId: "doc-456",
    splitIndex: 0,
    startPage: 1,
    endPage: 3,
    tagId: "invoices",
    identifier: "INV-001",
    documentDate: "2024-01-15",
    potentialDuplicate: null,
    observation: "Standard invoice",
    extendProcessorId: "dp_invoice_001",
    extractedData: { total: 100, vendor: "Acme Corp" },
    originalExtractedData: { total: 100, vendor: "Acme Corp" },
    extractionMetadata: {
      total: { ocrConfidence: 0.95 },
      vendor: { ocrConfidence: 0.99 },
    },
    extractionStatus: "complete",
    extractionError: null,
    validationFailures: [],
    lowConfidenceFields: [],
    dismissedRuleIds: [],
    pageWidth: null,
    pageHeight: null,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  };

  const defaultProps = {
    split: mockSplit,
    onCardClick: mockOnCardClick,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders split type badge and page range", () => {
    render(<ExtractionCard {...defaultProps} />, { wrapper });

    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Pages 1-3")).toBeInTheDocument();
  });

  it("renders extraction fields from extractedData", () => {
    render(<ExtractionCard {...defaultProps} />, { wrapper });

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows no fields message when extractedData is null", () => {
    const splitNoData: SplitExtraction = {
      ...mockSplit,
      extractedData: null,
    };

    render(<ExtractionCard {...defaultProps} split={splitNoData} />, { wrapper });

    // When no fields exist, shows the filter message
    expect(screen.getByText("No fields match the current filter")).toBeInTheDocument();
  });

  it("calls onCardClick with startPage when header is clicked", () => {
    render(<ExtractionCard {...defaultProps} />, { wrapper });

    const header = screen.getByText("Invoices").closest("div");
    fireEvent.click(header!);

    expect(mockOnCardClick).toHaveBeenCalledWith(1);
  });
});

describe("ExtractionCard - metadata extraction", () => {
  const mockOnCardClick = vi.fn();

  const baseSplit: SplitExtraction = {
    id: "split-123",
    documentId: "doc-456",
    splitIndex: 0,
    startPage: 1,
    endPage: 1,
    tagId: "invoices",
    identifier: "INV-001",
    documentDate: "2024-01-15",
    potentialDuplicate: null,
    observation: null,
    extendProcessorId: "dp_invoice_001",
    extractedData: { patient_name: "John Doe" },
    originalExtractedData: { patient_name: "John Doe" },
    extractionMetadata: {
      patient_name: { ocrConfidence: 0.95 },
    },
    extractionStatus: "complete",
    extractionError: null,
    validationFailures: [],
    lowConfidenceFields: [],
    dismissedRuleIds: [],
    pageWidth: null,
    pageHeight: null,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts reasoning from insights", () => {
    const splitWithInsights: SplitExtraction = {
      ...baseSplit,
      extractionMetadata: {
        patient_name: {
          ocrConfidence: 0.95,
          insights: [{ type: "reasoning", content: "Found in header" }],
        },
      },
    };

    render(
      <ExtractionCard
        split={splitWithInsights}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    expect(screen.getByText("Found in header")).toBeInTheDocument();
  });

  it("extracts citation texts from metadata", () => {
    const splitWithCitations: SplitExtraction = {
      ...baseSplit,
      extractionMetadata: {
        patient_name: {
          ocrConfidence: 0.95,
          citations: [
            { page: 1, referenceText: "Patient: John Doe" },
            { page: 1, referenceText: "Name: John Doe" },
          ],
        },
      },
    };

    render(
      <ExtractionCard
        split={splitWithCitations}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    expect(screen.getByText("Patient: John Doe")).toBeInTheDocument();
    expect(screen.getByText("Name: John Doe")).toBeInTheDocument();
  });

  it("removes orange background for needs review", () => {
    const splitNeedsReview: SplitExtraction = {
      ...baseSplit,
      extractionStatus: "needs_review",
      lowConfidenceFields: [{ field: "patient_name", ocrConfidence: 0.5 }],
    };

    const { container } = render(
      <ExtractionCard
        split={splitNeedsReview}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain("bg-yellow");
  });

  it("detects currency type from value", () => {
    const splitWithCurrency: SplitExtraction = {
      ...baseSplit,
      extractedData: {
        total_amount: { amount: 187.3, iso_4217_currency_code: "SGD" },
      },
      originalExtractedData: {
        total_amount: { amount: 187.3, iso_4217_currency_code: "SGD" },
      },
      extractionMetadata: {
        total_amount: { ocrConfidence: 0.95 },
      },
    };

    render(
      <ExtractionCard
        split={splitWithCurrency}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    // Should show currency value with symbol prefix (e.g., "S$ SGD")
    expect(screen.getByText("S$ SGD")).toBeInTheDocument();
    // Should show amount (187.3 as defined in test data)
    expect(screen.getByText("187.3")).toBeInTheDocument();
  });
});

// Note: Field-level filtering removed in favor of card-level filtering only.
// Users can drill down using in-table "low conf" badge for arrays.

describe("ExtractionCard - validationFailures passthrough", () => {
  const mockOnCardClick = vi.fn();

  const mockSplit: SplitExtraction = {
    id: "split-123",
    documentId: "doc-456",
    splitIndex: 0,
    startPage: 1,
    endPage: 1,
    tagId: "medical_expense",
    identifier: null,
    documentDate: null,
    potentialDuplicate: null,
    observation: null,
    extendProcessorId: "dp_test",
    extractedData: { test_field: "value" },
    originalExtractedData: { test_field: "value" },
    extractionMetadata: {
      test_field: { ocrConfidence: 0.95 },
    },
    extractionStatus: "needs_review",
    extractionError: null,
    validationFailures: [
      {
        ruleId: "test_rule",
        ruleName: "Test Rule",
        message: "Test failure message",
        description: "Test field validation rule",
        field: "test_field",
      },
    ],
    lowConfidenceFields: null,
    dismissedRuleIds: [],
    pageWidth: 612,
    pageHeight: 792,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass validationFailures to ExtractionField showing Needs review badge", () => {
    render(
      <ExtractionCard
        split={mockSplit}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    // The "Needs review" badge should appear on the field with validation failures
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("should NOT show Needs review badge when no validation failures", () => {
    const splitNoFailures: SplitExtraction = {
      ...mockSplit,
      validationFailures: [],
    };

    render(
      <ExtractionCard
        split={splitNoFailures}
        onCardClick={mockOnCardClick}
      />,
      { wrapper }
    );

    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
  });
});

describe("ExtractionCard - memo optimization", () => {
  const mockOnCardClick = vi.fn();

  const createMockSplit = (overrides?: Partial<SplitExtraction>): SplitExtraction => ({
    id: "split-123",
    documentId: "doc-456",
    splitIndex: 0,
    startPage: 1,
    endPage: 1,
    tagId: "medical_expense",
    identifier: null,
    documentDate: null,
    potentialDuplicate: null,
    observation: null,
    extendProcessorId: "dp_test",
    extractedData: { amount: 100 },
    originalExtractedData: { amount: 100 },
    extractionMetadata: { amount: { ocrConfidence: 0.95 } },
    extractionStatus: "complete",
    extractionError: null,
    validationFailures: [],
    lowConfidenceFields: null,
    pageWidth: 612,
    pageHeight: 792,
    dismissedRuleIds: [],
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("arePropsEqual comparator", () => {
    it("should return true (skip re-render) when split has new reference but same data", () => {
      const split1 = createMockSplit();
      const split2 = createMockSplit(); // Same data, different object reference

      // Verify they are different references
      expect(split1).not.toBe(split2);

      const result = arePropsEqual(
        { split: split1, onCardClick: mockOnCardClick },
        { split: split2, onCardClick: mockOnCardClick }
      );

      // Should skip re-render because data is identical
      expect(result).toBe(true);
    });

    it("should return false (re-render) when extractedData changes", () => {
      const split1 = createMockSplit({ extractedData: { amount: 100 } });
      const split2 = createMockSplit({ extractedData: { amount: 200 } });

      const result = arePropsEqual(
        { split: split1, onCardClick: mockOnCardClick },
        { split: split2, onCardClick: mockOnCardClick }
      );

      expect(result).toBe(false);
    });

    it("should return false (re-render) when dismissedRuleIds changes", () => {
      const split = createMockSplit();

      const result = arePropsEqual(
        { split, onCardClick: mockOnCardClick, dismissedRuleIds: [] },
        { split, onCardClick: mockOnCardClick, dismissedRuleIds: ["rule-1"] }
      );

      expect(result).toBe(false);
    });

    it("should return false (re-render) when fieldFilters changes", () => {
      const split = createMockSplit();

      const result = arePropsEqual(
        { split, onCardClick: mockOnCardClick, fieldFilters: { lowConfidence: false, needsReview: false, nonNull: false } },
        { split, onCardClick: mockOnCardClick, fieldFilters: { lowConfidence: true, needsReview: false, nonNull: false } }
      );

      expect(result).toBe(false);
    });

    it("should return false (re-render) when split.id changes", () => {
      const split1 = createMockSplit({ id: "split-1" });
      const split2 = createMockSplit({ id: "split-2" });

      const result = arePropsEqual(
        { split: split1, onCardClick: mockOnCardClick },
        { split: split2, onCardClick: mockOnCardClick }
      );

      expect(result).toBe(false);
    });
  });
});

describe("ExtractionCard - editable fields", () => {
  const mockOnCardClick = vi.fn();
  const mockOnFieldValueChange = vi.fn();

  const mockSplit: SplitExtraction = {
    id: "split-123",
    documentId: "doc-456",
    splitIndex: 0,
    startPage: 1,
    endPage: 3,
    tagId: "invoices",
    identifier: "INV-001",
    documentDate: "2024-01-15",
    potentialDuplicate: null,
    observation: "Standard invoice",
    extendProcessorId: "dp_invoice_001",
    extractedData: { total: 100, vendor: "Acme Corp" },
    originalExtractedData: { total: 100, vendor: "Acme Corp" },
    extractionMetadata: {
      total: { ocrConfidence: 0.95 },
      vendor: { ocrConfidence: 0.99 },
    },
    extractionStatus: "complete",
    extractionError: null,
    validationFailures: [],
    lowConfidenceFields: [],
    dismissedRuleIds: [],
    pageWidth: null,
    pageHeight: null,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders editable inputs when onFieldValueChange is provided", () => {
    render(
      <ExtractionCard
        split={mockSplit}
        onCardClick={mockOnCardClick}
        onFieldValueChange={mockOnFieldValueChange}
      />,
      { wrapper }
    );

    // Should find text inputs for editable fields
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(0);
  });
});
