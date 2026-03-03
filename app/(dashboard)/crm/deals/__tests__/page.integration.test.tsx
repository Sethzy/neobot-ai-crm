/**
 * Integration test for deals page rendering with real table component.
 * @module app/(dashboard)/crm/deals/__tests__/page.integration
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DealsPage from "../page";

const mockPush = vi.fn();
const mockPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}));

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

describe("DealsPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders deal rows via DealsTable when data exists", async () => {
    const { useDeals } = await import("@/hooks/use-deals");

    vi.mocked(useDeals).mockReturnValue({
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
          contacts: { first_name: "John", last_name: "Smith" },
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealsPage />);

    expect(screen.getByRole("link", { name: "123 Orchard Road" })).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });
});
