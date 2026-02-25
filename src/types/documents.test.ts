/**
 * Tests for Document types and Zod schemas.
 * @module types/documents.test
 */
import { describe, it, expect } from "vitest";
import {
  DocumentSchema,
  CreateDocumentSchema,
  DocumentTagEnum,
  PageRangeSchema,
  ComputedDocumentStatus,
  DocumentWithStatusSchema,
  type DocumentWithStatus,
} from "./documents";

describe("DocumentSchema", () => {
  it("validates a complete document", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "receipt.pdf",
      filename: "receipt.pdf",
      storage_path: "user123/case456/abc123.pdf",
      file_type: "pdf",
      file_size: 1024,
      file_hash: "abc123def456",
      status: "uploaded",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const result = DocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("accepts optional metadata fields", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "receipt.pdf",
      filename: "receipt.pdf",
      storage_path: "user123/case456/abc123.pdf",
      file_type: "pdf",
      file_size: 1024,
      file_hash: "abc123def456",
      status: "uploaded",
      document_date: "2025-01-01",
      tags: { invoices: 1, reports: 1 }, // v2: JSONB with counts
      description: "Hospital bill",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const result = DocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      // missing case_id, created_by, etc.
    };

    const result = DocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });
});

describe("CreateDocumentSchema", () => {
  it("validates document creation input", () => {
    const input = {
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      original_filename: "receipt.pdf",
      storage_path: "user123/case456/abc123.pdf",
      file_type: "pdf",
      file_size: 1024,
      file_hash: "abc123def456",
    };

    const result = CreateDocumentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects empty filename", () => {
    const input = {
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      original_filename: "",
      storage_path: "user123/case456/abc123.pdf",
      file_type: "pdf",
      file_size: 1024,
      file_hash: "abc123def456",
    };

    const result = CreateDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects negative file size", () => {
    const input = {
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      original_filename: "receipt.pdf",
      storage_path: "user123/case456/abc123.pdf",
      file_type: "pdf",
      file_size: -1,
      file_hash: "abc123def456",
    };

    const result = CreateDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("DocumentTagEnum v2", () => {
  it("accepts 'other' tag", () => {
    expect(DocumentTagEnum.parse("other")).toBe("other");
  });

  it("rejects 'miscellaneous' tag (deprecated)", () => {
    expect(() => DocumentTagEnum.parse("miscellaneous")).toThrow();
  });

  it("accepts all valid v2 tags", () => {
    const validTags = [
      "invoices",
      "reports",
      "contracts",
      "images",
      "correspondence",
      "other",
    ];
    validTags.forEach((tag) => {
      expect(DocumentTagEnum.parse(tag)).toBe(tag);
    });
  });
});

describe("PageRangeSchema v2 (Split format)", () => {
  it("accepts v2 split with observation field", () => {
    const validSplit = {
      observation: "Invoice page 1-2",
      startPage: 1,
      endPage: 2,
      type: "invoices",
      identifier: "INV-001",
      document_date: "15_06_2024",
      potential_duplicate: null,
    };

    const result = PageRangeSchema.parse(validSplit);
    expect(result.observation).toBe("Invoice page 1-2");
    expect(result.startPage).toBe(1);
  });

  it("coerces string page numbers", () => {
    const split = {
      observation: "Test",
      startPage: "1",
      endPage: "2",
      type: "reports",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    const result = PageRangeSchema.parse(split);
    expect(typeof result.startPage).toBe("number");
    expect(typeof result.endPage).toBe("number");
  });

  it("accepts null for optional fields", () => {
    const split = {
      observation: "Separator page",
      startPage: 5,
      endPage: 5,
      type: "other",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    const result = PageRangeSchema.parse(split);
    expect(result.identifier).toBeNull();
    expect(result.document_date).toBeNull();
    expect(result.potential_duplicate).toBeNull();
  });

  it("rejects invalid page range (startPage > endPage)", () => {
    const invalidSplit = {
      observation: "Invalid range",
      startPage: 5,
      endPage: 3,
      type: "invoices",
      identifier: null,
      document_date: null,
      potential_duplicate: null,
    };

    expect(() => PageRangeSchema.parse(invalidSplit)).toThrow();
  });
});

describe("DocumentSchema v2 tags field", () => {
  it("accepts tags as Record<string, number>", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "/test/path",
      file_type: "pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "uploaded",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      tags: { invoices: 2, reports: 1 },
    };

    const result = DocumentSchema.parse(doc);
    expect(result.tags).toEqual({ invoices: 2, reports: 1 });
  });

  it("accepts empty tags object", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "/test/path",
      file_type: "pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "uploaded",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      tags: {},
    };

    const result = DocumentSchema.parse(doc);
    expect(result.tags).toEqual({});
  });
});

describe("ComputedDocumentStatus", () => {
  it("includes all expected status values", () => {
    expect(ComputedDocumentStatus.PROCESSING).toBe("processing");
    expect(ComputedDocumentStatus.PROCESSED).toBe("processed");
    expect(ComputedDocumentStatus.IN_REVIEW).toBe("in_review");
    expect(ComputedDocumentStatus.REVIEWED).toBe("reviewed");
    expect(ComputedDocumentStatus.FAILED).toBe("failed");
  });
});

describe("DocumentWithStatusSchema", () => {
  it("validates document with computed_status field", () => {
    const doc: DocumentWithStatus = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "path/to/file.pdf",
      file_type: "application/pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "complete",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      is_reviewed: false,
      reviewed_at: null,
      computed_status: "processed",
    };

    const result = DocumentWithStatusSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("accepts in_review computed status", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "path/to/file.pdf",
      file_type: "application/pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "complete",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      is_reviewed: false,
      reviewed_at: null,
      computed_status: "in_review",
    };

    const result = DocumentWithStatusSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("accepts reviewed status with reviewed_at timestamp", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "path/to/file.pdf",
      file_type: "application/pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "complete",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      is_reviewed: true,
      reviewed_at: "2024-01-15T12:00:00Z",
      computed_status: "reviewed",
    };

    const result = DocumentWithStatusSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("rejects invalid computed_status value", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_id: "123e4567-e89b-12d3-a456-426614174001",
      created_by: "123e4567-e89b-12d3-a456-426614174002",
      original_filename: "test.pdf",
      filename: "test.pdf",
      storage_path: "path/to/file.pdf",
      file_type: "application/pdf",
      file_size: 1000,
      file_hash: "abc123",
      status: "complete",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      is_reviewed: false,
      reviewed_at: null,
      computed_status: "invalid_status",
    };

    const result = DocumentWithStatusSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });
});
