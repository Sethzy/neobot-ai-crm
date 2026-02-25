/**
 * @file Tests for ValidationRulesSection component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationRulesSection } from "./validation-rules-section";

// Mock the hooks
vi.mock("@/hooks/use-splits", () => ({
  useCaseSplits: vi.fn(),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: vi.fn(),
}));

vi.mock("@/hooks/use-client-config", () => ({
  useClientConfigId: () => ({ data: "hoh-law", isLoading: false }),
}));

vi.mock("@/config/loader", () => ({
  getClientConfig: vi.fn(),
}));

import { useCaseSplits } from "@/hooks/use-splits";
import { useDocuments } from "@/hooks/use-documents";
import { getClientConfig } from "@/config/loader";

const mockUseCaseSplits = useCaseSplits as ReturnType<typeof vi.fn>;
const mockUseDocuments = useDocuments as ReturnType<typeof vi.fn>;
const mockGetClientConfig = getClientConfig as ReturnType<typeof vi.fn>;

describe("ValidationRulesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for useDocuments - returns empty array
    mockUseDocuments.mockReturnValue({ data: [] });
  });

  it("shows loading state while fetching splits", () => {
    mockUseCaseSplits.mockReturnValue({
      data: [],
      isLoading: true,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test-client",
      name: "Test Client",
      tags: [],
    });

    render(<ValidationRulesSection caseId="test-case-id" />);

    expect(screen.getByText("Loading validation rules...")).toBeInTheDocument();
  });

  it("shows 'no validation rules' message for tags without validate function", () => {
    mockUseCaseSplits.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test-client",
      name: "Test Client",
      tags: [
        {
          id: "other",
          displayName: "Other",
          classificationHint: "Other docs",
          extendProcessorId: null,
          // No validate function
        },
      ],
    });

    render(<ValidationRulesSection caseId="test-case-id" />);

    expect(
      screen.getByText("No validation rules configured for this document type.")
    ).toBeInTheDocument();
  });

  it("shows green checkmark and passing count when all validations pass", () => {
    const mockValidate = vi.fn().mockReturnValue([
      {
        ruleId: "total_required",
        ruleName: "Total required",
        field: "total_amount",
        message: "Total is required",
      },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        {
          id: "split-1",
          documentId: "doc-1",
          tagId: "medical_expense",
          validationFailures: [], // No failures = all pass
        },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test-client",
      name: "Test Client",
      tags: [
        {
          id: "medical_expense",
          displayName: "Medical Expense",
          classificationHint: "Medical bills",
          extendProcessorId: "dp_test",
          validate: mockValidate,
        },
      ],
    });

    render(<ValidationRulesSection caseId="test-case-id" />);

    // Should show rule name
    expect(screen.getByText("Total required")).toBeInTheDocument();
    // Should show 0/1 failing (0 failing out of 1 doc)
    expect(screen.getByText("0/1")).toBeInTheDocument();
    // Should show "Passing" status
    expect(screen.getByText("Passing")).toBeInTheDocument();
  });

  it("shows amber warning and failure count when validations fail", () => {
    const mockValidate = vi.fn().mockReturnValue([
      {
        ruleId: "total_required",
        ruleName: "Total required",
        field: "total_amount",
        message: "Total is required",
      },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        {
          id: "split-1",
          documentId: "doc-1",
          tagId: "medical_expense",
          validationFailures: [
            {
              ruleId: "total_required",
              ruleName: "Total required",
              field: "total_amount",
              message: "Total is required",
            },
          ],
        },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test-client",
      name: "Test Client",
      tags: [
        {
          id: "medical_expense",
          displayName: "Medical Expense",
          classificationHint: "Medical bills",
          extendProcessorId: "dp_test",
          validate: mockValidate,
        },
      ],
    });

    render(<ValidationRulesSection caseId="test-case-id" />);

    // Should show 1/1 failing
    expect(screen.getByText("1/1")).toBeInTheDocument();
    // Should show issue count (appears in both header and accordion)
    expect(screen.getAllByText(/1 issue/).length).toBeGreaterThan(0);
  });

  it("shows 'All validations passing' when no failures across all splits", () => {
    const mockValidate = vi.fn().mockReturnValue([
      { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        { id: "s1", documentId: "d1", tagId: "t1", validationFailures: [] },
        { id: "s2", documentId: "d2", tagId: "t1", validationFailures: [] },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test",
      name: "Test",
      tags: [{ id: "t1", displayName: "Type 1", validate: mockValidate }],
    });

    render(<ValidationRulesSection caseId="case-1" />);

    expect(screen.getByText("All validations passing")).toBeInTheDocument();
  });

  it("shows issue count in header when failures exist", () => {
    const mockValidate = vi.fn().mockReturnValue([
      { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
      { ruleId: "r2", ruleName: "Rule 2", field: "f2", message: "m2" },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        {
          id: "s1",
          documentId: "d1",
          tagId: "t1",
          validationFailures: [
            { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
            { ruleId: "r2", ruleName: "Rule 2", field: "f2", message: "m2" },
          ],
        },
        {
          id: "s2",
          documentId: "d2",
          tagId: "t1",
          validationFailures: [
            { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
          ],
        },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test",
      name: "Test",
      tags: [{ id: "t1", displayName: "Type 1", validate: mockValidate }],
    });

    render(<ValidationRulesSection caseId="case-1" />);

    // 3 total failures across 2 docs
    expect(screen.getByText(/3 issues across 2 docs/)).toBeInTheDocument();
  });

  it("displays rule description when available", () => {
    const mockValidate = vi.fn().mockReturnValue([
      {
        ruleId: "total_required",
        ruleName: "Total required",
        field: "total_amount",
        message: "Total is required",
        description: "Insurance claims require full bill amount",
      },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        {
          id: "split-1",
          documentId: "doc-1",
          tagId: "medical_expense",
          validationFailures: [],
        },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test-client",
      name: "Test Client",
      tags: [
        {
          id: "medical_expense",
          displayName: "Medical Expense",
          validate: mockValidate,
        },
      ],
    });

    render(<ValidationRulesSection caseId="test-case-id" />);

    // Should show Description column header
    expect(screen.getByText("Description")).toBeInTheDocument();
    // Should show the description text
    expect(screen.getByText("Insurance claims require full bill amount")).toBeInTheDocument();
  });

  it("shows dash when description is missing", () => {
    const mockValidate = vi.fn().mockReturnValue([
      {
        ruleId: "date_required",
        ruleName: "Date required",
        field: "date",
        message: "Date is required",
        // No description
      },
    ]);

    mockUseCaseSplits.mockReturnValue({
      data: [
        {
          id: "split-1",
          documentId: "doc-1",
          tagId: "t1",
          validationFailures: [],
        },
      ],
      isLoading: false,
    });
    mockGetClientConfig.mockReturnValue({
      id: "test",
      name: "Test",
      tags: [{ id: "t1", displayName: "Type 1", validate: mockValidate }],
    });

    render(<ValidationRulesSection caseId="case-1" />);

    // Should show dash for missing description (may appear in multiple columns)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    // First dash should be in description column (has muted-foreground/50 class)
    expect(dashes[0]).toHaveClass("text-muted-foreground/50");
  });

  // =========================================================
  // Task 1: Field(s) column tests
  // =========================================================

  describe("field column", () => {
    it("renders single field as outline badge", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [],
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show field name in badge with outline variant
      const badge = screen.getByText("total_amount");
      expect(badge).toHaveAttribute("data-variant", "outline");
    });

    it("renders multiple fields as individual badges when <= 2", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "sum_check",
          ruleName: "Sum check",
          field: ["cash_amount", "total_amount"],
          message: "Amounts must sum correctly",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [],
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show both fields as separate badges
      expect(screen.getByText("cash_amount")).toBeInTheDocument();
      expect(screen.getByText("total_amount")).toBeInTheDocument();
    });

    it("renders '3 fields' badge with tooltip when > 2 fields", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "sum_check",
          ruleName: "Sum check",
          field: ["cash_amount", "insurance_amount", "total_amount"],
          message: "Amounts must sum correctly",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [],
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show "3 fields" badge instead of individual fields
      expect(screen.getByText("3 fields")).toBeInTheDocument();
    });
  });

  // =========================================================
  // Task 2: Documents badge tests
  // =========================================================

  describe("documents badge", () => {
    it("shows badge with doc count when documents are failing", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
          },
          {
            id: "split-2",
            documentId: "doc-2",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
          },
        ],
        isLoading: false,
      });
      mockUseDocuments.mockReturnValue({
        data: [
          { id: "doc-1", renamed_filename: "bill1.pdf", original_filename: "doc1.pdf" },
          { id: "doc-2", renamed_filename: "bill2.pdf", original_filename: "doc2.pdf" },
        ],
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show badge with "2 docs" text (find the one with data-variant)
      const badges = screen.getAllByText("2 docs");
      const badge = badges.find((el) => el.getAttribute("data-variant") === "secondary");
      expect(badge).toBeInTheDocument();
    });

    it("shows dash when no documents are failing", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [], // No failures
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show dash in documents column (multiple dashes may exist)
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it("badge uses secondary variant", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
          },
        ],
        isLoading: false,
      });
      mockUseDocuments.mockReturnValue({
        data: [
          { id: "doc-1", renamed_filename: "bill1.pdf", original_filename: "doc1.pdf" },
        ],
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Badge should have data-variant="secondary"
      const badges = screen.getAllByText("1 doc");
      const badge = badges.find((el) => el.getAttribute("data-variant") === "secondary");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("data-variant", "secondary");
    });
  });

  // =========================================================
  // Task 3: Scrollable container tests
  // =========================================================

  describe("scrollable container", () => {
    it("wraps table in scrollable container with max-height", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [],
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Table should be wrapped in a div with overflow-y-auto
      const table = screen.getByRole("table");
      const scrollContainer = table.parentElement;
      expect(scrollContainer).toHaveClass("overflow-y-auto");
      expect(scrollContainer).toHaveClass("max-h-[400px]");
    });

    it("table header has sticky positioning", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [],
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // thead should have sticky class
      const table = screen.getByRole("table");
      const thead = table.querySelector("thead");
      expect(thead).toHaveClass("sticky");
      expect(thead).toHaveClass("top-0");
    });
  });

  // =========================================================
  // Task 4: Dismissed rules filtering tests
  // =========================================================

  describe("dismissed rules filtering", () => {
    it("excludes dismissed rules from failure count", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
            dismissedRuleIds: ["total_required"], // Rule is dismissed
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show 0/1 failing (dismissed = not counted as failing)
      expect(screen.getByText("0/1")).toBeInTheDocument();
    });

    it("excludes dismissed rules from total issues count in header", () => {
      const mockValidate = vi.fn().mockReturnValue([
        { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
        { ruleId: "r2", ruleName: "Rule 2", field: "f2", message: "m2" },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "s1",
            documentId: "d1",
            tagId: "t1",
            validationFailures: [
              { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
              { ruleId: "r2", ruleName: "Rule 2", field: "f2", message: "m2" },
            ],
            dismissedRuleIds: ["r1"], // r1 is dismissed, r2 is not
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test",
        name: "Test",
        tags: [{ id: "t1", displayName: "Type 1", validate: mockValidate }],
      });

      render(<ValidationRulesSection caseId="case-1" />);

      // Should show "1 issue" not "2 issues" (r1 is dismissed)
      expect(screen.getByText(/1 issue across 1 doc/)).toBeInTheDocument();
    });

    it("excludes dismissed docs from failing docs list", () => {
      const mockValidate = vi.fn().mockReturnValue([
        {
          ruleId: "total_required",
          ruleName: "Total required",
          field: "total_amount",
          message: "Total is required",
        },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "split-1",
            documentId: "doc-1",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
            dismissedRuleIds: ["total_required"], // Dismissed
          },
          {
            id: "split-2",
            documentId: "doc-2",
            tagId: "medical_expense",
            validationFailures: [
              { ruleId: "total_required", ruleName: "Total required", field: "total_amount", message: "m" },
            ],
            dismissedRuleIds: [], // Not dismissed
          },
        ],
        isLoading: false,
      });
      mockUseDocuments.mockReturnValue({
        data: [
          { id: "doc-1", renamed_filename: "bill1.pdf", original_filename: "doc1.pdf" },
          { id: "doc-2", renamed_filename: "bill2.pdf", original_filename: "doc2.pdf" },
        ],
      });
      mockGetClientConfig.mockReturnValue({
        id: "test-client",
        name: "Test Client",
        tags: [
          {
            id: "medical_expense",
            displayName: "Medical Expense",
            validate: mockValidate,
          },
        ],
      });

      render(<ValidationRulesSection caseId="test-case-id" />);

      // Should show "1 doc" not "2 docs" (doc-1 dismissed)
      const badges = screen.getAllByText("1 doc");
      const badge = badges.find((el) => el.getAttribute("data-variant") === "secondary");
      expect(badge).toBeInTheDocument();
    });

    it("shows 'All validations passing' when all failures are dismissed", () => {
      const mockValidate = vi.fn().mockReturnValue([
        { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
      ]);

      mockUseCaseSplits.mockReturnValue({
        data: [
          {
            id: "s1",
            documentId: "d1",
            tagId: "t1",
            validationFailures: [
              { ruleId: "r1", ruleName: "Rule 1", field: "f1", message: "m1" },
            ],
            dismissedRuleIds: ["r1"], // All dismissed
          },
        ],
        isLoading: false,
      });
      mockGetClientConfig.mockReturnValue({
        id: "test",
        name: "Test",
        tags: [{ id: "t1", displayName: "Type 1", validate: mockValidate }],
      });

      render(<ValidationRulesSection caseId="case-1" />);

      // Should show "All validations passing" since all are dismissed
      expect(screen.getByText("All validations passing")).toBeInTheDocument();
    });
  });
});
