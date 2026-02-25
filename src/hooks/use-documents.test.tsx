/**
 * Tests for document query hooks.
 * @module hooks/use-documents.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  documentKeys,
  documentsQueryOptions,
  documentsWithStatusQueryOptions,
  useDocuments,
  useDocumentsWithStatus,
  useCreateDocument,
  useDeleteDocument,
  useMarkDocumentReviewed,
  useUnmarkDocumentReviewed,
  hasProcessingDocuments,
  hasProcessingDocumentsWithStatus,
} from "./use-documents";
import type { Document, DocumentWithStatus } from "@/types/documents";

// Mock Supabase client
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "documents_with_status") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      id: "doc-1",
                      case_id: "case-123",
                      created_by: "user-123",
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
                    },
                  ],
                  error: null,
                })
              ),
            })),
          })),
        };
      }
      // Default documents table mock
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    id: "doc-1",
                    case_id: "case-123",
                    original_filename: "test.pdf",
                    filename: "test.pdf",
                    status: "uploaded",
                  },
                ],
                error: null,
              })
            ),
            single: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: null,
              })
            ),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: "doc-new", case_id: "case-123" },
                error: null,
              })
            ),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      };
    }),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: "user-123" } },
          error: null,
        })
      ),
    },
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("documentKeys", () => {
  it("generates list key for a case", () => {
    const key = documentKeys.list("case-123");
    expect(key).toEqual(["documents", "list", "case-123"]);
  });

  it("generates detail key for a document", () => {
    const key = documentKeys.detail("doc-456");
    expect(key).toEqual(["documents", "detail", "doc-456"]);
  });
});

describe("useDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches documents for a case", async () => {
    const { result } = renderHook(() => useDocuments("case-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].original_filename).toBe("test.pdf");
  });
});

describe("useCreateDocument", () => {
  it("provides mutate function", () => {
    const { result } = renderHook(() => useCreateDocument(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });
});

describe("useDeleteDocument", () => {
  it("provides mutate function", () => {
    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });

  it("deletes database record before storage to prevent orphaned files", async () => {
    const callOrder: string[] = [];

    // Track call order by mocking implementations
    const { supabase } = await import("@/lib/supabase");
    const originalFrom = vi.mocked(supabase.from).getMockImplementation();
    const originalStorageFrom = vi.mocked(supabase.storage.from).getMockImplementation();

    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn() as ReturnType<typeof supabase.from>["select"],
      insert: vi.fn() as ReturnType<typeof supabase.from>["insert"],
      delete: vi.fn(() => ({
        eq: vi.fn(() => {
          callOrder.push("db-delete");
          return Promise.resolve({ error: null });
        }),
      })) as unknown as ReturnType<typeof supabase.from>["delete"],
    }) as ReturnType<typeof supabase.from>);

    vi.mocked(supabase.storage.from).mockImplementation(() => ({
      remove: vi.fn(() => {
        callOrder.push("storage-delete");
        return Promise.resolve({ data: [], error: null });
      }),
    }) as unknown as ReturnType<typeof supabase.storage.from>);

    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: "doc-1",
      caseId: "case-123",
      storagePath: "user/case/file.pdf",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // DB delete must happen before storage delete
    expect(callOrder).toEqual(["db-delete", "storage-delete"]);

    // Restore original mock implementations
    if (originalFrom) vi.mocked(supabase.from).mockImplementation(originalFrom);
    if (originalStorageFrom) vi.mocked(supabase.storage.from).mockImplementation(originalStorageFrom);
  });
});

describe("documentsQueryOptions", () => {
  it("returns correct queryKey for case ID", () => {
    const options = documentsQueryOptions("case-456");
    expect(options.queryKey).toEqual(["documents", "list", "case-456"]);
  });

  it("has queryFn defined", () => {
    const options = documentsQueryOptions("case-456");
    expect(typeof options.queryFn).toBe("function");
  });
});

describe("hasProcessingDocuments", () => {
  const mockDocument: Partial<Document> = {
    id: "doc-1",
    case_id: "case-123",
    original_filename: "test.pdf",
    filename: "test.pdf",
  };

  it("returns true when any document is uploaded", () => {
    const docs = [
      { ...mockDocument, status: "uploaded" },
      { ...mockDocument, status: "complete" },
    ] as Document[];
    expect(hasProcessingDocuments(docs)).toBe(true);
  });

  it("returns true when any document is processing", () => {
    const docs = [
      { ...mockDocument, status: "processing" },
      { ...mockDocument, status: "complete" },
    ] as Document[];
    expect(hasProcessingDocuments(docs)).toBe(true);
  });

  it("returns false when all documents are complete", () => {
    const docs = [
      { ...mockDocument, status: "complete" },
      { ...mockDocument, status: "complete" },
    ] as Document[];
    expect(hasProcessingDocuments(docs)).toBe(false);
  });

  it("returns false when all documents are failed", () => {
    const docs = [
      { ...mockDocument, status: "failed" },
      { ...mockDocument, status: "complete" },
    ] as Document[];
    expect(hasProcessingDocuments(docs)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasProcessingDocuments([])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasProcessingDocuments(undefined)).toBe(false);
  });
});

describe("documentKeys - listWithStatus", () => {
  it("generates list-with-status key for a case", () => {
    const key = documentKeys.listWithStatus("case-123");
    expect(key).toEqual(["documents", "list-with-status", "case-123"]);
  });
});

describe("documentsWithStatusQueryOptions", () => {
  it("returns correct queryKey for case ID", () => {
    const options = documentsWithStatusQueryOptions("case-456");
    expect(options.queryKey).toEqual(["documents", "list-with-status", "case-456"]);
  });

  it("has queryFn defined", () => {
    const options = documentsWithStatusQueryOptions("case-456");
    expect(typeof options.queryFn).toBe("function");
  });
});

describe("useDocumentsWithStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches documents with computed status", async () => {
    const { result } = renderHook(() => useDocumentsWithStatus("case-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].computed_status).toBe("processed");
  });

  it("includes is_reviewed field", async () => {
    const { result } = renderHook(() => useDocumentsWithStatus("case-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].is_reviewed).toBe(false);
  });
});

describe("hasProcessingDocumentsWithStatus", () => {
  const mockDocument: Partial<DocumentWithStatus> = {
    id: "doc-1",
    case_id: "case-123",
    original_filename: "test.pdf",
    filename: "test.pdf",
    is_reviewed: false,
    reviewed_at: null,
  };

  it("returns true when any document is processing", () => {
    const docs = [
      { ...mockDocument, computed_status: "processing" },
      { ...mockDocument, computed_status: "processed" },
    ] as DocumentWithStatus[];
    expect(hasProcessingDocumentsWithStatus(docs)).toBe(true);
  });

  it("returns false when all documents are processed", () => {
    const docs = [
      { ...mockDocument, computed_status: "processed" },
      { ...mockDocument, computed_status: "reviewed" },
    ] as DocumentWithStatus[];
    expect(hasProcessingDocumentsWithStatus(docs)).toBe(false);
  });

  it("returns false when all documents are in_review", () => {
    const docs = [
      { ...mockDocument, computed_status: "in_review" },
      { ...mockDocument, computed_status: "processed" },
    ] as DocumentWithStatus[];
    expect(hasProcessingDocumentsWithStatus(docs)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasProcessingDocumentsWithStatus([])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasProcessingDocumentsWithStatus(undefined)).toBe(false);
  });
});

describe("useMarkDocumentReviewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides mutate function", () => {
    const { result } = renderHook(() => useMarkDocumentReviewed(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });
});

describe("useUnmarkDocumentReviewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides mutate function", () => {
    const { result } = renderHook(() => useUnmarkDocumentReviewed(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });
});
