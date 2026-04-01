/**
 * Tests for the customers dashboard pipeline-overview panel.
 * @module components/crm/dashboard/__tests__/pipeline-overview
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PipelineOverview,
  summarizePipelineStages,
} from "@/components/crm/dashboard/pipeline-overview";
import { CRM_DEFAULTS } from "@/lib/crm/config";

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

describe("summarizePipelineStages", () => {
  it("aggregates counts and values in configured stage order", () => {
    expect(
      summarizePipelineStages(
        [
          { stage: "negotiation", amount: 1_500_000 },
          { stage: "offer", amount: 300_000 },
          { stage: "negotiation", amount: 600_000 },
        ] as never,
        ["offer", "negotiation"],
      ),
    ).toEqual([
      { stage: "offer", count: 1, totalValue: 300_000 },
      { stage: "negotiation", count: 2, totalValue: 2_100_000 },
    ]);
  });
});

describe("PipelineOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stage summaries with aggregated values and drill-down links", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useDeals).mockReturnValue({
      data: [
        { deal_id: "deal-1", stage: "negotiation", amount: 1_500_000 },
        { deal_id: "deal-2", stage: "offer", amount: 300_000 },
        { deal_id: "deal-3", stage: "negotiation", amount: 600_000 },
      ],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: true,
        config: {
          ...CRM_DEFAULTS,
          deal_stages: ["offer", "negotiation", "closing"],
        },
      },
    } as never);

    render(<PipelineOverview />);

    expect(screen.getByText("Offer")).toBeInTheDocument();
    expect(screen.getByText("Negotiation")).toBeInTheDocument();
    expect(screen.getByText("$300K")).toBeInTheDocument();
    expect(screen.getByText("$2.1M")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open pipeline/i })).toHaveAttribute(
      "href",
      "/customers/deals/pipeline",
    );
    expect(screen.getByRole("link", { name: /offer/i })).toHaveAttribute(
      "href",
      "/customers/deals?stage=offer",
    );
  });

  it("shows an empty state when no deals exist", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useDeals).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: CRM_DEFAULTS,
      },
    } as never);

    render(<PipelineOverview />);

    expect(screen.getByText(/no deals in the pipeline yet/i)).toBeInTheDocument();
  });

  it("shows an error state and retries on demand", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");
    const mockRefetch = vi.fn();
    const user = userEvent.setup();

    vi.mocked(useDeals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: CRM_DEFAULTS,
      },
    } as never);

    render(<PipelineOverview />);

    expect(
      screen.getByText(/unable to load pipeline overview/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
