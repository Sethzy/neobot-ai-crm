/**
 * Tests for the inline ViewCard renderer.
 * @module components/views/view-card.test
 */
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@json-render/react", () => ({
  Renderer: ({ spec }: { spec: unknown }) => (
    <div data-testid="json-render-renderer" data-spec={JSON.stringify(spec)} />
  ),
  StateProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="json-render-state-provider">{children}</div>
  ),
  VisibilityProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="json-render-visibility-provider">{children}</div>
  ),
}));

vi.mock("@/lib/views/registry", () => ({
  registry: {},
}));

import { ViewCard } from "./view-card";

describe("ViewCard", () => {
  it("renders the json-render providers and renderer", () => {
    render(
      <ViewCard
        spec={{
          root: "metric",
          elements: {
            metric: {
              type: "StatMetric",
              props: { label: "Deals", value: 29 },
              children: [],
            },
          },
        }}
        state={{ stats: { deals: 29 } }}
      />,
    );

    expect(screen.getByTestId("view-card")).toBeInTheDocument();
    expect(screen.getByTestId("json-render-state-provider")).toBeInTheDocument();
    expect(screen.getByTestId("json-render-visibility-provider")).toBeInTheDocument();
    expect(screen.getByTestId("json-render-renderer")).toBeInTheDocument();
  });
});
