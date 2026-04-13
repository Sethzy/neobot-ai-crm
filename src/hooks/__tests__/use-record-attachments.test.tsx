/**
 * Tests for CRM record attachment query and mutation hooks.
 * @module hooks/__tests__/use-record-attachments
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordAttachmentKeys,
  useDeleteAttachment,
  useRecordAttachments,
  useRenameAttachment,
  useUploadAttachment,
} from "@/hooks/use-record-attachments";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();
const mockStorageRemove = vi.fn();
const mockFetch = vi.fn();
const mockUploadToSignedUrl = vi.fn();
const mockSignedStorageFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: vi.fn().mockImplementation(() => ({
        remove: mockStorageRemove,
      })),
    },
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockSignedStorageFrom.mockImplementation(() => ({
        uploadToSignedUrl: mockUploadToSignedUrl,
      })),
    },
  })),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1" }),
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

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function createFetchBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("recordAttachmentKeys", () => {
  it("builds a list key for a specific record", () => {
    expect(recordAttachmentKeys.list("contact", "c-1")).toEqual([
      "record-attachments",
      "list",
      "contact",
      "c-1",
    ]);
  });

  it("builds a detail key for a specific attachment", () => {
    expect(recordAttachmentKeys.detail("att-1")).toEqual([
      "record-attachments",
      "detail",
      "att-1",
    ]);
  });

  it("all keys share the same prefix", () => {
    expect(recordAttachmentKeys.all).toEqual(["record-attachments"]);
  });
});

describe("useRecordAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches record attachments ordered by created_at descending", async () => {
    const builder = createFetchBuilder([
      {
        attachment_id: "att-1",
        record_type: "contact",
        record_id: "contact-1",
        filename: "brief.pdf",
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecordAttachments("contact", "contact-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("record_attachments");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "record_type", "contact");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "record_id", "contact-1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("subscribes to record_attachments realtime invalidation", async () => {
    const builder = createFetchBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecordAttachments("deal", "deal-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "record_attachments",
      filter: "client_id=eq.client-1",
      queryKeys: [recordAttachmentKeys.list("deal", "deal-1")],
      enabled: true,
    });
  });
});

describe("record attachment mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockUploadToSignedUrl.mockResolvedValue({
      data: { path: "attachments/contact/contact-1/uuid-1" },
      error: null,
    });
  });

  it("uploads an attachment through the API route", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          signedUrl: "https://storage.example.com/upload/sign/path",
          token: "upload-token",
          path: "client-1/attachments/contact/contact-1/uuid-1",
          storagePath: "attachments/contact/contact-1/uuid-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachment: {
            attachment_id: "att-1",
            client_id: "client-1",
            record_type: "contact",
            record_id: "contact-1",
            filename: "brief.pdf",
            storage_path: "attachments/contact/contact-1/uuid-1",
            content_type: "application/pdf",
            file_size: 10,
            file_category: "pdf",
            created_at: "2026-04-05T00:00:00Z",
            updated_at: "2026-04-05T00:00:00Z",
          },
        }),
      });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUploadAttachment(), { wrapper });

    await result.current.mutateAsync({
      file: new File(["pdf-data"], "brief.pdf", { type: "application/pdf" }),
      recordType: "contact",
      recordId: "contact-1",
    });

    expect(mockFetch).toHaveBeenNthCalledWith(1, "/api/crm/attachments/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 8,
        record_type: "contact",
        record_id: "contact-1",
      }),
    });
    expect(mockSignedStorageFrom).toHaveBeenCalledWith("agent-files");
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      "client-1/attachments/contact/contact-1/uuid-1",
      "upload-token",
      expect.any(File),
      {
        cacheControl: "3600",
        upsert: false,
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/crm/attachments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath: "attachments/contact/contact-1/uuid-1",
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 8,
        record_type: "contact",
        record_id: "contact-1",
      }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordAttachmentKeys.list("contact", "contact-1"),
    });
  });

  it("renames an attachment by id", async () => {
    const mockUpdate = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        attachment_id: "att-1",
        client_id: "client-1",
        record_type: "company",
        record_id: "company-1",
        filename: "renamed.pdf",
        storage_path: "attachments/company/company-1/uuid-1",
        content_type: "application/pdf",
        file_size: 10,
        file_category: "pdf",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T01:00:00Z",
      },
      error: null,
    });

    mockFrom.mockReturnValue({
      update: mockUpdate.mockReturnValue({
        eq: mockEq.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRenameAttachment(), { wrapper });

    await result.current.mutateAsync({
      attachmentId: "att-1",
      filename: "renamed.pdf",
    });

    expect(mockFrom).toHaveBeenCalledWith("record_attachments");
    expect(mockUpdate).toHaveBeenCalledWith({ filename: "renamed.pdf" });
    expect(mockEq).toHaveBeenCalledWith("attachment_id", "att-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordAttachmentKeys.list("company", "company-1"),
    });
  });

  it("deletes the row and removes the storage object", async () => {
    const mockDelete = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        attachment_id: "att-1",
        client_id: "client-1",
        record_type: "deal",
        record_id: "deal-1",
        filename: "brief.pdf",
        storage_path: "attachments/deal/deal-1/uuid-1",
        content_type: "application/pdf",
        file_size: 10,
        file_category: "pdf",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T01:00:00Z",
      },
      error: null,
    });

    mockFrom.mockReturnValue({
      delete: mockDelete.mockReturnValue({
        eq: mockEq.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      }),
    });
    mockStorageRemove.mockResolvedValue({ data: [], error: null });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const removeSpy = vi.spyOn(queryClient, "removeQueries");
    const { result } = renderHook(() => useDeleteAttachment(), { wrapper });

    await result.current.mutateAsync({
      attachmentId: "att-1",
      storagePath: "attachments/deal/deal-1/uuid-1",
    });

    expect(mockFrom).toHaveBeenCalledWith("record_attachments");
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith("attachment_id", "att-1");
    expect(mockStorageRemove).toHaveBeenCalledWith(["client-1/attachments/deal/deal-1/uuid-1"]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordAttachmentKeys.list("deal", "deal-1"),
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: recordAttachmentKeys.detail("att-1"),
    });
  });
});
