/**
 * Tests for linked deals panel in contact detail page.
 * @module components/crm/__tests__/contact-deals
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactDeals: vi.fn(),
}));

import { ContactDeals } from "../contact-deals";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ContactDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders linked deals with address, stage, and formatted price", async () => {
    const { useContactDeals } = await import("@/hooks/use-contact-relations");

    vi.mocked(useContactDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          contact_id: "c-1",
          address: "123 Orchard Road",
          stage: "viewing",
          price: 1500000,
          notes: null,
          created_at: "2026-02-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
        },
      ],
      isLoading: false,
    } as never);

    render(<ContactDeals contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
    expect(screen.getByText("viewing")).toBeInTheDocument();
    expect(screen.getByText(/\$1,500,000/)).toBeInTheDocument();
  });

  it("shows empty state when no linked deals exist", async () => {
    const { useContactDeals } = await import("@/hooks/use-contact-relations");

    vi.mocked(useContactDeals).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<ContactDeals contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/no linked deals/i)).toBeInTheDocument();
  });

  it("shows error state and retries when fetch fails", async () => {
    const { useContactDeals } = await import("@/hooks/use-contact-relations");
    const mockRefetch = vi.fn();

    vi.mocked(useContactDeals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<ContactDeals contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/unable to load linked deals/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
