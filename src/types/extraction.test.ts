// src/types/extraction.test.ts
import { describe, expect, it } from "vitest";
import {
  CitationSchema,
  FieldMetadataSchema,
  SplitExtractionSchema,
  InsightSchema,
  isLowConfidence,
  splitNeedsReview,
  CONFIDENCE_THRESHOLD,
  type Citation,
  type FieldMetadata,
  type SplitExtraction,
} from "./extraction";

describe("InsightSchema", () => {
  it("parses valid reasoning insight", () => {
    const input = { type: "reasoning", content: "AI reasoning here" };
    const result = InsightSchema.parse(input);
    expect(result.type).toBe("reasoning");
    expect(result.content).toBe("AI reasoning here");
  });

  it("parses insight with optional fields", () => {
    const input = { type: "observation", content: "note" };
    const result = InsightSchema.parse(input);
    expect(result.type).toBe("observation");
  });
});

describe("CitationSchema", () => {
  it("validates citation with all fields", () => {
    const citation: Citation = {
      page: 1,
      referenceText: "Invoice #12345",
      polygon: [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 250 },
        { x: 100, y: 250 },
      ],
    };

    const result = CitationSchema.safeParse(citation);
    expect(result.success).toBe(true);
  });
});

describe("FieldMetadataSchema", () => {
  it("validates metadata with ocrConfidence and citations", () => {
    const metadata: FieldMetadata = {
      ocrConfidence: 0.95,
      citations: [{ page: 1, referenceText: "Test" }],
    };

    const result = FieldMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it("validates metadata with null ocrConfidence", () => {
    const metadata: FieldMetadata = {
      ocrConfidence: null,
    };

    const result = FieldMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });
});

describe("SplitExtractionSchema", () => {
  it("validates complete split extraction", () => {
    const split: SplitExtraction = {
      id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      documentId: "f1e2d3c4-b5a6-4890-8cba-987654321fed",
      splitIndex: 0,
      startPage: 1,
      endPage: 3,
      tagId: "invoices",
      identifier: "INV-001",
      documentDate: "2024-01-15",
      potentialDuplicate: null,
      observation: "Standard invoice document",
      extendProcessorId: "dp_invoice_001",
      extractedData: { total: 100, vendor: "Acme" },
      originalExtractedData: { total: 100, vendor: "Acme" },
      extractionMetadata: {
        total: { ocrConfidence: 0.95 },
        vendor: { ocrConfidence: 0.99 },
      },
      extractionStatus: "complete",
      extractionError: null,
      validationFailures: [],
      lowConfidenceFields: [],
      dismissedRuleIds: [],
      pageWidth: 612,
      pageHeight: 792,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
    };

    const result = SplitExtractionSchema.safeParse(split);
    expect(result.success).toBe(true);
  });

  it("validates split with needs_review status", () => {
    const split: SplitExtraction = {
      id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      documentId: "f1e2d3c4-b5a6-4890-8cba-987654321fed",
      splitIndex: 0,
      startPage: 1,
      endPage: 1,
      tagId: "invoices",
      identifier: null,
      documentDate: null,
      potentialDuplicate: "Blurry scan",
      observation: "Poor quality scan",
      extendProcessorId: "dp_invoice_001",
      extractedData: { total: 100 },
      originalExtractedData: { total: 100 },
      extractionMetadata: { total: { ocrConfidence: 0.72 } },
      extractionStatus: "needs_review",
      extractionError: null,
      validationFailures: [],
      lowConfidenceFields: [{ field: "total", ocrConfidence: 0.72 }],
      dismissedRuleIds: [],
      pageWidth: null,
      pageHeight: null,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
    };

    const result = SplitExtractionSchema.safeParse(split);
    expect(result.success).toBe(true);
  });
});

describe("isLowConfidence", () => {
  it("returns true when confidence below threshold", () => {
    expect(isLowConfidence(0.70)).toBe(true);
  });

  it("returns false when confidence at threshold", () => {
    expect(isLowConfidence(0.85)).toBe(false);
  });

  it("returns false when confidence above threshold", () => {
    expect(isLowConfidence(0.99)).toBe(false);
  });

  it("returns false for null confidence", () => {
    expect(isLowConfidence(null)).toBe(false);
  });

  it("returns false for undefined confidence", () => {
    expect(isLowConfidence(undefined)).toBe(false);
  });
});

describe("splitNeedsReview", () => {
  it("returns true when split has needs_review status", () => {
    const split = { extractionStatus: "needs_review" } as SplitExtraction;
    expect(splitNeedsReview(split)).toBe(true);
  });

  it("returns true when split has low confidence fields", () => {
    const split = {
      extractionStatus: "complete",
      lowConfidenceFields: [{ field: "total", ocrConfidence: 0.7 }],
    } as SplitExtraction;
    expect(splitNeedsReview(split)).toBe(true);
  });

  it("returns true when split has validation failures", () => {
    const split = {
      extractionStatus: "complete",
      lowConfidenceFields: [],
      validationFailures: [{ ruleId: "req", ruleName: "Required", message: "Field required" }],
    } as unknown as SplitExtraction;
    expect(splitNeedsReview(split)).toBe(true);
  });

  it("returns false when split is complete with no issues", () => {
    const split = {
      extractionStatus: "complete",
      lowConfidenceFields: [],
      validationFailures: [],
    } as unknown as SplitExtraction;
    expect(splitNeedsReview(split)).toBe(false);
  });
});

describe("CONFIDENCE_THRESHOLD", () => {
  it("is 0.85", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.85);
  });
});
