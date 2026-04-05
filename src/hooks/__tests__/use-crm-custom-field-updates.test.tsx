/**
 * Tests CRM update hooks that merge `custom_fields` patches centrally.
 * @module hooks/__tests__/use-crm-custom-field-updates
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUpdateContact } from "../use-update-contact";
import { useUpdateCrmTask } from "../use-update-crm-task";
import { useUpdateDeal } from "../use-update-deal";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-contacts", () => ({
  contactKeys: {
    all: ["contacts"],
    lists: () => ["contacts", "list"],
    detail: (contactId: string) => ["contacts", "detail", contactId],
  },
}));

vi.mock("@/hooks/use-deals", () => ({
  dealKeys: {
    all: ["deals"],
    lists: () => ["deals", "list"],
    detail: (dealId: string) => ["deals", "detail", dealId],
  },
}));

vi.mock("@/hooks/use-crm-tasks", () => ({
  crmTaskKeys: {
    all: ["crm-tasks"],
    lists: () => ["crm-tasks", "list"],
    detail: (taskId: string) => ["crm-tasks", "detail", taskId],
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createSelectBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

function createUpdateBuilder() {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: null; error: null }) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
}

describe("CRM custom-field update hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("merges contact custom_fields patches before updating", async () => {
    const snapshotBuilder = createSelectBuilder({
      client_id: "client-1",
      custom_fields: { source: "referral" },
    });
    const customFieldsBuilder = createSelectBuilder({
      custom_fields: { source: "referral" },
    });
    const updateBuilder = createUpdateBuilder();
    mockFrom
      .mockReturnValueOnce(snapshotBuilder)
      .mockReturnValueOnce(customFieldsBuilder)
      .mockReturnValueOnce(updateBuilder);

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      custom_fields: { segment: "vip" },
    } as never);

    expect(updateBuilder.update).toHaveBeenCalledWith({
      custom_fields: { source: "referral", segment: "vip" },
    });
  });

  it("merges deal custom_fields patches before updating", async () => {
    const snapshotBuilder = createSelectBuilder({
      client_id: "client-1",
      custom_fields: { policy_number: "P-123" },
    });
    const customFieldsBuilder = createSelectBuilder({
      custom_fields: { policy_number: "P-123" },
    });
    const updateBuilder = createUpdateBuilder();
    mockFrom
      .mockReturnValueOnce(snapshotBuilder)
      .mockReturnValueOnce(customFieldsBuilder)
      .mockReturnValueOnce(updateBuilder);

    const { result } = renderHook(() => useUpdateDeal("deal-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      custom_fields: { coverage_amount: 250000 },
    } as never);

    expect(updateBuilder.update).toHaveBeenCalledWith({
      custom_fields: { policy_number: "P-123", coverage_amount: 250000 },
    });
  });

  it("merges task custom_fields patches before updating", async () => {
    const snapshotBuilder = createSelectBuilder({
      client_id: "client-1",
      custom_fields: { owner: "Sarah" },
    });
    const customFieldsBuilder = createSelectBuilder({
      custom_fields: { owner: "Sarah" },
    });
    const updateBuilder = createUpdateBuilder();
    mockFrom
      .mockReturnValueOnce(snapshotBuilder)
      .mockReturnValueOnce(customFieldsBuilder)
      .mockReturnValueOnce(updateBuilder);

    const { result } = renderHook(() => useUpdateCrmTask("task-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      custom_fields: { priority_note: "Call after 6pm" },
    } as never);

    expect(updateBuilder.update).toHaveBeenCalledWith({
      custom_fields: { owner: "Sarah", priority_note: "Call after 6pm" },
    });
  });
});
