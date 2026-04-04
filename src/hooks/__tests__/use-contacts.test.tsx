/**
 * Tests for CRM contact query hooks.
 * @module hooks/__tests__/use-contacts
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  contactKeys,
  useContact,
  useContacts,
} from "@/hooks/use-contacts";

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
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolvePromise };
}

describe("contactKeys", () => {
  it("builds stable contact key namespaces", () => {
    expect(contactKeys.all).toEqual(["contacts"]);
    expect(contactKeys.lists()).toEqual(["contacts", "list"]);
    expect(contactKeys.list({ search: "john", type: "buyer" })).toEqual([
      "contacts",
      "list",
      { search: "john", type: "buyer" },
    ]);
    expect(contactKeys.detail("contact-1")).toEqual(["contacts", "detail", "contact-1"]);
  });
});

describe("useContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches contacts ordered by updated_at descending", async () => {
    const builder = createThenableBuilder([
      { contact_id: "contact-1", first_name: "John", last_name: "Smith" },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(builder.select).toHaveBeenCalledWith("*, companies!contacts_company_id_fkey(company_id, name)");
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("applies search via or() on first_name,last_name,email,phone", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({ search: "john" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledTimes(1);
    expect(builder.or.mock.calls[0]?.[0]).toContain("first_name.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("last_name.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("email.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("phone.ilike");
  });

  it("applies contact type filter with eq()", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({ type: "buyer" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("type", "buyer");
  });

  it("applies saved view filters and sort overrides", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(
      () =>
        useContacts({
          viewFilters: { created_at_after: "2026-04-01" },
          viewSort: {
            column: "first_name",
            ascending: true,
          },
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.order).toHaveBeenCalledWith("first_name", { ascending: true });
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-04-01");
  });

  it("wires realtime invalidation for contacts and companies tables", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "contacts",
      filter: "client_id=eq.client-1",
      queryKeys: [contactKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "companies",
      filter: "client_id=eq.client-1",
      queryKeys: [contactKeys.all],
      enabled: true,
    });
  });

  it("surfaces Supabase errors", async () => {
    const builder = createThenableBuilder([], { message: "RLS denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches one contact by contact_id", async () => {
    const builder = createThenableBuilder([
      { contact_id: "contact-1", first_name: "John", last_name: "Smith" },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContact("contact-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.select).toHaveBeenCalledWith("*, companies!contacts_company_id_fkey(company_id, name)");
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(builder.single).toHaveBeenCalled();
  });

  it("does not fetch when contactId is empty", () => {
    const { result } = renderHook(() => useContact(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not keep previous contact data while loading a new contact id", async () => {
    const firstBuilder = createThenableBuilder([
      { contact_id: "contact-1", first_name: "John", last_name: "Smith" },
    ]);
    const deferred = createDeferred<{
      data: { contact_id: string; first_name: string; last_name: string };
      error: null;
    }>();

    const secondBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue(deferred.promise),
    };

    let queryBuilderCallCount = 0;
    mockFrom.mockImplementation(() => {
      queryBuilderCallCount += 1;
      return queryBuilderCallCount === 1 ? firstBuilder : secondBuilder;
    });

    const { result, rerender } = renderHook(
      ({ contactId }) => useContact(contactId),
      {
        initialProps: { contactId: "contact-1" },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() =>
      expect(
        (result.current.data as { contact_id?: string } | undefined)?.contact_id,
      ).toBe("contact-1"),
    );

    rerender({ contactId: "contact-2" });

    expect(result.current.data).toBeUndefined();

    deferred.resolvePromise({
      data: { contact_id: "contact-2", first_name: "Jane", last_name: "Doe" },
      error: null,
    });

    await waitFor(() =>
      expect(
        (result.current.data as { contact_id?: string } | undefined)?.contact_id,
      ).toBe("contact-2"),
    );
  });
});
