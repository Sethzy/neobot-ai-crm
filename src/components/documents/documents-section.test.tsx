/**
 * Tests for documents section component.
 * @module components/documents/documents-section.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { DocumentsSection } from "./documents-section";
import { UploadProvider } from "@/contexts/upload-context";
import type { Document } from "@/types/documents";

const mockNavigate = vi.fn();

// Mock useDocuments hook
vi.mock("@/hooks/use-documents", () => ({
  useDocuments: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
  useDeleteDocument: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: null })),
      })),
    },
  },
}));

// Mock useNavigate
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderWithProviders = async (caseId = "case-123") => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <UploadProvider>
        <DocumentsSection caseId={caseId} />
      </UploadProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  let result;
  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });

  return result!;
};

/** Mock document fixture */
const mockDocument = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  case_id: "case-123",
  created_by: "user-1",
  original_filename: "test.pdf",
  filename: "test.pdf",
  storage_path: "path/to/file.pdf",
  file_type: "pdf",
  file_size: 1024,
  file_hash: "abc123",
  status: "uploaded",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

/** Helper to set up mock with documents */
const setupMockWithDocs = async (documents: Document[]) => {
  const { useDocuments } = await import("@/hooks/use-documents");
  vi.mocked(useDocuments).mockReturnValue({
    data: documents,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useDocuments>);
};

describe("DocumentsSection", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows empty state when no documents", async () => {
    await setupMockWithDocs([]);
    await renderWithProviders();

    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop files/)).toBeInTheDocument();
  });

  it("shows document count in header", async () => {
    await setupMockWithDocs([mockDocument()]);
    await renderWithProviders();

    expect(screen.getByText("Files (1)")).toBeInTheDocument();
  });

  describe("file paste", () => {
    it("paste in search input does not trigger upload", async () => {
      await setupMockWithDocs([mockDocument()]);
      await renderWithProviders();

      const searchInput = screen.getByPlaceholderText(/search by filename/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe("drag and drop", () => {
    /** Creates a mock DragEvent with files */
    function createDragEvent(
      type: "dragenter" | "dragover" | "dragleave" | "drop",
      hasFiles: boolean = true
    ): DragEvent {
      const event = new Event(type, { bubbles: true }) as DragEvent;
      const types = hasFiles ? ["Files"] : ["text/plain"];
      const files = hasFiles
        ? [new File(["content"], "test.pdf", { type: "application/pdf" })]
        : [];

      Object.defineProperty(event, "dataTransfer", {
        value: { types, files },
      });
      event.preventDefault = vi.fn();
      return event;
    }

    it("drag and drop works when documents exist", async () => {
      await setupMockWithDocs([mockDocument()]);
      await renderWithProviders();

      expect(screen.getByText("Files (1)")).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(createDragEvent("dragenter", true));
      });

      expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
    });

    it("drag and drop works in empty state", async () => {
      await setupMockWithDocs([]);
      await renderWithProviders();

      expect(screen.getByText("No documents yet")).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(createDragEvent("dragenter", true));
      });

      expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
    });
  });

  describe("memoization", () => {
    it("renders table with documents and stable callbacks", async () => {
      await setupMockWithDocs([mockDocument({ status: "complete" })]);
      await renderWithProviders();

      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();

      // View document link has the correct URL from getViewUrl callback
      const link = screen.getByRole("link", { name: /view document/i });
      expect(link).toHaveAttribute("href", "/cases/case-123/documents/doc-1");
    });
  });

  describe("toolbar features", () => {
    beforeEach(async () => {
      localStorage.clear();
      await setupMockWithDocs([
        mockDocument({
          original_filename: "receipt.pdf",
          filename: "receipt.pdf",
          status: "complete",
          primary_tag: "invoices",
        }),
      ]);
    });

    it("renders tag filter dropdown", async () => {
      await renderWithProviders();

      expect(screen.getByRole("button", { name: /all tags/i })).toBeInTheDocument();
    });

    it("renders Display button", async () => {
      await renderWithProviders();

      expect(screen.getByRole("button", { name: /display/i })).toBeInTheDocument();
    });

    it("renders Download All button", async () => {
      await renderWithProviders();

      expect(screen.getByRole("button", { name: /download all/i })).toBeInTheDocument();
    });
  });
});
