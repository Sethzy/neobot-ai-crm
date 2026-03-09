/**
 * Tests for CRM companies list page behavior.
 * @module app/(dashboard)/crm/companies/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import CompaniesPage from "../page";

vi.mock("@/hooks/use-companies", () => ({
  useCompanies: vi.fn(),
}));

vi.mock("@/hooks/use-company-relations", () => ({
  useCompanyRelationCounts: vi.fn(),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

vi.mock("@/components/crm/companies-table", () => ({
  CompaniesTable: () => <div>Companies Table</div>,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  const SelectContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  } | null>(null);

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const context = React.useContext(SelectContext);

      return (
        <select
          aria-label="Company industry filter"
          value={context?.value}
          onChange={(event) => context?.onValueChange(event.target.value)}
        >
          {children}
        </select>
      );
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => <option value={value}>{children}</option>,
  };
});

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

describe("CompaniesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    void import("@/hooks/use-crm-config").then(({ useCrmConfig }) => {
      vi.mocked(useCrmConfig).mockReturnValue({
        data: {
          hasConfig: false,
          config: CRM_DEFAULTS,
        },
      } as never);
    });

    void import("@/hooks/use-company-relations").then(({ useCompanyRelationCounts }) => {
      vi.mocked(useCompanyRelationCounts).mockReturnValue({
        data: {},
      } as never);
    });
  });

  it("shows error state and retries when companies query fails", async () => {
    const { useCompanies } = await import("@/hooks/use-companies");
    const mockRefetch = vi.fn();

    vi.mocked(useCompanies).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<CompaniesPage />);

    expect(screen.getByText(/unable to load companies/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("uses configured company industries in the filter", async () => {
    const user = userEvent.setup();
    const { useCompanies } = await import("@/hooks/use-companies");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useCompanies).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: true,
        config: {
          ...CRM_DEFAULTS,
          company_label: "Brokerage",
          company_industries: ["property_agency", "mortgage_broker"],
        },
      },
    } as never);

    render(<CompaniesPage />);

    await user.selectOptions(screen.getByRole("combobox", { name: /company industry filter/i }), "mortgage_broker");

    expect(vi.mocked(useCompanies)).toHaveBeenLastCalledWith({
      search: undefined,
      industry: "mortgage_broker",
    });
  });

  it("uses default industries and config-driven page copy when no explicit config exists", async () => {
    const { useCompanies } = await import("@/hooks/use-companies");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useCompanies).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: {
          ...CRM_DEFAULTS,
          company_label: "Brokerage",
        },
      },
    } as never);

    render(<CompaniesPage />);

    expect(screen.getByRole("heading", { name: "Brokerages" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /company industry filter/i })).toHaveTextContent("Property Agency");
    expect(screen.getByRole("combobox", { name: /company industry filter/i })).toHaveTextContent("Developer");
  });
});
