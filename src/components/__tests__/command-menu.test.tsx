/**
 * Tests the Attio-style global search dialog behavior.
 * Verifies unified records, detail routing, idle state, and reset flows.
 *
 * @module components/__tests__/command-menu
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandMenu } from "@/components/command-menu";
import type { GlobalSearchRecord } from "@/hooks/use-global-search";

const mockUseGlobalSearchRecords = vi.fn();
const mockTrackRecentSearchRecord = vi.fn();
const mockPush = vi.fn();

function createRecord(
  overrides: Partial<GlobalSearchRecord> & Pick<GlobalSearchRecord, "entityType" | "id" | "title">,
): GlobalSearchRecord {
  const baseKey = `${overrides.entityType}:${overrides.id}`;

  return {
    entityType: overrides.entityType,
    id: overrides.id,
    key: overrides.key ?? baseKey,
    title: overrides.title,
    subtitle: overrides.subtitle ?? null,
    meta: overrides.meta ?? null,
    badgeLabel: overrides.badgeLabel ?? "Record",
    href: overrides.href ?? `/records/${baseKey}`,
    imageUrl: overrides.imageUrl ?? null,
    updatedAt: overrides.updatedAt ?? "2026-04-20T10:30:00.000Z",
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({
    data: "client-123",
  }),
}));

vi.mock("@/hooks/use-global-search", () => ({
  useGlobalSearchRecords: (options: { open: boolean; query: string }) =>
    mockUseGlobalSearchRecords(options),
  trackRecentSearchRecord: (...args: unknown[]) => mockTrackRecentSearchRecord(...args),
}));

vi.mock("@/hooks/use-contacts", () => ({
  useContact: () => ({
    data: {
      first_name: "Sarah",
      last_name: "Tan",
      email: "sarah@example.com",
      phone: "+65 9000 1000",
      type: "buyer",
      companies: { name: "Acme Realty" },
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompany: () => ({
    data: {
      name: "Acme Realty",
      website: "https://acme.example",
      email: "hello@acme.example",
      phone: "+65 6123 4567",
      address: "1 Marina Boulevard",
      industry: "real_estate",
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-company-relations", () => ({
  useCompanyContacts: () => ({
    data: [{ contact_id: "c1" }],
  }),
  useCompanyDeals: () => ({
    data: [{ deal_id: "d1" }],
  }),
}));

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTask: () => ({
    data: {
      title: "Follow up call",
      status: "open",
      due_date: "2026-04-25",
      deals: { address: "12 Orchard Road" },
      contacts: { first_name: "Sarah", last_name: "Tan" },
      description: "Call to confirm updated budget.",
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-deals", () => ({
  useDeal: () => ({
    data: {
      address: "12 Orchard Road",
      stage: "qualified",
      amount: 1250000,
      companies: { name: "Acme Realty" },
      deal_contacts: [
        {
          is_primary: true,
          contacts: { first_name: "Sarah", last_name: "Tan" },
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
      {
        id: "th-1",
        title: "Update phone",
        sourceType: "manual",
      },
    ],
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("CommandMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGlobalSearchRecords.mockImplementation(
      ({ query }: { open: boolean; query: string }) => ({
        data:
          query.trim().length === 0
            ? [
                createRecord({
                  entityType: "contact",
                  id: "c1",
                  title: "Sarah Tan",
                  subtitle: "Acme Realty",
                  meta: "Buyer",
                  badgeLabel: "Person",
                  href: "/customers/people?detail=c1",
                }),
                createRecord({
                  entityType: "deal",
                  id: "d1",
                  title: "12 Orchard Road",
                  subtitle: "Acme Realty",
                  meta: "Qualified · $1.3M",
                  badgeLabel: "Deal",
                  href: "/customers/deals?detail=d1",
                }),
              ]
            : [
                createRecord({
                  entityType: "contact",
                  id: "c1",
                  title: "Sarah Tan",
                  subtitle: "Acme Realty",
                  meta: "Buyer",
                  badgeLabel: "Person",
                  href: "/customers/people?detail=c1",
                }),
                createRecord({
                  entityType: "company",
                  id: "co1",
                  title: "Acme Realty",
                  subtitle: "acme.example",
                  meta: "Real estate",
                  badgeLabel: "Company",
                  href: "/customers/companies?detail=co1",
                }),
                createRecord({
                  entityType: "deal",
                  id: "d1",
                  title: "12 Orchard Road",
                  subtitle: "Acme Realty",
                  meta: "Qualified · $1.3M",
                  badgeLabel: "Deal",
                  href: "/customers/deals?detail=d1",
                }),
                createRecord({
                  entityType: "task",
                  id: "t1",
                  title: "Follow up call",
                  subtitle: "12 Orchard Road",
                  meta: "Open · Due Apr 25",
                  badgeLabel: "Task",
                  href: "/tasks?detail=t1",
                }),
                createRecord({
                  entityType: "thread",
                  id: "th-1",
                  title: "Update phone",
                  subtitle: "Chat thread",
                  meta: "Updated Apr 20",
                  badgeLabel: "Thread",
                  href: "/chat/th-1",
                }),
              ],
        isLoading: false,
        isError: false,
      }),
    );
  });

  it("renders the Attio-style search input and idle records when open", () => {
    render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByPlaceholderText("Search records...")).toBeInTheDocument();
    expect(screen.getByText("Records")).toBeInTheDocument();
    expect(screen.getByText("Ask Sunder")).toBeInTheDocument();
    expect(screen.getAllByText("Sarah Tan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12 Orchard Road").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("shows a unified result list instead of grouped section headings", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "sa");

    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(5);
      expect(screen.getAllByText("Acme Realty").length).toBeGreaterThan(0);
      expect(screen.getByText("Follow up call")).toBeInTheDocument();
      expect(screen.getByText("Update phone")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Contacts$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Deals$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Tasks$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Threads$/)).not.toBeInTheDocument();
  });

  it("tracks recents, closes, and navigates using the new detail route", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<CommandMenu open onOpenChange={onOpenChange} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "sa");
    await waitFor(() =>
      expect(screen.getAllByRole("option")).toHaveLength(5),
    );

    await user.click(screen.getAllByRole("option")[1]!);

    expect(mockTrackRecentSearchRecord).toHaveBeenCalledWith(
      "client-123",
      expect.objectContaining({
        entityType: "company",
        id: "co1",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockPush).toHaveBeenCalledWith("/customers/companies?detail=co1");
  });

  it("opens task and thread routes from unified search results", async () => {
    const user = userEvent.setup();

    const firstRender = render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "sa");
    await waitFor(() =>
      expect(screen.getByText("Follow up call")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Follow up call"));
    expect(mockPush).toHaveBeenCalledWith("/tasks?detail=t1");

    mockPush.mockClear();
    firstRender.unmount();

    render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "sa");
    await waitFor(() =>
      expect(screen.getByText("Update phone")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Update phone"));
    expect(mockPush).toHaveBeenCalledWith("/chat/th-1");
  });

  it("clears the query and stale results after closing and reopening", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CommandMenu open onOpenChange={onOpenChange} />,
      {
        wrapper: createWrapper(),
      },
    );

    await user.type(screen.getByRole("combobox"), "sa");
    expect(screen.getByRole("combobox")).toHaveValue("sa");

    rerender(<CommandMenu open={false} onOpenChange={onOpenChange} />);
    rerender(<CommandMenu open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByText(/No results for/i)).not.toBeInTheDocument();
  });

  it("shows an explicit error state when search loading fails", async () => {
    const user = userEvent.setup();
    mockUseGlobalSearchRecords.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    });

    render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "sa");

    await waitFor(() => {
      expect(
        screen.getByText(/unable to load search results right now/i),
      ).toBeInTheDocument();
    });
  });

  it("shows an empty-state message for unmatched searches", async () => {
    const user = userEvent.setup();
    mockUseGlobalSearchRecords.mockImplementation(
      ({ query }: { open: boolean; query: string }) => ({
        data: query.trim().length === 0 ? [] : [],
        isLoading: false,
        isError: false,
      }),
    );

    render(<CommandMenu open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole("combobox"), "zzz");

    await waitFor(() => {
      expect(screen.getByText(/No results for “zzz”\./i)).toBeInTheDocument();
    });
  });
});
