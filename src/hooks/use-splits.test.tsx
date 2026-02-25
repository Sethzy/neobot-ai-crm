/**
 * @file Tests for use-splits hook
 * @description Tests for live validation in useUpdateSplit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useUpdateSplit, useDismissRule } from "./use-splits";

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    })),
  },
}));

import { supabase } from "@/lib/supabase";

const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
};

/**
 * Creates a QueryClient wrapper for testing hooks.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUpdateSplit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates extracted_data without touching validation_failures", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: "split-1",
          document_id: "doc-1",
          split_index: 0,
          start_page: 1,
          end_page: 1,
          tag_id: "invoice",
          identifier: null,
          document_date: null,
          potential_duplicate: null,
          observation: null,
          extend_processor_id: null,
          extracted_data: { total: 100 },
          original_extracted_data: { total: 50 },
          extraction_metadata: null,
          extraction_status: "complete",
          extraction_error: null,
          validation_failures: [{ ruleId: "r1", message: "test" }], // Still present
          low_confidence_fields: null,
          page_width: 612,
          page_height: 792,
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
          dismissed_rule_ids: [],
        },
        error: null,
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ select: mockSelect }),
    });

    mockSupabase.from.mockReturnValue({
      update: mockUpdate,
    });

    const { result } = renderHook(() => useUpdateSplit(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: "split-1",
      documentId: "doc-1",
      extractedData: { total: 100 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Key assertion: validation_failures NOT in update payload
    expect(mockUpdate).toHaveBeenCalledWith({
      extracted_data: { total: 100 },
    });
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ validation_failures: expect.anything() })
    );
  });
});

describe("useDismissRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports useDismissRule hook", () => {
    expect(useDismissRule).toBeDefined();
  });

  it("appends ruleId to dismissed_rule_ids array", async () => {
    // Mock fetch current state
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { dismissed_rule_ids: [], document_id: "doc-1" },
          error: null,
        }),
      }),
    });

    // Mock update
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "split-1",
              document_id: "doc-1",
              tag_id: "medical_expense",
              split_index: 0,
              start_page: 1,
              end_page: 1,
              extracted_data: null,
              original_extracted_data: null,
              extraction_metadata: null,
              extraction_status: "completed",
              extraction_error: null,
              validation_failures: null,
              low_confidence_fields: null,
              identifier: null,
              document_date: null,
              potential_duplicate: null,
              observation: null,
              extend_processor_id: null,
              page_width: null,
              page_height: null,
              created_at: null,
              updated_at: null,
              dismissed_rule_ids: ["rule-1"],
            },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
    });

    const { result } = renderHook(() => useDismissRule(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      splitId: "split-1",
      documentId: "doc-1",
      ruleIds: ["rule-1"],
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        dismissed_rule_ids: ["rule-1"],
      });
    });
  });

  it("does not add duplicate ruleId", async () => {
    // Mock fetch - already has rule-1
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { dismissed_rule_ids: ["rule-1"], document_id: "doc-1" },
          error: null,
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({
      select: mockSelect,
    });

    const { result } = renderHook(() => useDismissRule(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      splitId: "split-1",
      documentId: "doc-1",
      ruleIds: ["rule-1"], // Already exists
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // No update query should run, but hook still fetches full row for return payload.
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });
});
