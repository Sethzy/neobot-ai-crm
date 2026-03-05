/**
 * Tests for dashboard layout providers.
 * @module app/(dashboard)/layout.test
 */
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

describe("dashboard layout", () => {
  it("wraps children with thread and data stream providers", () => {
    render(
      <DashboardLayout>
        <div>Dashboard Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("thread-provider")).toBeInTheDocument();
    expect(screen.getByTestId("data-stream-provider")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });
});
