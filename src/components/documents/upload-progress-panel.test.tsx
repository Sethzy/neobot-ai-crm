/**
 * Tests for upload progress panel component.
 * @module components/documents/upload-progress-panel.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadProgressPanel } from "./upload-progress-panel";
import type { QueueItem } from "@/contexts/upload-context";

describe("UploadProgressPanel", () => {
  const defaultProps = {
    reportTask: null,
    onClearReportTask: vi.fn(),
  };

  const createMockQueue = (overrides: Partial<QueueItem>[] = []): QueueItem[] => [
    {
      id: "1",
      file: new File([""], "file1.pdf"),
      caseId: "case-123",
      status: "complete",
      progress: 100,
      ...overrides[0],
    },
    {
      id: "2",
      file: new File([""], "file2.pdf"),
      caseId: "case-123",
      status: "uploading",
      progress: 50,
      ...overrides[1],
    },
  ];

  it("returns null when queue is empty and no report task", () => {
    const { container } = render(
      <UploadProgressPanel queue={[]} isUploading={false} onDismiss={vi.fn()} {...defaultProps} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows uploading state when files are uploading", () => {
    render(
      <UploadProgressPanel
        queue={createMockQueue()}
        isUploading={true}
        onDismiss={vi.fn()}
        {...defaultProps}
      />
    );

    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows complete state when all files done", () => {
    const completedQueue: QueueItem[] = [
      {
        id: "1",
        file: new File([""], "file1.pdf"),
        caseId: "case-123",
        status: "complete",
        progress: 100,
      },
      {
        id: "2",
        file: new File([""], "file2.pdf"),
        caseId: "case-123",
        status: "complete",
        progress: 100,
      },
    ];

    render(
      <UploadProgressPanel
        queue={completedQueue}
        isUploading={false}
        onDismiss={vi.fn()}
        {...defaultProps}
      />
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("shows failed state when files fail", () => {
    const failedQueue: QueueItem[] = [
      {
        id: "1",
        file: new File([""], "file1.pdf"),
        caseId: "case-123",
        status: "complete",
        progress: 100,
      },
      {
        id: "2",
        file: new File([""], "file2.pdf"),
        caseId: "case-123",
        status: "failed",
        progress: 0,
        error: "Upload failed",
      },
    ];

    render(
      <TooltipProvider>
        <UploadProgressPanel
          queue={failedQueue}
          isUploading={false}
          onDismiss={vi.fn()}
          {...defaultProps}
        />
      </TooltipProvider>
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("calls onDismiss when close button clicked", () => {
    const onDismiss = vi.fn();
    const completedQueue: QueueItem[] = [
      {
        id: "1",
        file: new File([""], "file1.pdf"),
        caseId: "case-123",
        status: "complete",
        progress: 100,
      },
    ];

    render(
      <UploadProgressPanel
        queue={completedQueue}
        isUploading={false}
        onDismiss={onDismiss}
        {...defaultProps}
      />
    );

    const closeButton = screen.getByLabelText("Dismiss panel");
    fireEvent.click(closeButton);

    expect(onDismiss).toHaveBeenCalled();
  });

  it("disables close button while uploading", () => {
    render(
      <UploadProgressPanel
        queue={createMockQueue()}
        isUploading={true}
        onDismiss={vi.fn()}
        {...defaultProps}
      />
    );

    const closeButton = screen.getByLabelText("Dismiss panel");
    expect(closeButton).toBeDisabled();
  });

  it("shows file names in list", () => {
    render(
      <UploadProgressPanel
        queue={createMockQueue()}
        isUploading={true}
        onDismiss={vi.fn()}
        {...defaultProps}
      />
    );

    expect(screen.getByText("file1.pdf")).toBeInTheDocument();
    expect(screen.getByText("file2.pdf")).toBeInTheDocument();
  });

  it("shows report task when generating", () => {
    render(
      <UploadProgressPanel
        queue={[]}
        isUploading={false}
        onDismiss={vi.fn()}
        reportTask={{ name: "AI Analysis", status: "generating" }}
        onClearReportTask={vi.fn()}
      />
    );

    expect(screen.getByText("Generating")).toBeInTheDocument();
    expect(screen.getByText("AI Analysis")).toBeInTheDocument();
  });

  it("shows download button when report is ready", () => {
    render(
      <UploadProgressPanel
        queue={[]}
        isUploading={false}
        onDismiss={vi.fn()}
        reportTask={{ name: "AI Analysis", status: "complete", downloadUrl: "https://example.com/report.xlsx" }}
        onClearReportTask={vi.fn()}
      />
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByLabelText("Download report")).toBeInTheDocument();
  });
});
