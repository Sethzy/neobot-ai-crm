/**
 * Tests for CRM contacts list page behavior.
 * @module app/(dashboard)/crm/contacts/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactsPage from "../page";

vi.mock("@/hooks/use-contacts", () => ({
  useContacts: vi.fn(),
}));

vi.mock("@/components/crm/contacts-table", () => ({
  ContactsTable: () => <div>Contacts Table</div>,
}));

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
});
