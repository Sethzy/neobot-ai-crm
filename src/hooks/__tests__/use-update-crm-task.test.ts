/**
 * Tests update mutation behavior for CRM tasks.
 * @module hooks/__tests__/use-update-crm-task
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { crmTaskKeys } from "@/hooks/use-crm-tasks";
import { useUpdateCrmTask } from "@/hooks/use-update-crm-task";

const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUpdateCrmTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("updates the row and invalidates task query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCrmTask("task-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ status: "completed" });

    expect(mockFrom).toHaveBeenCalledWith("crm_tasks");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "completed" });
    expect(mockEq).toHaveBeenCalledWith("task_id", "task-1");
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: crmTaskKeys.all });
  });

  it("throws when Supabase returns an update error", async () => {
    const error = { message: "update failed" };
    mockEq.mockResolvedValue({ error });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateCrmTask("task-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ title: "Follow up" })).rejects.toEqual(error);
  });
});
