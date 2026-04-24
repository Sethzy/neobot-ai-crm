/**
 * Tests people list quick-edit behavior.
 * @module app/(dashboard)/customers/people/__tests__/page
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PeoplePage from "../page";

const mockPush = vi.fn();
const mockOpen = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockCaptureTimelineActivity = vi.fn().mockResolvedValue(true);
const mockFrom = vi.fn();
const mockedListTable = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/customers/people",
}));

vi.mock("@/hooks/use-contacts", () => ({
  usePaginatedContacts: vi.fn(),
  contactKeys: {
    all: ["contacts"],
    lists: () => ["contacts", "list"],
    detail: (contactId: string) => ["contacts", "detail", contactId],
  },
}));

vi.mock("@/hooks/use-companies", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-companies")>("@/hooks/use-companies");

  return {
    ...actual,
    useCompanies: vi.fn(),
  };
});

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

vi.mock("@/hooks/use-update-contact", () => ({
  useUpdateContact: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
  })),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1", isLoading: false }),
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    recordId: null,
    open: mockOpen,
  }),
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return { unsubscribe: vi.fn() };
      },
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/components/ui/list-table", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui/list-table")>(
    "@/components/ui/list-table",
  );

  return {
    ...actual,
    ListTable: (props: unknown) => {
      mockedListTable(props);
      return actual.ListTable(props as never);
    },
  };
});

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

describe("PeoplePage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { usePaginatedContacts } = await import("@/hooks/use-contacts");
    const { useCompanies } = await import("@/hooks/use-companies");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: {
          contact_types: ["buyer", "seller"],
        },
      },
    } as never);

    vi.mocked(useCompanies).mockReturnValue({
      data: [
        {
          company_id: "company-1",
          name: "Acme Realty",
          industry: null,
          phone: null,
          email: null,
          website: null,
          address: null,
          notes: null,
          custom_fields: {},
          created_at: "2026-03-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
          contact_count: 0,
          deal_count: 0,
          client_id: "client-1",
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    vi.mocked(usePaginatedContacts).mockReturnValue({
      data: {
        rows: [
          {
            contact_id: "contact-1",
            client_id: "client-1",
            first_name: "Sarah",
            last_name: "Chen",
            email: "sarah@example.com",
            phone: "+65 9123 4567",
            type: "buyer",
            company_id: "company-1",
            notes: null,
            custom_fields: {},
            created_at: "2026-03-01T00:00:00+08:00",
            updated_at: "2026-03-05T00:00:00+08:00",
            companies: { company_id: "company-1", name: "Acme Realty" },
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it("normalizes phone input before saving without triggering row navigation", async () => {
    const user = userEvent.setup();

    render(<PeoplePage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "(212) 555-1234{Enter}");

    expect(mockMutateAsync).toHaveBeenCalledWith({ phone: "+12125551234" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a validation error for invalid email edits and does not save", async () => {
    const user = userEvent.setup();

    render(<PeoplePage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /edit email/i }));
    await user.clear(screen.getByRole("textbox", { name: /email/i }));
    await user.type(screen.getByRole("textbox", { name: /email/i }), "hello{Enter}");

    expect(await screen.findByText("Doesn't look like an email")).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("keeps name as button and contact channels as links in read mode", () => {
    render(<PeoplePage />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: /sarah chen/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sarah@example.com/i })).toHaveAttribute(
      "href",
      "mailto:sarah@example.com",
    );
    expect(screen.getByRole("link", { name: /\+65 9123 4567/i })).toHaveAttribute(
      "href",
      "tel:+65 9123 4567",
    );
    expect(screen.getByRole("link", { name: /acme realty/i })).toHaveAttribute(
      "href",
      "/customers/companies/company-1",
    );
  });

  it("shows explicit edit buttons for quick-fix fields", () => {
    render(<PeoplePage />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: /edit phone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit type/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit company/i })).toBeInTheDocument();
  });

  it("reuses stable list callbacks across rerenders", () => {
    const { rerender } = render(<PeoplePage />, { wrapper: createWrapper() });

    const firstProps = mockedListTable.mock.lastCall?.[0];

    rerender(<PeoplePage />);

    const secondProps = mockedListTable.mock.lastCall?.[0];

    expect(secondProps.onRowClick).toBe(firstProps.onRowClick);
    expect(secondProps.getRowId).toBe(firstProps.getRowId);
    expect(secondProps.rowActions).toBe(firstProps.rowActions);
  });

  it("captures a created timeline activity when a contact is created from the page", async () => {
    const user = userEvent.setup();
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        contact_id: "contact-2",
        client_id: "client-1",
        first_name: "New",
        last_name: "Contact",
        email: null,
        phone: null,
        type: "buyer",
        company_id: null,
        custom_fields: {},
        created_at: "2026-04-05T10:00:00+08:00",
        updated_at: "2026-04-05T10:00:00+08:00",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    mockFrom.mockImplementation((table: string) => {
      if (table === "contacts") {
        return { insert };
      }

      return {};
    });

    render(<PeoplePage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /^new$/i }));

    await waitFor(() => {
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          recordType: "contact",
          recordId: "contact-2",
          action: "created",
          actorType: "user",
          after: expect.objectContaining({
            contact_id: "contact-2",
          }),
        }),
      );
    });
    expect(mockOpen).toHaveBeenCalledWith("contact-2");
  });

  it("captures a deleted timeline activity when a contact is deleted from the page", async () => {
    const user = userEvent.setup();
    const selectSingle = vi.fn().mockResolvedValue({
      data: {
        contact_id: "contact-1",
        client_id: "client-1",
        first_name: "Sarah",
        last_name: "Chen",
        email: "sarah@example.com",
        phone: "+65 9123 4567",
        type: "buyer",
        company_id: "company-1",
        custom_fields: {},
        created_at: "2026-03-01T00:00:00+08:00",
        updated_at: "2026-03-05T00:00:00+08:00",
      },
      error: null,
    });
    const selectEq = vi.fn().mockReturnValue({ single: selectSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteBuilder = vi.fn().mockReturnValue({ eq: deleteEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === "contacts") {
        return { select, delete: deleteBuilder };
      }

      return {};
    });

    render(<PeoplePage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Open row actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          recordType: "contact",
          recordId: "contact-1",
          action: "deleted",
          actorType: "user",
          before: expect.objectContaining({
            contact_id: "contact-1",
          }),
        }),
      );
    });
  });
});
