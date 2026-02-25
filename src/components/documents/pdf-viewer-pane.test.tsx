/**
 * Tests for PdfViewerPane component.
 * @module components/documents/pdf-viewer-pane.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock react-pdf-viewer to avoid canvas/worker issues in tests
vi.mock("@react-pdf-viewer/core", () => ({
  Viewer: ({ fileUrl }: { fileUrl: string }) => (
    <div data-testid="pdf-viewer" data-url={fileUrl}>
      PDF Viewer Mock
    </div>
  ),
  Worker: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@react-pdf-viewer/default-layout", () => ({
  defaultLayoutPlugin: vi.fn(() => ({
    toolbarPluginInstance: {
      pageNavigationPluginInstance: {
        jumpToPage: vi.fn(),
      },
    },
  })),
}));

vi.mock("@react-pdf-viewer/page-navigation", () => ({
  pageNavigationPlugin: () => ({
    jumpToPage: vi.fn(),
  }),
}));

vi.mock("@react-pdf-viewer/highlight", () => ({
  highlightPlugin: vi.fn(() => ({})),
}));

// Mock HighlightContext
vi.mock("@/contexts/highlight-context", () => ({
  useHighlights: () => ({
    highlights: [],
    registerJumpToPage: vi.fn(),
  }),
}));

import { PdfViewerPane } from "./pdf-viewer-pane";

describe("PdfViewerPane", () => {
  it("renders pdf viewer with correct url", () => {
    render(<PdfViewerPane pdfUrl="https://example.com/doc.pdf" />);

    const viewer = screen.getByTestId("pdf-viewer");
    expect(viewer).toBeInTheDocument();
    expect(viewer).toHaveAttribute("data-url", "https://example.com/doc.pdf");
  });
});
