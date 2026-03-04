/**
 * Tests for CRM task query hooks.
 * @module hooks/__tests__/use-crm-tasks
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { crmTaskKeys, useCrmTasks } from "@/hooks/use-crm-tasks";

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

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createThenableBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("crmTaskKeys", () => {
  it("builds stable CRM task key namespaces", () => {
    expect(crmTaskKeys.all).toEqual(["crm-tasks"]);
    expect(crmTaskKeys.lists()).toEqual(["crm-tasks", "list"]);
    expect(crmTaskKeys.list({ status: "open", search: "follow" })).toEqual([
      "crm-tasks",
      "list",
      { status: "open", search: "follow" },
    ]);
  });
});

describe("useCrmTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches crm tasks with joins ordered by due_date ascending", async () => {
    const builder = createThenableBuilder([
      {
        task_id: "task-1",
        title: "Follow up",
        status: "open",
        contacts: { first_name: "John", last_name: "Smith" },
        deals: { address: "123 Orchard Road" },
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCrmTasks({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("crm_tasks");
    expect(builder.select).toHaveBeenCalledWith(
      "*, contacts!crm_tasks_contact_id_fkey(first_name, last_name), deals!crm_tasks_deal_id_fkey(address)",
    );
    expect(builder.order).toHaveBeenCalledWith("due_date", {
      ascending: true,
      nullsFirst: false,
    });
  });

  it("applies status filter with eq", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCrmTasks({ status: "completed" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("status", "completed");
  });

  it("applies escaped search filter across title and description", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCrmTasks({ search: "follow" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledWith(
      'title.ilike."%follow%",description.ilike."%follow%"',
    );
  });

  it("wires realtime invalidation for crm_tasks table", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCrmTasks({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "crm_tasks",
      filter: "client_id=eq.client-1",
      queryKeys: [crmTaskKeys.all],
      enabled: true,
    });
  });

  it("surfaces Supabase errors", async () => {
    const builder = createThenableBuilder([], { message: "permission denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCrmTasks({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
