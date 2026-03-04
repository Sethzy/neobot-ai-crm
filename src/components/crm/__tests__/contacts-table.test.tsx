/**
 * Tests for CRM contacts table rendering and row click behavior.
 * @module components/crm/__tests__/contacts-table
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContactsTable } from "../contacts-table";

const sampleContacts = [
  {
    contact_id: "c-1",
    client_id: "cl-1",
    first_name: "John",
    last_name: "Smith",
    email: "john@example.com",
    phone: "+6591234567",
    type: "buyer" as const,
    notes: null,
    created_at: "2026-02-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
  },
  {
    contact_id: "c-2",
    client_id: "cl-1",
    first_name: "Sarah",
    last_name: "Lee",
    email: null,
    phone: null,
    type: "seller" as const,
    notes: "Interested in Bukit Timah",
    created_at: "2026-02-15T00:00:00+08:00",
    updated_at: "2026-02-28T00:00:00+08:00",
  },
];

describe("ContactsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders contact name, contact channels, and type", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("buyer")).toBeInTheDocument();
    expect(screen.getByText("seller")).toBeInTheDocument();
  });

  test("renders email and phone values as actionable links", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    const emailLink = screen.getByText("john@example.com").closest("a");
    const phoneLink = screen.getByText("+6591234567").closest("a");

    expect(emailLink).toHaveAttribute("href", "mailto:john@example.com");
    expect(phoneLink).toHaveAttribute("href", "tel:+6591234567");
  });

  test("calls onRowClick with contact id when clicking a row", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<ContactsTable contacts={sampleContacts} onRowClick={onRowClick} />);

    const rows = screen.getAllByRole("row");
    await user.click(rows[1]);

    expect(onRowClick).toHaveBeenCalledWith("c-1");
  });

  test("does not trigger onRowClick when clicking an inline link", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<ContactsTable contacts={sampleContacts} onRowClick={onRowClick} />);

    await user.click(screen.getByText("john@example.com"));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  test("renders placeholders for missing email and phone", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    const row = screen.getByText("Sarah Lee").closest("tr");
    expect(row).not.toBeNull();

    const placeholders = within(row as HTMLElement).getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
  });

  test("renders empty state when no contacts are available", () => {
    render(<ContactsTable contacts={[]} />);

    expect(screen.getByText(/no contacts yet/i)).toBeInTheDocument();
  });
});
