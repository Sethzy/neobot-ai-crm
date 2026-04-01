/**
 * Tests people list quick-edit behavior.
 * @module app/(dashboard)/customers/people/__tests__/page
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PeoplePage from "../page";

const mockPush = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

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
  contactKeys: { all: ["contacts"] },
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompanies: vi.fn(),
}));

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

  it("edits phone directly from the list without triggering row navigation", async () => {
    const user = userEvent.setup();

    render(<PeoplePage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "+65 9000 0000{Enter}");

    expect(mockMutateAsync).toHaveBeenCalledWith({ phone: "+65 9000 0000" });
    expect(mockPush).not.toHaveBeenCalled();
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
});
