/**
 * Tests for Knowledge Base vault file query hooks and upload flow.
 * @module hooks/__tests__/use-vault-files
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VAULT_FILES_LIST_SELECT,
  uploadVaultFile,
  useVaultFiles,
  vaultFileKeys,
} from "@/hooks/use-vault-files";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: CLIENT_ID }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (options: unknown) => mockUseRealtimeTable(options),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createThenableBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

const mockListRow = {
  file_id: "550e8400-e29b-41d4-a716-446655440000",
  client_id: CLIENT_ID,
  filename: "test.pdf",
  storage_path: "vault/test-1a2b3c4d.pdf",
  title: "test",
  content_type: "application/pdf",
  size_bytes: 1024,
  tags: [],
  summary: null,
  needs_reprocess: false,
  created_at: "2026-03-03T00:00:00.000Z",
  updated_at: "2026-03-03T00:00:00.000Z",
};

const mockInsertedRow = {
  ...mockListRow,
  content: null,
};

describe("vaultFileKeys", () => {
  it("builds stable key namespaces", () => {
    expect(vaultFileKeys.all).toEqual(["vault-files"]);
    expect(vaultFileKeys.lists()).toEqual(["vault-files", "list"]);
    expect(vaultFileKeys.list({ search: "floor" })).toEqual([
      "vault-files",
      "list",
      { search: "floor" },
    ]);
  });
});

describe("useVaultFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches vault files ordered by updated_at descending", async () => {
    const builder = createThenableBuilder([mockListRow]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("vault_files");
    expect(builder.select).toHaveBeenCalledWith(VAULT_FILES_LIST_SELECT);
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result.current.data?.[0]?.content).toBeNull();
  });

  it("applies search via or() across metadata and content", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({ search: "floor plan" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledTimes(1);
    const orFilter = builder.or.mock.calls[0]?.[0] as string;
    expect(orFilter).toContain("title.ilike");
    expect(orFilter).toContain("filename.ilike");
    expect(orFilter).toContain("summary.ilike");
    expect(orFilter).toContain("content.ilike");
  });

  it("does not apply or() filter when search is empty", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).not.toHaveBeenCalled();
  });

  it("surfaces Supabase errors", async () => {
    const builder = createThenableBuilder([], { message: "RLS denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useVaultFiles({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("uploadVaultFile", () => {
  const uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID");

  beforeEach(() => {
    vi.clearAllMocks();
    uuidSpy.mockReturnValue("1a2b3c4d-1111-2222-3333-444455556666");
  });

  it("uploads to Storage, stores relative vault path, and inserts DB row", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: `${CLIENT_ID}/vault/floor-plan-final-1a2b3c4d.md` },
      error: null,
    });
    const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertedRow, error: null });
    const mockSelect = vi.fn(() => ({ single: mockSingle }));
    const mockInsert = vi.fn(() => ({ select: mockSelect }));

    const mock = {
      storage: {
        from: vi.fn(() => ({
          upload: mockUpload,
          remove: vi.fn(),
        })),
      },
      from: vi.fn(() => ({ insert: mockInsert })),
    } as never;

    const file = new File(["Market notes about district 10"], "Floor Plan (Final).md", {
      type: "text/markdown",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("Market notes about district 10"),
    });

    const result = await uploadVaultFile(mock, CLIENT_ID, file);

    expect(mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/vault/floor-plan-final-1a2b3c4d.md`,
      file,
      { upsert: false, contentType: "text/markdown" },
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        filename: "Floor Plan (Final).md",
        storage_path: "vault/floor-plan-final-1a2b3c4d.md",
        title: "floor-plan-final",
        content_type: "text/markdown",
        needs_reprocess: true,
        content: "Market notes about district 10",
      }),
    );

    expect(result).toEqual(mockInsertedRow);
  });

  it("throws on Storage upload failure", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "bucket not found" },
    });

    const mock = {
      storage: {
        from: vi.fn(() => ({ upload: mockUpload })),
      },
      from: vi.fn(),
    } as never;

    const file = new File(["test"], "test.md", { type: "text/markdown" });

    await expect(uploadVaultFile(mock, CLIENT_ID, file)).rejects.toThrow(
      "Storage upload failed: bucket not found",
    );
  });

  it("removes uploaded object and throws when DB insert fails", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: `${CLIENT_ID}/vault/test-1a2b3c4d.pdf` },
      error: null,
    });
    const mockRemove = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const mock = {
      storage: {
        from: vi.fn(() => ({ upload: mockUpload, remove: mockRemove })),
      },
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: mockSingle })),
        })),
      })),
    } as never;

    const file = new File(["test"], "test.md", { type: "text/markdown" });

    await expect(uploadVaultFile(mock, CLIENT_ID, file)).rejects.toThrow(
      "Failed to create vault file record: insert failed",
    );

    expect(mockRemove).toHaveBeenCalledWith([`${CLIENT_ID}/vault/test-1a2b3c4d.md`]);
  });

  it("rejects unsupported non-text file uploads before storage write", async () => {
    const mockUpload = vi.fn();
    const mock = {
      storage: {
        from: vi.fn(() => ({ upload: mockUpload })),
      },
      from: vi.fn(),
    } as never;

    const file = new File(["%PDF"], "test.pdf", { type: "application/pdf" });

    await expect(uploadVaultFile(mock, CLIENT_ID, file)).rejects.toThrow(
      /unsupported file type/i,
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
