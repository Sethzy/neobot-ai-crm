/**
 * Tests companies list quick-edit behavior.
 * @module app/(dashboard)/customers/companies/__tests__/page
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CompaniesPage from "../page";

const mockPush = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

vi.mock("@/hooks/use-companies", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-companies")>("@/hooks/use-companies");

  return {
    ...actual,
    usePaginatedCompanies: vi.fn(),
  };
});

vi.mock("@/hooks/use-update-company", () => ({
  useUpdateCompany: vi.fn(() => ({
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

describe("CompaniesPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);

    const { useCrmConfig } = await import("@/hooks/use-crm-config");
    const { usePaginatedCompanies } = await import("@/hooks/use-companies");

    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: {
          company_industries: ["agency", "developer"],
        },
      },
    } as never);

    vi.mocked(usePaginatedCompanies).mockReturnValue({
      data: {
        rows: [
          {
            company_id: "company-1",
            client_id: "client-1",
            name: "Acme Realty",
            industry: "agency",
            phone: "+6591234567",
            email: "hello@acme.example",
            website: "https://acme.example/",
            address: "1 Maxwell Road",
            notes: null,
            custom_fields: {},
            created_at: "2026-03-01T00:00:00+08:00",
            updated_at: "2026-03-05T00:00:00+08:00",
            contact_count: 3,
            deal_count: 2,
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

  it("preserves contact links while adding explicit edit affordances", () => {
    render(<CompaniesPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("link", { name: "Acme Realty" })).toHaveAttribute(
      "href",
      "/customers/companies/company-1",
    );
    expect(screen.getByRole("link", { name: "+6591234567" })).toHaveAttribute(
      "href",
      "tel:+6591234567",
    );
    expect(screen.getByRole("link", { name: "hello@acme.example" })).toHaveAttribute(
      "href",
      "mailto:hello@acme.example",
    );
    expect(screen.getByRole("link", { name: "acme.example" })).toHaveAttribute(
      "href",
      "https://acme.example/",
    );

    expect(screen.getByRole("button", { name: /edit phone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit website/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit industry/i })).toBeInTheDocument();
  });

  it("saves a phone edit without triggering row navigation", async () => {
    const user = userEvent.setup();

    render(<CompaniesPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /edit phone/i }));
    await user.clear(screen.getByRole("textbox", { name: /phone/i }));
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "+6590000000{Enter}");

    expect(mockMutateAsync).toHaveBeenCalledWith({ phone: "+6590000000" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("normalizes bare website domains before saving", async () => {
    const user = userEvent.setup();

    render(<CompaniesPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /edit website/i }));
    await user.clear(screen.getByRole("textbox", { name: /website/i }));
    await user.type(screen.getByRole("textbox", { name: /website/i }), "acme.example{Enter}");

    expect(mockMutateAsync).toHaveBeenCalledWith({ website: "https://acme.example" });
  });
});
