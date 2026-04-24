/**
 * Tests for dashboard layout providers.
 * @module app/(dashboard)/layout.test
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardLayout from "./layout";

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/thread-context", () => ({
  ThreadProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="thread-provider">{children}</div>
  ),
}));

vi.mock("@/components/chat/data-stream-provider", () => ({
  DataStreamProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="data-stream-provider">{children}</div>
  ),
}));

vi.mock("@/components/layout/default-automation-bootstrap", () => ({
  DefaultAutomationBootstrap: () => <div data-testid="default-automation-bootstrap" />,
}));

describe("dashboard layout", () => {
  it("wraps children with thread and data stream providers", async () => {
    const layout = await DashboardLayout({
      children: <div>Dashboard Content</div>,
    });
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        {layout}
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("thread-provider")).toBeInTheDocument();
    expect(screen.getByTestId("data-stream-provider")).toBeInTheDocument();
    expect(screen.getByTestId("default-automation-bootstrap")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });
});
