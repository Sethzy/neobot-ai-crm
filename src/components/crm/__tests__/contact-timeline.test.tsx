/**
 * Tests for contact interaction timeline panel.
 * @module components/crm/__tests__/contact-timeline
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactInteractions: vi.fn(),
}));

import { ContactTimeline } from "../contact-timeline";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ContactTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders interaction type and summary rows", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useContactInteractions).mockReturnValue({
      data: [
        {
          interaction_id: "i-1",
          client_id: "cl-1",
          contact_id: "c-1",
          deal_id: null,
          type: "call",
          summary: "Discussed pricing for Orchard unit",
          occurred_at: "2026-03-01T10:30:00+08:00",
          created_at: "2026-03-01T10:30:00+08:00",
          updated_at: "2026-03-01T10:30:00+08:00",
        },
        {
          interaction_id: "i-2",
          client_id: "cl-1",
          contact_id: "c-1",
          deal_id: "d-1",
          type: "viewing",
          summary: "Viewing at 123 Orchard Road",
          occurred_at: "2026-02-28T14:00:00+08:00",
          created_at: "2026-02-28T14:00:00+08:00",
          updated_at: "2026-02-28T14:00:00+08:00",
        },
      ],
      isLoading: false,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("call")).toBeInTheDocument();
    expect(screen.getByText("viewing")).toBeInTheDocument();
    expect(screen.getByText(/Discussed pricing/)).toBeInTheDocument();
    expect(screen.getByText(/Viewing at 123 Orchard Road/)).toBeInTheDocument();
  });

  it("shows empty state when there is no contact activity", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useContactInteractions).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/no activity recorded/i)).toBeInTheDocument();
  });

  it("shows a lightweight inline loading state while activity is fetching", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useContactInteractions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });

  it("shows error state and retries when timeline query fails", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");
    const mockRefetch = vi.fn();

    vi.mocked(useContactInteractions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/unable to load activity timeline/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
