/**
 * Tests for download utilities.
 * @module lib/download-utils.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateTotalSize,
  formatFileSize,
  getDownloadSizeStatus,
  downloadDocumentsAsZip,
} from "./download-utils";
import type { Document } from "@/types/documents";

const createMockDoc = (size: number): Document => ({
  id: `doc-${size}`,
  case_id: "case-1",
  created_by: "user-1",
  original_filename: "test.pdf",
  filename: "test.pdf",
  storage_path: "path/test.pdf",
  file_type: "pdf",
  file_size: size,
  file_hash: "hash",
  status: "complete",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
});

describe("calculateTotalSize", () => {
  it("returns 0 for empty array", () => {
    expect(calculateTotalSize([])).toBe(0);
  });

  it("sums file sizes correctly", () => {
    const docs = [createMockDoc(1000), createMockDoc(2000), createMockDoc(500)];
    expect(calculateTotalSize(docs)).toBe(3500);
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(104857600)).toBe("100.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });
});

describe("getDownloadSizeStatus", () => {
  it("returns ok for small downloads", () => {
    expect(getDownloadSizeStatus(50 * 1024 * 1024)).toBe("ok"); // 50MB
  });

  it("returns warn for medium downloads", () => {
    expect(getDownloadSizeStatus(150 * 1024 * 1024)).toBe("warn"); // 150MB
  });

  it("returns block for large downloads", () => {
    expect(getDownloadSizeStatus(250 * 1024 * 1024)).toBe("block"); // 250MB
  });
});

describe("downloadDocumentsAsZip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
    global.URL.revokeObjectURL = vi.fn();
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  });

  it("fetches all document URLs and creates zip", async () => {
    const docs = [createMockDoc(1000), createMockDoc(2000)];
    const getSignedUrl = vi
      .fn()
      .mockResolvedValue("https://example.com/file.pdf");

    // Mock document.createElement for anchor
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockAnchor as unknown as HTMLAnchorElement
    );

    await downloadDocumentsAsZip(docs, "TestCase", getSignedUrl);

    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses case name for zip filename", async () => {
    const docs = [createMockDoc(1000)];
    const getSignedUrl = vi
      .fn()
      .mockResolvedValue("https://example.com/file.pdf");

    // Mock document.createElement for anchor
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockAnchor as unknown as HTMLAnchorElement
    );

    await downloadDocumentsAsZip(docs, "My Legal Case", getSignedUrl);

    expect(mockAnchor.download).toBe("My Legal Case.zip");
  });
});
