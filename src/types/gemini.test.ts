/**
 * @file Tests for Gemini API splitter v2 schemas
 * @description Validates Zod schemas used for Gemini structured output
 */
import { describe, expect, it } from "vitest";
import {
  DocumentTagEnumV2,
  SplitSchema,
  GeminiSplitterResponse,
  createSplitterSchema,
  DEFAULT_TAG_IDS,
  derivePrimaryTag,
  deriveTags,
  deriveDuplicateStatus,
  deriveIsHeterogeneous,
  deriveDocumentDate,
  sanitizeFilename,
  mapSplitterResponseToDocument,
} from "./gemini";

describe("DocumentTagEnumV2", () => {
  it("accepts valid v2 document tags including 'other'", () => {
    const validTags = [
      "invoices",
      "reports",
      "contracts",
      "images",
      "correspondence",
      "other",
    ];

    validTags.forEach((tag) => {
      expect(DocumentTagEnumV2.parse(tag)).toBe(tag);
    });
  });

  it("rejects 'miscellaneous' tag (replaced by 'other')", () => {
    expect(() => DocumentTagEnumV2.parse("miscellaneous")).toThrow();
  });

  it("rejects invalid tags", () => {
    expect(() => DocumentTagEnumV2.parse("invalid")).toThrow();
    expect(() => DocumentTagEnumV2.parse("")).toThrow();
  });
});

