/**
 * @fileoverview Tests for Report History helper - saves AI-generated files.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase client
const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "report-1" }, error: null }),
  }),
});
const mockUpload = vi
  .fn()
  .mockResolvedValue({ data: { path: "case-123/file.xlsx" }, error: null });

const mockSupabase = {
  from: vi.fn().mockReturnValue({ insert: mockInsert }),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: mockUpload,
    }),
  },
} as any;

// Mock Anthropic SDK - needs to be a class that can be instantiated
const MockAnthropicClass = class {
  beta = {
    files: {
      download: vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(["test content"])),
      }),
    },
  };
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: MockAnthropicClass,
}));

// Mock fetch for downloading URL-based files
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  blob: () => Promise.resolve(new Blob(["test content"])),
});

describe("saveGeneratedFileToReportHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads file from URL, uploads to storage, and inserts into report_history", async () => {
    const { saveGeneratedFileToReportHistory } = await import(
      "../report-history"
    );

    await saveGeneratedFileToReportHistory({
      caseId: "case-123",
      filename: "analysis.xlsx",
      url: "https://example.com/file.xlsx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      generatedBy: "user-456",
      supabase: mockSupabase,
    });

    // Should upload to storage bucket
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("reports");
    expect(mockUpload).toHaveBeenCalled();

    // Should insert into report_history table with correct schema
    expect(mockSupabase.from).toHaveBeenCalledWith("report_history");
    expect(mockInsert).toHaveBeenCalledWith({
      case_id: "case-123",
      report_type: "ai_analysis",
      name: "analysis.xlsx",
      file_path: expect.stringContaining("case-123/"),
      splits_count: 0,
      tags_included: [],
      generated_by: "user-456",
    });
  });

  it("fetches file content by file_id and uploads to storage", async () => {
    const { saveGeneratedFileToReportHistory } = await import(
      "../report-history"
    );

    await saveGeneratedFileToReportHistory({
      caseId: "case-456",
      filename: "report.pdf",
      fileId: "file_abc123",
      mediaType: "application/pdf",
      generatedBy: "user-789",
      supabase: mockSupabase,
    });

    // Should upload to storage bucket
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("reports");
    expect(mockUpload).toHaveBeenCalled();

    // Should insert into report_history with correct schema
    expect(mockSupabase.from).toHaveBeenCalledWith("report_history");
    expect(mockInsert).toHaveBeenCalledWith({
      case_id: "case-456",
      report_type: "ai_analysis",
      name: "report.pdf",
      file_path: expect.stringContaining("case-456/"),
      splits_count: 0,
      tags_included: [],
      generated_by: "user-789",
    });
  });
});
