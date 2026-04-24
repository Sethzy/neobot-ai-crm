/**
 * Tests for the full-page people detail route.
 * @module app/(dashboard)/customers/people/[contactId]/page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactDetailPage from "./page";

const {
  mockCreateClient,
  mockFrom,
  mockSelect,
  mockEq,
  mockSingle,
  mockContactDetailContent,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockSingle: vi.fn(),
  mockContactDetailContent: vi.fn(() => <div data-testid="contact-detail-content" />),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/components/crm/record-detail/contact-detail-content", () => ({
  ContactDetailContent: (props: unknown) => mockContactDetailContent(props),
}));

describe("ContactDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockCreateClient.mockResolvedValue({ from: mockFrom });
  });

  it("strips drawer state from the back link and forwards the server-fetched contact", async () => {
    mockSingle.mockResolvedValue({
      data: {
        contact_id: "contact-1",
        first_name: "New",
        last_name: "Contact",
        companies: null,
      },
      error: null,
    });

    render(await ContactDetailPage({
      params: Promise.resolve({ contactId: "contact-1" }),
      searchParams: Promise.resolve({
        from: "/customers/people?detail=contact-1&page=2",
      }),
    }));

    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(mockSelect).toHaveBeenCalledWith("*, companies!contacts_company_id_fkey(company_id, name)");
    expect(mockEq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(screen.getByRole("link", { name: "Back to People" })).toHaveAttribute(
      "href",
      "/customers/people?page=2",
    );

    expect(mockContactDetailContent.mock.calls[0]?.[0]).toMatchObject({
      contactId: "contact-1",
      surface: "page",
      initialContact: expect.objectContaining({
        contact_id: "contact-1",
        first_name: "New",
      }),
    });
  });

  it("renders without initial contact data when the server prefetch misses", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    render(await ContactDetailPage({
      params: Promise.resolve({ contactId: "contact-404" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("link", { name: "Back to People" })).toHaveAttribute(
      "href",
      "/customers/people",
    );
    expect(mockContactDetailContent.mock.calls[0]?.[0]).toMatchObject({
      contactId: "contact-404",
      surface: "page",
      initialContact: undefined,
    });
  });
});