describe("SplitSchema", () => {
  it("parses valid split with all fields", () => {
    const validSplit = {
      observation: "Page 1 begins a new invoice with bill ref 17071927A",
      startPage: 1,
      endPage: 2,
      type: "invoices",
      identifier: "17071927A",
      document_date: "15_06_2024",
      potential_duplicate: null,
    };

    const result = SplitSchema.parse(validSplit);

    expect(result.observation).toBe(
      "Page 1 begins a new invoice with bill ref 17071927A"
    );
    expect(result.startPage).toBe(1);
    expect(result.endPage).toBe(2);
    expect(result.type).toBe("invoices");
    expect(result.identifier).toBe("17071927A");
    expect(result.document_date).toBe("15_06_2024");
    expect(result.potential_duplicate).toBeNull();
  });

  it("coerces string page numbers to integers", () => {
    const splitWithStringPages = {
      observation: "Testing coercion",
      startPage: "3",
      endPage: "4",
      type: "reports",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    const result = SplitSchema.parse(splitWithStringPages);

    expect(result.startPage).toBe(3);
    expect(result.endPage).toBe(4);
    expect(typeof result.startPage).toBe("number");
  });

  it("accepts null for optional fields", () => {
    const minimalSplit = {
      observation: "Separator page with no content",
      startPage: 5,
      endPage: 5,
      type: "other",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    const result = SplitSchema.parse(minimalSplit);

    expect(result.identifier).toBeNull();
    expect(result.document_date).toBeNull();
    expect(result.potential_duplicate).toBeNull();
  });

  it("accepts potential_duplicate string", () => {
    const splitWithDuplicate = {
      observation: "Duplicate detected",
      startPage: 1,
      endPage: 1,
      type: "invoices",
      identifier: null,
      document_date: null,
      potential_duplicate: "Duplicate of pages 3-4",
    };

    const result = SplitSchema.parse(splitWithDuplicate);

    expect(result.potential_duplicate).toBe("Duplicate of pages 3-4");
  });

  it("rejects missing observation field", () => {
    const noObservation = {
      startPage: 1,
      endPage: 1,
      type: "invoices",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    expect(() => SplitSchema.parse(noObservation)).toThrow();
  });

  it("rejects invalid page numbers (startPage > endPage)", () => {
    const invalidRange = {
      observation: "Invalid range",
      startPage: 5,
      endPage: 3,
      type: "invoices",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    expect(() => SplitSchema.parse(invalidRange)).toThrow();
  });

  it("rejects non-positive page numbers", () => {
    const zeroPage = {
      observation: "Zero page",
      startPage: 0,
      endPage: 1,
      type: "invoices",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    expect(() => SplitSchema.parse(zeroPage)).toThrow();
  });
});

describe("GeminiSplitterResponse", () => {
  it("parses valid complete response", () => {
    const validResponse = {
      schema_version: "splitter_v2",
      summary: "Bundle of 3 medical invoices from NTFGH",
      suggested_filename: "Medical Invoices - NTFGH Jun 2024 (2 docs)",
      splits: [
        {
          observation: "Page 1 is invoice 17071927A dated 15 Jun 2024",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: "17071927A",
          document_date: "15_06_2024",
          potential_duplicate: null,
        },
        {
          observation: "Page 2 is invoice 17071928B dated 16 Jun 2024",
          startPage: 2,
          endPage: 2,
          type: "invoices",
          identifier: "17071928B",
          document_date: "16_06_2024",
          potential_duplicate: null,
        },
      ],
    };

    const result = GeminiSplitterResponse.parse(validResponse);

    expect(result.schema_version).toBe("splitter_v2");
    expect(result.summary).toBe("Bundle of 3 medical invoices from NTFGH");
    expect(result.splits).toHaveLength(2);
  });

  it("rejects wrong schema_version", () => {
    const wrongVersion = {
      schema_version: "v1",
      summary: "Test",
      splits: [
        {
          observation: "Test",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: null,
          document_date: null,
          potential_duplicate: null,
        },
      ],
    };

    expect(() => GeminiSplitterResponse.parse(wrongVersion)).toThrow();
  });

  it("rejects empty splits array", () => {
    const emptySplits = {
      schema_version: "splitter_v2",
      summary: "Test",
      splits: [],
    };

    expect(() => GeminiSplitterResponse.parse(emptySplits)).toThrow();
  });

  it("rejects missing splits", () => {
    const noSplits = {
      schema_version: "splitter_v2",
      summary: "Test",
    };

    expect(() => GeminiSplitterResponse.parse(noSplits)).toThrow();
  });

  it("requires suggested_filename field", () => {
    const missingFilename = {
      schema_version: "splitter_v2",
      summary: "Test document",
      splits: [
        {
          observation: "Test",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: null,
          document_date: null,
          potential_duplicate: null,
        },
      ],
    };

    expect(() => GeminiSplitterResponse.parse(missingFilename)).toThrow();
  });

  it("parses response with suggested_filename", () => {
    const validResponse = {
      schema_version: "splitter_v2",
      summary: "Medical invoice from NTFGH",
      suggested_filename: "2024 06 15 - Medical Invoice from NTFGH (17071927A)",
      splits: [
        {
          observation: "Invoice on page 1",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: "17071927A",
          document_date: "2024-06-15",
          potential_duplicate: null,
        },
      ],
    };

    const result = GeminiSplitterResponse.parse(validResponse);

    expect(result.suggested_filename).toBe("2024 06 15 - Medical Invoice from NTFGH (17071927A)");
  });

  it("parses response with mixed document types", () => {
    const mixedTypes = {
      schema_version: "splitter_v2",
      summary: "Mixed documents: invoices and reports",
      suggested_filename: "Mixed Documents - Invoices and Reports",
      splits: [
        {
          observation: "Invoice on page 1-2",
          startPage: 1,
          endPage: 2,
          type: "invoices",
          identifier: "INV-001",
          document_date: "01_01_2024",
          potential_duplicate: null,
        },
        {
          observation: "Report on page 3-5",
          startPage: 3,
          endPage: 5,
          type: "reports",
          identifier: null,
          document_date: "02_01_2024",
          potential_duplicate: "Final version of draft on page 3",
        },
      ],
    };

    const result = GeminiSplitterResponse.parse(mixedTypes);

    expect(result.splits[0].type).toBe("invoices");
    expect(result.splits[1].type).toBe("reports");
    expect(result.splits[1].potential_duplicate).toBe("Final version of draft on page 3");
  });
});

describe("createSplitterSchema", () => {
  it("creates schema that accepts custom tag IDs", () => {
    const customTags = ["medical_expense", "medical_report", "income_document", "other"];
    const schema = createSplitterSchema(customTags);

    const validResponse = {
      schema_version: "splitter_v2",
      summary: "Medical invoice from hospital",
      suggested_filename: "2024-06-15 - Medical Invoice",
      splits: [
        {
          observation: "Medical expense invoice",
          startPage: 1,
          endPage: 1,
          type: "medical_expense", // Custom tag!
          identifier: "INV-001",
          document_date: "2024-06-15",
          potential_duplicate: null,
        },
      ],
    };

    const result = schema.parse(validResponse);
    expect(result.splits[0].type).toBe("medical_expense");
  });

  it("rejects tags not in the custom enum", () => {
    const customTags = ["medical_expense", "medical_report", "other"];
    const schema = createSplitterSchema(customTags);

    const invalidResponse = {
      schema_version: "splitter_v2",
      summary: "Test",
      suggested_filename: "Test",
      splits: [
        {
          observation: "Test",
          startPage: 1,
          endPage: 1,
          type: "invoices", // NOT in custom tags!
          identifier: null,
          document_date: null,
          potential_duplicate: null,
        },
      ],
    };

    expect(() => schema.parse(invalidResponse)).toThrow();
  });

  it("throws error for empty tag array", () => {
    expect(() => createSplitterSchema([])).toThrow("tagIds must have at least one element");
  });
});

describe("DEFAULT_TAG_IDS", () => {
  it("contains the default v2 tag set", () => {
    expect(DEFAULT_TAG_IDS).toEqual([
      "invoices",
      "reports",
      "contracts",
      "images",
      "correspondence",
      "other",
    ]);
  });

  it("can be used with createSplitterSchema for backward compatibility", () => {
    const schema = createSplitterSchema([...DEFAULT_TAG_IDS]);

    const validResponse = {
      schema_version: "splitter_v2",
      summary: "Test",
      suggested_filename: "Test",
      splits: [
        {
          observation: "Test",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: null,
          document_date: null,
          potential_duplicate: null,
        },
      ],
    };

    expect(() => schema.parse(validResponse)).not.toThrow();
  });
});

// ===== V2 DERIVATION FUNCTION TESTS =====

describe("derivePrimaryTag", () => {
  it("returns the most frequent type", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "3", startPage: 3, endPage: 3, type: "reports" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(derivePrimaryTag(splits)).toBe("invoices");
  });

  it("returns single type for homogeneous document", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "contracts" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(derivePrimaryTag(splits)).toBe("contracts");
  });

  it("returns first type when counts are tied", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "reports" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    // Both have count 1, should return first encountered
    const result = derivePrimaryTag(splits);
    expect(["invoices", "reports"]).toContain(result);
  });
});

describe("deriveTags", () => {
  it("returns tag counts as Record", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "3", startPage: 3, endPage: 3, type: "reports" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    const result = deriveTags(splits);

    expect(result).toEqual({ invoices: 2, reports: 1 });
  });

  it("returns single tag count for homogeneous document", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 5, type: "contracts" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveTags(splits)).toEqual({ contracts: 1 });
  });
});

