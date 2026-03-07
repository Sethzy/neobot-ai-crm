/**
 * Tests update mutation behavior for CRM contacts.
 * @module hooks/__tests__/use-update-contact
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contactKeys } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockSelectEq = vi.fn();
const mockSingle = vi.fn();
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

describe("useUpdateContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { custom_fields: {} }, error: null });
    mockSelectEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("updates the row and invalidates contact query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ phone: "+6591112222" });

    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(mockUpdate).toHaveBeenCalledWith({ phone: "+6591112222" });
    expect(mockEq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: contactKeys.all });
  });

  it("throws when Supabase returns an update error", async () => {
    const error = { message: "permission denied" };
    mockEq.mockResolvedValue({ error });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ phone: "+6591112222" })).rejects.toEqual(error);
  });

  it("merges custom_fields patches with the latest stored value before updating", async () => {
    mockFrom.mockReset();
    mockFrom
      .mockImplementationOnce(() => ({ select: mockSelect }))
      .mockImplementationOnce(() => ({ update: mockUpdate }));
    mockSingle.mockResolvedValue({
      data: { custom_fields: { segment: "vip", preferred_channel: "whatsapp" } },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      custom_fields: { segment: "standard" },
    });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "contacts");
    expect(mockSelect).toHaveBeenCalledWith("custom_fields");
    expect(mockSelectEq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "contacts");
    expect(mockUpdate).toHaveBeenCalledWith({
      custom_fields: {
        segment: "standard",
        preferred_channel: "whatsapp",
      },
    });
  });
});
