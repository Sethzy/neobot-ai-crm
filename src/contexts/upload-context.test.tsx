/**
 * Tests for global upload state context.
 * @module contexts/upload-context.test
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { UploadProvider, useUpload, isAllowedFileType } from "./upload-context";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UploadProvider>{children}</UploadProvider>
);

describe("useUpload", () => {
  it("starts with empty queue", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    expect(result.current.queue).toEqual([]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isPanelVisible).toBe(false);
  });

  it("adds files to queue", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].file.name).toBe("test.pdf");
    expect(result.current.queue[0].caseId).toBe("case-123");
    expect(result.current.queue[0].status).toBe("pending");
    expect(result.current.isPanelVisible).toBe(true);
  });

  it("updates item status", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    const itemId = result.current.queue[0].id;

    act(() => {
      result.current.updateItemStatus(itemId, "uploading");
    });

    expect(result.current.queue[0].status).toBe("uploading");
    expect(result.current.isUploading).toBe(true);
  });

  it("sets error on failed status", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    const itemId = result.current.queue[0].id;

    act(() => {
      result.current.updateItemStatus(itemId, "failed", "Upload failed");
    });

    expect(result.current.queue[0].status).toBe("failed");
    expect(result.current.queue[0].error).toBe("Upload failed");
  });

  it("clears completed items", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    const file1 = new File(["content"], "test1.pdf", { type: "application/pdf" });
    const file2 = new File(["content"], "test2.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file1, file2], "case-123");
    });

    const item1Id = result.current.queue[0].id;

    act(() => {
      result.current.updateItemStatus(item1Id, "complete");
    });

    act(() => {
      result.current.clearCompleted();
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].file.name).toBe("test2.pdf");
  });

  it("dismisses panel", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    act(() => {
      result.current.addToQueue([file], "case-123");
    });

    expect(result.current.isPanelVisible).toBe(true);

    act(() => {
      result.current.dismissPanel();
    });

    expect(result.current.isPanelVisible).toBe(false);
  });

  it("throws error when used outside provider", () => {
    expect(() => {
      renderHook(() => useUpload());
    }).toThrow("useUpload must be used within UploadProvider");
  });

  it("marks unsupported file types as failed with error message", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    const docxFile = new File(["content"], "test.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const xlsxFile = new File(["content"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    act(() => {
      result.current.addToQueue([docxFile, xlsxFile], "case-123");
    });

    // Unsupported files should be added as failed
    expect(result.current.queue).toHaveLength(2);
    expect(result.current.queue[0].status).toBe("failed");
    expect(result.current.queue[0].error).toContain("Unsupported file type");
    expect(result.current.queue[1].status).toBe("failed");
    expect(result.current.queue[1].error).toContain("Unsupported file type");
  });

  it("accepts supported file types as pending and unsupported as failed", () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    const pdfFile = new File(["content"], "test.pdf", { type: "application/pdf" });
    const pngFile = new File(["content"], "test.png", { type: "image/png" });
    const docxFile = new File(["content"], "test.docx", { type: "application/vnd..." });

    act(() => {
      result.current.addToQueue([pdfFile, pngFile, docxFile], "case-123");
    });

    // All files added, but with different statuses
    expect(result.current.queue).toHaveLength(3);
    expect(result.current.queue[0].file.name).toBe("test.pdf");
    expect(result.current.queue[0].status).toBe("pending");
    expect(result.current.queue[1].file.name).toBe("test.png");
    expect(result.current.queue[1].status).toBe("pending");
    expect(result.current.queue[2].file.name).toBe("test.docx");
    expect(result.current.queue[2].status).toBe("failed");
    expect(result.current.queue[2].error).toContain("Unsupported file type");
  });
});

describe("isAllowedFileType", () => {
  it("allows PDF files", () => {
    expect(isAllowedFileType("document.pdf")).toBe(true);
    expect(isAllowedFileType("DOCUMENT.PDF")).toBe(true);
  });

  it("allows image files", () => {
    expect(isAllowedFileType("image.png")).toBe(true);
    expect(isAllowedFileType("photo.jpg")).toBe(true);
    expect(isAllowedFileType("photo.jpeg")).toBe(true);
    expect(isAllowedFileType("image.gif")).toBe(true);
    expect(isAllowedFileType("image.webp")).toBe(true);
    expect(isAllowedFileType("image.bmp")).toBe(true);
    expect(isAllowedFileType("image.heic")).toBe(true);
  });

  it("rejects Office files", () => {
    expect(isAllowedFileType("document.docx")).toBe(false);
    expect(isAllowedFileType("spreadsheet.xlsx")).toBe(false);
    expect(isAllowedFileType("presentation.pptx")).toBe(false);
  });

  it("rejects other unsupported types", () => {
    expect(isAllowedFileType("data.csv")).toBe(false);
    expect(isAllowedFileType("notes.txt")).toBe(false);
    expect(isAllowedFileType("image.tiff")).toBe(false);
    expect(isAllowedFileType("email.eml")).toBe(false);
  });
});
