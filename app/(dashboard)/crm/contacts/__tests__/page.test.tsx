/**
 * Tests for CRM contacts list page behavior.
 * @module app/(dashboard)/crm/contacts/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import ContactsPage from "../page";

vi.mock("@/hooks/use-contacts", () => ({
  useContacts: vi.fn(),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

vi.mock("@/components/crm/contacts-table", () => ({
  ContactsTable: () => <div>Contacts Table</div>,
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
          aria-label="Contact type filter"
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

describe("ContactsPage", () => {
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
  });

  it("shows error state and retries when contacts query fails", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const mockRefetch = vi.fn();

    vi.mocked(useContacts).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<ContactsPage />);

    expect(screen.getByText(/unable to load contacts/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("uses configured contact types in the filter", async () => {
    const user = userEvent.setup();
    const { useContacts } = await import("@/hooks/use-contacts");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useContacts).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: true,
        config: {
          ...CRM_DEFAULTS,
          contact_types: ["buyer", "first_time_buyer"],
        },
      },
    } as never);

    render(<ContactsPage />);

    await user.selectOptions(screen.getByRole("combobox", { name: /contact type filter/i }), "first_time_buyer");

    expect(vi.mocked(useContacts)).toHaveBeenLastCalledWith({
      search: undefined,
      type: "first_time_buyer",
    });
  });
});
