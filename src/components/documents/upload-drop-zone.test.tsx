/**
 * Tests for upload drop zone component.
 * @module components/documents/upload-drop-zone.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadDropZone } from "./upload-drop-zone";

describe("UploadDropZone", () => {
  it("renders empty state message", () => {
    render(<UploadDropZone onFilesSelected={vi.fn()} />);

    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop files/)).toBeInTheDocument();
  });

  it("calls onFilesSelected when files are dropped", () => {
    const onFilesSelected = vi.fn();
    render(<UploadDropZone onFilesSelected={onFilesSelected} />);

    const dropZone = screen.getByTestId("upload-drop-zone");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("opens file picker on click", () => {
    render(<UploadDropZone onFilesSelected={vi.fn()} />);

    // File input should exist
    const input = screen.getByTestId("file-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
  });

  it("calls onFilesSelected when files selected via picker", () => {
    const onFilesSelected = vi.fn();
    render(<UploadDropZone onFilesSelected={onFilesSelected} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("shows accepted file types", () => {
    render(<UploadDropZone onFilesSelected={vi.fn()} />);

    expect(screen.getByText(/PDF, PNG, JPG, GIF, WEBP, BMP, HEIC/)).toBeInTheDocument();
  });

  it("changes style on drag over", () => {
    render(<UploadDropZone onFilesSelected={vi.fn()} />);

    const dropZone = screen.getByTestId("upload-drop-zone");

    fireEvent.dragOver(dropZone);

    // Should have the drag-over class (border-foreground)
    expect(dropZone).toHaveClass("border-foreground");
  });
});
