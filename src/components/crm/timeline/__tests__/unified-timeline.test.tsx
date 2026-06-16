/**
 * Tests for the unified CRM timeline component.
 * @module components/crm/timeline/__tests__/unified-timeline
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UnifiedTimeline } from "../unified-timeline";

const mockUseUnifiedTimeline = vi.fn();

vi.mock("@/hooks/use-unified-timeline", () => ({
  useUnifiedTimeline: (...args: unknown[]) => mockUseUnifiedTimeline(...args),
}));

describe("UnifiedTimeline", () => {
  it("renders loading and empty states", () => {
    mockUseUnifiedTimeline.mockReturnValueOnce({
      entries: [],
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<UnifiedTimeline recordType="contact" recordId="contact-1" />);

    expect(screen.getByText("Loading activity...")).toBeInTheDocument();

    mockUseUnifiedTimeline.mockReturnValueOnce({
      entries: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    rerender(<UnifiedTimeline recordType="contact" recordId="contact-1" />);

    expect(screen.getByText("No activity recorded")).toBeInTheDocument();
  });

  it("groups entries by month and renders audit plus interaction rows", async () => {
    const user = userEvent.setup();

    mockUseUnifiedTimeline.mockReturnValue({
      entries: [
        {
          kind: "audit",
          timestamp: "2026-04-05T09:00:00.000Z",
          data: {
            id: "activity-1",
            client_id: "client-1",
            record_type: "contact",
            record_id: "contact-1",
            name: "contact.updated",
            properties: {
              updatedFields: ["phone"],
              diff: {
                phone: { before: null, after: "+65 9876 5432" },
              },
              before: {
                first_name: "Sarah",
                last_name: "Tan",
                phone: null,
              },
              after: {
                first_name: "Sarah",
                last_name: "Tan",
                phone: "+65 9876 5432",
              },
            },
            actor_type: "user",
            actor_label: null,
            happened_at: "2026-04-05T09:00:00.000Z",
            created_at: "2026-04-05T09:00:00.000Z",
            updated_at: "2026-04-05T09:00:00.000Z",
          },
        },
        {
          kind: "audit",
          timestamp: "2026-04-04T09:00:00.000Z",
          data: {
            id: "activity-2",
            client_id: "client-1",
            record_type: "contact",
            record_id: "contact-1",
            name: "contact.updated",
            properties: {
              updatedFields: ["company_id", "type"],
              diff: {
                company_id: { before: null, after: "PropNex Realty" },
                type: { before: "buyer", after: "client" },
              },
              before: {
                first_name: "Sarah",
                last_name: "Tan",
                company_id: null,
                type: "buyer",
              },
              after: {
                first_name: "Sarah",
                last_name: "Tan",
                company_id: "PropNex Realty",
                type: "client",
              },
            },
            actor_type: "agent",
            actor_label: "NeoBot",
            happened_at: "2026-04-04T09:00:00.000Z",
            created_at: "2026-04-04T09:00:00.000Z",
            updated_at: "2026-04-04T09:00:00.000Z",
          },
        },
        {
          kind: "interaction",
          timestamp: "2026-04-03T09:00:00.000Z",
          data: {
            interaction_id: "interaction-1",
            client_id: "client-1",
            contact_id: "contact-1",
            deal_id: null,
            type: "call",
            summary: "Discussed Sunday viewing",
            occurred_at: "2026-04-03T09:00:00.000Z",
            created_at: "2026-04-03T09:00:00.000Z",
            updated_at: "2026-04-03T09:00:00.000Z",
          },
        },
        {
          kind: "audit",
          timestamp: "2026-03-20T09:00:00.000Z",
          data: {
            id: "activity-3",
            client_id: "client-1",
            record_type: "contact",
            record_id: "contact-1",
            name: "contact.created",
            properties: {
              after: {
                first_name: "Sarah",
                last_name: "Tan",
              },
            },
            actor_type: "user",
            actor_label: null,
            happened_at: "2026-03-20T09:00:00.000Z",
            created_at: "2026-03-20T09:00:00.000Z",
            updated_at: "2026-03-20T09:00:00.000Z",
          },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<UnifiedTimeline recordType="contact" recordId="contact-1" />);

    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) =>
        Boolean(
          node?.textContent?.includes("You updated")
          && node.textContent.includes("Phone")
          && node.textContent.includes("+65 9876 5432"),
        ),
      )[0],
    ).toBeInTheDocument();
    expect(screen.getByText(/Call/i)).toBeInTheDocument();
    expect(screen.getByText("Discussed Sunday viewing")).toBeInTheDocument();
    expect(screen.getByText(/Sarah Tan was created by You/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /NeoBot updated 2 fields on Sarah Tan/i }));

    expect(screen.getByText(/Company/i)).toBeInTheDocument();
    expect(screen.getByText(/PropNex Realty/i)).toBeInTheDocument();
    expect(screen.getByText(/Type/i)).toBeInTheDocument();
    expect(screen.getByText(/client/i)).toBeInTheDocument();
  });
});
