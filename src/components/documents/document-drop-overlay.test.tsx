/**
 * Tests for document drop overlay component.
 * @module components/documents/document-drop-overlay.test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { DocumentDropOverlay } from "./document-drop-overlay";

/** Creates a mock DragEvent with files */
function createDragEvent(
  type: "dragenter" | "dragover" | "dragleave" | "drop",
  hasFiles: boolean = true
): DragEvent {
  const event = new Event(type, { bubbles: true }) as DragEvent;

  // Set relatedTarget to document.body so document listener doesn't think we left the page
  Object.defineProperty(event, "relatedTarget", { value: document.body });

  // Mock dataTransfer
  const types = hasFiles ? ["Files"] : ["text/plain"];
  const files = hasFiles
    ? [new File(["content"], "test.pdf", { type: "application/pdf" })]
    : [];

  Object.defineProperty(event, "dataTransfer", {
    value: {
      types,
      files,
      items: files.map((f) => ({
        kind: "file",
        type: f.type,
        getAsFile: () => f,
      })),
    },
  });

  // Add preventDefault mock
  event.preventDefault = vi.fn();

  return event;
}

describe("DocumentDropOverlay", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  test("is hidden by default", () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    // Overlay should not be visible
    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });

  test("shows overlay on window dragenter with files", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
  });

  test("ignores dragenter without files (text drag)", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", false));
    });

    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });

  test("hides overlay on dragleave", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    // First show it
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });
    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();

    // Then hide it
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(createDragEvent("dragleave", true));
    });

    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });

  test("calls onFilesSelected on drop", async () => {
    const onFilesSelected = vi.fn();
    render(<DocumentDropOverlay onFilesSelected={onFilesSelected} />);

    // Show overlay
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    // Drop files
    const dropEvent = createDragEvent("drop", true);
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(dropEvent);
    });

    expect(onFilesSelected).toHaveBeenCalled();
    expect(onFilesSelected.mock.calls[0][0]).toHaveLength(1);
  });

  test("hides overlay after drop", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    // Show overlay
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });
    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();

    // Drop
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(createDragEvent("drop", true));
    });

    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });

  test("prevents default on dragover", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    // Show overlay
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    // Fire dragover
    const dragoverEvent = createDragEvent("dragover", true);
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(dragoverEvent);
    });

    expect(dragoverEvent.preventDefault).toHaveBeenCalled();
  });

  test("handles nested drag events with depth counter", async () => {
    render(<DocumentDropOverlay onFilesSelected={vi.fn()} />);

    // Simulate nested enter (happens when crossing child elements)
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();

    // Single leave shouldn't hide (still one drag active)
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(createDragEvent("dragleave", true));
    });

    // Should still be visible (depth counter > 0)
    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();

    // Second leave hides it
    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(createDragEvent("dragleave", true));
    });

    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });

  test("extracts all files from drop", async () => {
    const onFilesSelected = vi.fn();
    render(<DocumentDropOverlay onFilesSelected={onFilesSelected} />);

    // Show overlay
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    // Create drop event with multiple files
    const files = [
      new File(["a"], "a.pdf", { type: "application/pdf" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ];
    const dropEvent = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { types: ["Files"], files },
    });
    dropEvent.preventDefault = vi.fn();

    await act(async () => {
      const overlay = screen.getByTestId("drop-overlay");
      overlay.dispatchEvent(dropEvent);
    });

    expect(onFilesSelected).toHaveBeenCalledWith(files);
  });

  test("cleans up window listener on unmount", async () => {
    const { unmount } = render(
      <DocumentDropOverlay onFilesSelected={vi.fn()} />
    );

    unmount();

    // Dispatching drag events after unmount should not cause errors
    // and overlay should not appear
    await act(async () => {
      window.dispatchEvent(createDragEvent("dragenter", true));
    });

    expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
  });
});
