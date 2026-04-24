/**
 * Tests update mutation behavior for CRM contacts.
 * @module hooks/__tests__/use-update-contact
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contactKeys } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-update-contact";

const mockCaptureTimelineActivity = vi.fn().mockResolvedValue(true);
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockSelectEq = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUpdateContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: {
        contact_id: "contact-1",
        client_id: "client-1",
        first_name: "Sarah",
        last_name: "Tan",
        phone: null,
        email: "sarah@example.com",
        type: "seller",
        company_id: null,
        custom_fields: {},
      },
      error: null,
    });
    mockSelectEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });
  });

  it("updates the row and invalidates contact query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
      company_id: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ phone: "+6591112222" });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "contacts");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockUpdate).toHaveBeenCalledWith({ phone: "+6591112222" });
    expect(mockUpdateEq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expect.any(String),
        recordType: "contact",
        recordId: "contact-1",
        action: "updated",
        actorType: "user",
        before: expect.objectContaining({
          contact_id: "contact-1",
          phone: null,
        }),
        after: expect.objectContaining({
          contact_id: "contact-1",
          phone: "+6591112222",
        }),
      }),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: contactKeys.all });
  });

  it("supports updating company_id on a contact", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
      company_id: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ company_id: "company-1" });

    expect(mockUpdate).toHaveBeenCalledWith({ company_id: "company-1" });
  });

  it("normalizes email and phone through the shared save validators", async () => {
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
      email: "  Sarah@Example.COM  ",
      phone: "(212) 555-1234",
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      email: "sarah@example.com",
      phone: "+12125551234",
    });
  });

  it("rejects invalid email updates before writing to Supabase", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ email: "hello" })).rejects.toThrow(
      "Doesn't look like an email",
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("uses canonicalized values for the optimistic cache patch", async () => {
    let resolveUpdate!: (value: { error: null }) => void;
    mockUpdateEq.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
      company_id: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      void result.current.mutateAsync({ phone: "(212) 555-1234" });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(contactKeys.detail("contact-1"))).toMatchObject({
        phone: "+12125551234",
      });
    });

    resolveUpdate({ error: null });
  });

  it("skips the optimistic cache patch when validation fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
      company_id: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ email: "hello" })).rejects.toThrow(
      "Doesn't look like an email",
    );

    expect(queryClient.getQueryData(contactKeys.detail("contact-1"))).toMatchObject({
      email: "sarah@example.com",
    });
  });

  it("patches the cached contact immediately in onMutate and rolls back on error", async () => {
    const error = { message: "permission denied" };
    let resolveUpdate!: (value: { error: typeof error | null }) => void;
    mockUpdateEq.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
        company_id: null,
        custom_fields: {},
      });
    queryClient.setQueryData(contactKeys.list({}), [
      {
        contact_id: "contact-1",
        client_id: "client-1",
        first_name: "Sarah",
        last_name: "Tan",
        phone: null,
        email: "sarah@example.com",
        type: "seller",
        company_id: null,
        custom_fields: {},
      },
    ]);

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise!: Promise<unknown>;

    act(() => {
      mutationPromise = result.current.mutateAsync({ phone: "+6591112222" });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(contactKeys.detail("contact-1"))).toMatchObject({
        phone: "+6591112222",
      });
      expect(queryClient.getQueryData(contactKeys.list({}))).toMatchObject([
        expect.objectContaining({
          phone: "+6591112222",
        }),
      ]);
    });

    resolveUpdate({ error });

    await expect(mutationPromise).rejects.toEqual(error);

    await waitFor(() => {
      expect(queryClient.getQueryData(contactKeys.detail("contact-1"))).toMatchObject({
        phone: null,
      });
      expect(queryClient.getQueryData(contactKeys.list({}))).toMatchObject([
        expect.objectContaining({
          phone: null,
        }),
      ]);
    });
  });

  it("merges custom_fields patches with the latest stored value before updating", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        contact_id: "contact-1",
        client_id: "client-1",
        first_name: "Sarah",
        last_name: "Tan",
        phone: null,
        email: "sarah@example.com",
        type: "seller",
        company_id: null,
        custom_fields: { segment: "vip", preferred_channel: "whatsapp" },
      },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({
      data: { custom_fields: { segment: "vip", preferred_channel: "whatsapp" } },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(contactKeys.detail("contact-1"), {
      contact_id: "contact-1",
      client_id: "client-1",
      first_name: "Sarah",
      last_name: "Tan",
      phone: null,
      email: "sarah@example.com",
      type: "seller",
      company_id: null,
      custom_fields: { segment: "vip", preferred_channel: "whatsapp" },
    });

    const { result } = renderHook(() => useUpdateContact("contact-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      custom_fields: { segment: "standard" },
    });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "contacts");
    expect(mockSelect).toHaveBeenNthCalledWith(1, "*");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "contacts");
    expect(mockSelect).toHaveBeenNthCalledWith(2, "custom_fields");
    expect(mockUpdateEq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      custom_fields: {
        segment: "standard",
        preferred_channel: "whatsapp",
      },
    });
  });
});
