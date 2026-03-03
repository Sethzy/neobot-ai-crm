/**
 * Tests for CRM contact detail page states and rendering.
 * @module app/(dashboard)/crm/contacts/[contactId]/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

vi.mock("@/hooks/use-contacts", () => ({
  useContact: vi.fn(),
}));

vi.mock("@/components/crm/contact-deals", () => ({
  ContactDeals: () => <div>Deals Section</div>,
}));

vi.mock("@/components/crm/contact-timeline", () => ({
  ContactTimeline: () => <div>Activity Section</div>,
}));

import ContactDetailPage from "../page";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const sampleContact = {
  contact_id: "c-1",
  client_id: "cl-1",
  first_name: "John",
  last_name: "Smith",
  email: "john@example.com",
  phone: "+6591234567",
  type: "buyer" as const,
  notes: "Met at condo viewing on Orchard Road",
  created_at: "2026-02-01T00:00:00+08:00",
  updated_at: "2026-03-01T00:00:00+08:00",
};

describe("ContactDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders contact profile fields when loaded", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getAllByText("John Smith").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("buyer")).toBeInTheDocument();
    expect(screen.getByText(/Met at condo viewing/)).toBeInTheDocument();
  });

  it("renders breadcrumb link back to contacts list", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("link", { name: /crm/i })).toHaveAttribute("href", "/crm");
    expect(screen.getByRole("link", { name: /contacts/i })).toHaveAttribute(
      "href",
      "/crm/contacts",
    );
  });

  it("shows loading skeleton while query is pending", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });
    vi.mocked(useContact).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    const { container } = render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows not-found state when contact query errors", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-missing" });
    vi.mocked(useContact).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/contact not found/i)).toBeInTheDocument();
  });

  it("renders tabs for linked deals and activity", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("tab", { name: /deals/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByText("Deals Section")).toBeInTheDocument();
  });

  it("does not render stale contact details for a mismatched route id", async () => {
    const { useParams } = await import("next/navigation");
    const { useContact } = await import("@/hooks/use-contacts");

    vi.mocked(useParams).mockReturnValue({ contactId: "c-2" });
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    const { container } = render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("Deals Section")).not.toBeInTheDocument();
  });
});
