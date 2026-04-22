/**
 * Tests for server-side hydration on the automations route.
 * @module app/(dashboard)/automations/page-server
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AutomationsPage from "./page";

const mockCreateClient = vi.fn();
const mockListAutomationTriggers = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/lib/triggers/automation-trigger-query", async () => {
  const actual = await vi.importActual<typeof import("@/lib/triggers/automation-trigger-query")>(
    "@/lib/triggers/automation-trigger-query",
  );

  return {
    ...actual,
    listAutomationTriggers: (...args: Parameters<typeof mockListAutomationTriggers>) =>
      mockListAutomationTriggers(...args),
  };
});

vi.mock("./automations-page-client", () => ({
  AutomationsPageClient: () => <div data-testid="automations-page-client">Automations client</div>,
}));

describe("AutomationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefetches the trigger list before rendering the client page", async () => {
    const supabase = { from: vi.fn() };
    mockCreateClient.mockResolvedValue(supabase);
    mockListAutomationTriggers.mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        {await AutomationsPage()}
      </QueryClientProvider>,
    );

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockListAutomationTriggers).toHaveBeenCalledWith(supabase);
    expect(screen.getByTestId("automations-page-client")).toBeInTheDocument();
  });
});
