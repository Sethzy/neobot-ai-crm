/**
 * Tests for the Daily Orchestrator client bootstrap component.
 * @module components/layout/default-automation-bootstrap
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultAutomationBootstrap } from "./default-automation-bootstrap";

function renderWithQueryClient(ui: React.ReactNode) {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("DefaultAutomationBootstrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the browser timezone exactly once on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ seeded: true }),
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<DefaultAutomationBootstrap />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automations/bootstrap-default",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      }),
    );
  });
});
