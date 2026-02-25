/**
 * Tests for case query hooks.
 * @module hooks/use-cases.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  caseDetailQueryOptions,
  useCases,
  useCase,
  useCreateCase,
  useUpdateCase,
} from "./use-cases";

// Mock Supabase client
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        // For useCases: select().order().eq() or select().order().or()
        order: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          or: vi.fn(() => Promise.resolve({ data: [], error: null })),
          then: (resolve: (value: { data: never[]; error: null }) => void) =>
            resolve({ data: [], error: null }),
        })),
        // For useCase: select().eq().single()
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: "case-123", case_name: "Test" },
              error: null,
            })
          ),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: "user-123" } },
          error: null,
        })
      ),
    },
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cases array", async () => {
    const { result } = renderHook(() => useCases({ filter: "all" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCase", () => {
  it("fetches single case by ID", async () => {
    const { result } = renderHook(() => useCase("case-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useCreateCase", () => {
  it("provides mutate function", () => {
    const { result } = renderHook(() => useCreateCase(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });
});

describe("useUpdateCase", () => {
  it("provides mutate function", () => {
    const { result } = renderHook(() => useUpdateCase(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
  });
});

describe("caseDetailQueryOptions", () => {
  it("returns correct queryKey for case ID", () => {
    const options = caseDetailQueryOptions("abc-123");
    expect(options.queryKey).toEqual(["cases", "detail", "abc-123"]);
  });

  it("has queryFn defined", () => {
    const options = caseDetailQueryOptions("abc-123");
    expect(typeof options.queryFn).toBe("function");
  });
});
