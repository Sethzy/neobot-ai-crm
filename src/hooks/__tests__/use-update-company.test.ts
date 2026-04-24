/**
 * Tests update mutation behavior for CRM companies.
 * @module hooks/__tests__/use-update-company
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { companyKeys } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-update-company";

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

describe("useUpdateCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: {
        company_id: "company-1",
        client_id: "client-1",
        name: "PropNex",
        industry: "property_agency",
        website: null,
        phone: null,
        email: null,
        address: null,
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

  it("updates the row and invalidates company query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(companyKeys.detail("company-1"), {
      company_id: "company-1",
      client_id: "client-1",
      name: "PropNex",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ phone: "+6591112222" });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "companies");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockUpdate).toHaveBeenCalledWith({ phone: "+6591112222" });
    expect(mockUpdateEq).toHaveBeenCalledWith("company_id", "company-1");
    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expect.any(String),
        recordType: "company",
        recordId: "company-1",
        action: "updated",
        actorType: "user",
        before: expect.objectContaining({
          company_id: "company-1",
          phone: null,
        }),
        after: expect.objectContaining({
          company_id: "company-1",
          phone: "+6591112222",
        }),
      }),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: companyKeys.all });
  });

  it("normalizes website, email, and phone through the shared save validators", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      website: "https://www.Acme.com/?utm=x",
      email: "  HELLO@ACME.COM  ",
      phone: "(212) 555-1234",
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      website: "acme.com",
      email: "hello@acme.com",
      phone: "+12125551234",
    });
  });

  it("rejects invalid website updates before writing to Supabase", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ website: "not a url" })).rejects.toThrow(
      "Doesn't look like a website",
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
    queryClient.setQueryData(companyKeys.detail("company-1"), {
      company_id: "company-1",
      client_id: "client-1",
      name: "PropNex",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      void result.current.mutateAsync({ website: "https://www.Acme.com/?utm=x" });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(companyKeys.detail("company-1"))).toMatchObject({
        website: "acme.com",
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
    queryClient.setQueryData(companyKeys.detail("company-1"), {
      company_id: "company-1",
      client_id: "client-1",
      name: "PropNex",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      custom_fields: {},
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ website: "not a url" })).rejects.toThrow(
      "Doesn't look like a website",
    );

    expect(queryClient.getQueryData(companyKeys.detail("company-1"))).toMatchObject({
      website: null,
    });
  });

  it("patches the cached company immediately in onMutate and rolls back on error", async () => {
    const error = { message: "update failed" };
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
    queryClient.setQueryData(companyKeys.detail("company-1"), {
      company_id: "company-1",
      client_id: "client-1",
      name: "PropNex",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      custom_fields: {},
    });
    queryClient.setQueryData(companyKeys.list({}), [
      {
        company_id: "company-1",
        client_id: "client-1",
        name: "PropNex",
        industry: "property_agency",
        website: null,
        phone: null,
        email: null,
        address: null,
        custom_fields: {},
      },
    ]);

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise!: Promise<unknown>;

    act(() => {
      mutationPromise = result.current.mutateAsync({ phone: "+6591112222" });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(companyKeys.detail("company-1"))).toMatchObject({
        phone: "+6591112222",
      });
      expect(queryClient.getQueryData(companyKeys.list({}))).toMatchObject([
        expect.objectContaining({
          phone: "+6591112222",
        }),
      ]);
    });

    resolveUpdate({ error });

    await expect(mutationPromise).rejects.toEqual(error);

    await waitFor(() => {
      expect(queryClient.getQueryData(companyKeys.detail("company-1"))).toMatchObject({
        phone: null,
      });
      expect(queryClient.getQueryData(companyKeys.list({}))).toMatchObject([
        expect.objectContaining({
          phone: null,
        }),
      ]);
    });
  });

  it("merges company custom_fields patches with the latest stored value before updating", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        company_id: "company-1",
        client_id: "client-1",
        name: "PropNex",
        industry: "property_agency",
        website: null,
        phone: null,
        email: null,
        address: null,
        custom_fields: { tier: "a", hq: "Singapore" },
      },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({
      data: { custom_fields: { tier: "a", hq: "Singapore" } },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(companyKeys.detail("company-1"), {
      company_id: "company-1",
      client_id: "client-1",
      name: "PropNex",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      custom_fields: { tier: "a", hq: "Singapore" },
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      custom_fields: { tier: "b" },
    });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "companies");
    expect(mockSelect).toHaveBeenNthCalledWith(1, "*");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "companies");
    expect(mockSelect).toHaveBeenNthCalledWith(2, "custom_fields");
    expect(mockUpdateEq).toHaveBeenCalledWith("company_id", "company-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      custom_fields: {
        tier: "b",
        hq: "Singapore",
      },
    });
  });
});
