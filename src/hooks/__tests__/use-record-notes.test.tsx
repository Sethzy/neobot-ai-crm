/**
 * Tests for CRM record note query and mutation hooks.
 * @module hooks/__tests__/use-record-notes
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordNoteKeys,
  useCreateRecordNote,
  useDeleteRecordNote,
  useRecordNotes,
  useUpdateRecordNote,
} from "@/hooks/use-record-notes";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
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

describe("recordNoteKeys", () => {
  it("builds stable record note key namespaces", () => {
    expect(recordNoteKeys.all).toEqual(["record-notes"]);
    expect(recordNoteKeys.lists()).toEqual(["record-notes", "list"]);
    expect(recordNoteKeys.list("contact", "contact-1")).toEqual([
      "record-notes",
      "list",
      "contact",
      "contact-1",
    ]);
  });
});

describe("useRecordNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches record notes ordered by created_at descending", async () => {
    const builder = createFetchBuilder([
      {
        note_id: "note-1",
        record_type: "contact",
        record_id: "contact-1",
        body: "First note",
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecordNotes("contact", "contact-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("record_notes");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "record_type", "contact");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "record_id", "contact-1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("subscribes to record_notes realtime invalidation", async () => {
    const builder = createFetchBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRecordNotes("deal", "deal-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "record_notes",
      filter: "client_id=eq.client-1",
      queryKeys: [recordNoteKeys.list("deal", "deal-1")],
      enabled: true,
    });
  });
});

describe("record note mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a record note with the resolved client id", async () => {
    const mockInsert = vi.fn();
    const mockSelect = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        note_id: "note-1",
        client_id: "client-1",
        record_type: "contact",
        record_id: "contact-1",
        body: "Created note",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
      },
      error: null,
    });

    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateRecordNote(), { wrapper });

    await result.current.mutateAsync({
      recordType: "contact",
      recordId: "contact-1",
      body: "Created note",
    });

    expect(mockFrom).toHaveBeenCalledWith("record_notes");
    expect(mockInsert).toHaveBeenCalledWith({
      client_id: "client-1",
      record_type: "contact",
      record_id: "contact-1",
      body: "Created note",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordNoteKeys.list("contact", "contact-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: recordNoteKeys.all });
  });

  it("updates a note body by note id", async () => {
    const mockUpdate = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        note_id: "note-1",
        client_id: "client-1",
        record_type: "company",
        record_id: "company-1",
        body: "Updated note",
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

    const { result } = renderHook(() => useUpdateRecordNote("note-1"), { wrapper });

    await result.current.mutateAsync("Updated note");

    expect(mockFrom).toHaveBeenCalledWith("record_notes");
    expect(mockUpdate).toHaveBeenCalledWith({ body: "Updated note" });
    expect(mockEq).toHaveBeenCalledWith("note_id", "note-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordNoteKeys.list("company", "company-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordNoteKeys.detail("note-1"),
    });
  });

  it("deletes a note and clears its detail cache", async () => {
    const mockDelete = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        note_id: "note-1",
        client_id: "client-1",
        record_type: "deal",
        record_id: "deal-1",
        body: "",
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

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const removeSpy = vi.spyOn(queryClient, "removeQueries");

    const { result } = renderHook(() => useDeleteRecordNote(), { wrapper });

    await result.current.mutateAsync("note-1");

    expect(mockFrom).toHaveBeenCalledWith("record_notes");
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith("note_id", "note-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: recordNoteKeys.list("deal", "deal-1"),
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: recordNoteKeys.detail("note-1"),
    });
  });
});
