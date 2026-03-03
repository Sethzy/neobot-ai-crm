/**
 * Tests for CRM deal detail page states and rendering.
 * @module app/(dashboard)/crm/deals/[dealId]/__tests__/page
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

vi.mock("@/hooks/use-deals", () => ({
  useDeal: vi.fn(),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useDealInteractions: vi.fn(),
}));

vi.mock("@/components/crm/interaction-timeline", () => ({
  InteractionTimeline: ({ interactions }: { interactions: unknown[] }) => (
    <div>Interaction Timeline ({interactions.length})</div>
  ),
}));

import DealDetailPage from "../page";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const sampleDeal = {
  deal_id: "d-1",
  client_id: "cl-1",
  contact_id: "c-1",
  address: "123 Orchard Road",
  stage: "viewing" as const,
  price: 1500000,
  notes: "Follow up after weekend viewing",
  created_at: "2026-02-01T00:00:00+08:00",
  updated_at: "2026-03-01T00:00:00+08:00",
  contacts: { first_name: "John", last_name: "Smith" },
};

describe("DealDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders deal detail fields and timeline when loaded", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useParams).mockReturnValue({ dealId: "d-1" });
    vi.mocked(useDeal).mockReturnValue({
      data: sampleDeal,
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({
      data: [{ interaction_id: "i-1" }],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(screen.getAllByText("123 Orchard Road").length).toBeGreaterThan(0);
    expect(screen.getByText(/Follow up after weekend viewing/i)).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText(/Interaction Timeline \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /deals/i })).toHaveAttribute("href", "/crm/deals");
  });

  it("shows loading skeleton while deal query is pending", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useParams).mockReturnValue({ dealId: "d-1" });
    vi.mocked(useDeal).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({ data: [] } as never);

    const { container } = render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows not-found state when deal query errors", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useParams).mockReturnValue({ dealId: "d-missing" });
    vi.mocked(useDeal).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/deal not found/i)).toBeInTheDocument();
  });

  it("shows interaction loading state while interactions query is pending", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");

    vi.mocked(useParams).mockReturnValue({ dealId: "d-1" });
    vi.mocked(useDeal).mockReturnValue({
      data: sampleDeal,
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading interactions/i)).toBeInTheDocument();
    expect(screen.queryByText(/no interactions yet/i)).not.toBeInTheDocument();
  });

  it("shows interaction error state and retries when interactions query fails", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");
    const mockRefetchInteractions = vi.fn();

    vi.mocked(useParams).mockReturnValue({ dealId: "d-1" });
    vi.mocked(useDeal).mockReturnValue({
      data: sampleDeal,
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchInteractions,
    } as never);

    render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/unable to load interactions/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetchInteractions).toHaveBeenCalled();
  });

  it("keeps rendering deal data when detail refetch errors and retries", async () => {
    const { useParams } = await import("next/navigation");
    const { useDeal } = await import("@/hooks/use-deals");
    const { useDealInteractions } = await import("@/hooks/use-contact-relations");
    const mockRefetchDeal = vi.fn();

    vi.mocked(useParams).mockReturnValue({ dealId: "d-1" });
    vi.mocked(useDeal).mockReturnValue({
      data: sampleDeal,
      isLoading: false,
      isError: true,
      refetch: mockRefetchDeal,
    } as never);
    vi.mocked(useDealInteractions).mockReturnValue({
      data: [{ interaction_id: "i-1" }],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealDetailPage />, { wrapper: createWrapper() });

    expect(screen.getAllByText("123 Orchard Road").length).toBeGreaterThan(0);
    expect(screen.queryByText(/deal not found/i)).not.toBeInTheDocument();
    expect(screen.getByText(/unable to refresh deal details/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry deal/i }).click();
    expect(mockRefetchDeal).toHaveBeenCalled();
  });
});