describe("deriveDuplicateStatus", () => {
  it("returns 'none' when no splits have potential_duplicate", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveDuplicateStatus(splits)).toBe("none");
  });

  it("returns 'detected' when any split has potential_duplicate", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: "Duplicate of pages 3-4" },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveDuplicateStatus(splits)).toBe("detected");
  });

  it("returns 'detected' when multiple splits have potential_duplicate", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: "Duplicate of pages 3-4" },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: "Final version of page 5" },
      { observation: "3", startPage: 3, endPage: 3, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveDuplicateStatus(splits)).toBe("detected");
  });
});

describe("deriveIsHeterogeneous", () => {
  it("returns false for single type", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveIsHeterogeneous(splits)).toBe(false);
  });

  it("returns true for mixed types", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "reports" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveIsHeterogeneous(splits)).toBe(true);
  });

  it("returns false for single split", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 10, type: "contracts" as const, identifier: null, document_date: null, potential_duplicate: null },
    ];

    expect(deriveIsHeterogeneous(splits)).toBe(false);
  });
});

describe("deriveDocumentDate", () => {
  it("passes through ISO format date from first split", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: "2024-06-15", potential_duplicate: null },
    ];

    expect(deriveDocumentDate(splits)).toBe("2024-06-15");
  });

  it("returns null when first split has no date", () => {
    const splits = [
      { observation: "1", startPage: 1, endPage: 1, type: "other" as const, identifier: null, document_date: null, potential_duplicate: null },
      { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: "2024-06-16", potential_duplicate: null },
    ];

    expect(deriveDocumentDate(splits)).toBeNull();
  });

  it("returns empty array date as null", () => {
    const splits: Array<{ observation: string; startPage: number; endPage: number; type: "invoices"; identifier: null; document_date: null; potential_duplicate: null }> = [];

    expect(deriveDocumentDate(splits)).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("replaces filesystem-unsafe characters with dashes", () => {
    expect(sanitizeFilename("Invoice: Jan/Feb 2024")).toBe("Invoice- Jan-Feb 2024");
  });

  it("replaces all unsafe chars: / \\ : * ? \" < > |", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("collapses multiple spaces into single space", () => {
    expect(sanitizeFilename("Invoice   from   KTPH")).toBe("Invoice from KTPH");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeFilename("  Invoice 2024  ")).toBe("Invoice 2024");
  });

  it("handles already-clean filenames", () => {
    expect(sanitizeFilename("2024 01 15 - Invoice from ABC")).toBe("2024 01 15 - Invoice from ABC");
  });
});

describe("mapSplitterResponseToDocument", () => {
  it("uses sanitized suggested_filename from LLM response", () => {
    const response = {
      schema_version: "splitter_v2" as const,
      summary: "Bundle of 2 invoices from NTFGH",
      suggested_filename: "2024 06 15 - Medical Invoice: NTFGH (17071927A)",
      splits: [
        {
          observation: "Invoice 1",
          startPage: 1,
          endPage: 2,
          type: "invoices" as const,
          identifier: "17071927A",
          document_date: "2024-06-15",
          potential_duplicate: null,
        },
        {
          observation: "Invoice 2",
          startPage: 3,
          endPage: 4,
          type: "invoices" as const,
          identifier: "17071928B",
          document_date: "2024-06-16",
          potential_duplicate: null,
        },
      ],
    };

    const result = mapSplitterResponseToDocument(response, "pdf");

    // Should use LLM filename, sanitized (colon replaced with dash)
    expect(result.renamed_filename).toBe("2024 06 15 - Medical Invoice- NTFGH (17071927A).pdf");
    expect(result.primary_tag).toBe("invoices");
    expect(result.tags).toEqual({ invoices: 2 });
    expect(result.description).toBe("Bundle of 2 invoices from NTFGH");
    expect(result.is_heterogeneous).toBe(false);
    expect(result.page_ranges).toEqual(response.splits);
    expect(result.duplicate_status).toBe("none");
    expect(result.document_date).toBe("2024-06-15"); // ISO format passed through
    expect(result.status).toBe("complete");
    expect(result.processed_at).toBeDefined();
    expect(result.gemini_response).toEqual(response);
  });

  it("derives heterogeneous from mixed types", () => {
    const response = {
      schema_version: "splitter_v2" as const,
      summary: "Mixed documents",
      suggested_filename: "Mixed Documents - Jan 2024",
      splits: [
        { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
        { observation: "2", startPage: 2, endPage: 2, type: "reports" as const, identifier: null, document_date: null, potential_duplicate: "Duplicate of pages 1" },
      ],
    };

    const result = mapSplitterResponseToDocument(response, "pdf");

    expect(result.is_heterogeneous).toBe(true);
    expect(result.tags).toEqual({ invoices: 1, reports: 1 });
    expect(result.duplicate_status).toBe("detected");
  });

  it("handles duplicate_status correctly", () => {
    const response = {
      schema_version: "splitter_v2" as const,
      summary: "Documents with duplicates",
      suggested_filename: "Documents with Duplicates",
      splits: [
        { observation: "1", startPage: 1, endPage: 1, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: "Duplicate of pages 3-4" },
        { observation: "2", startPage: 2, endPage: 2, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: "Final version of draft" },
        { observation: "3", startPage: 3, endPage: 3, type: "invoices" as const, identifier: null, document_date: null, potential_duplicate: null },
      ],
    };

    const result = mapSplitterResponseToDocument(response, "pdf");

    expect(result.duplicate_status).toBe("detected");
  });
});
