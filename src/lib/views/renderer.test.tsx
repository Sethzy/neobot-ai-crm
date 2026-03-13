/**
 * Tests for the ViewRenderer provider-stack wrapper.
 * @module lib/views/renderer.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@json-render/react", () => ({
  Renderer: ({ spec, registry, fallback, loading }: {
    spec: unknown;
    registry: unknown;
    fallback: unknown;
    loading?: boolean;
  }) => (
    <div
      data-testid="json-render-renderer"
      data-spec={JSON.stringify(spec)}
      data-has-registry={!!registry}
      data-has-fallback={!!fallback}
      data-loading={String(loading ?? false)}
    />
  ),
  StateProvider: ({ initialState, children }: { initialState: unknown; children: React.ReactNode }) => (
    <div data-testid="state-provider" data-initial-state={JSON.stringify(initialState)}>
      {children}
    </div>
  ),
  VisibilityProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="visibility-provider">{children}</div>
  ),
  ActionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="action-provider">{children}</div>
  ),
}));

vi.mock("./registry", () => ({
  registry: { __mock: true },
}));

import { ViewRenderer } from "./renderer";

describe("ViewRenderer", () => {
  it("renders provider stack in correct nesting order: State > Visibility > Action > Renderer", () => {
    render(
      <ViewRenderer
        spec={{
          root: "metric",
          elements: {
            metric: {
              type: "StatMetric",
              props: { label: "Deals", value: 29 },
              children: [],
            },
          },
          state: { count: 5 },
        }}
      />,
    );

    const stateProvider = screen.getByTestId("state-provider");
    const visibilityProvider = screen.getByTestId("visibility-provider");
    const actionProvider = screen.getByTestId("action-provider");
    const renderer = screen.getByTestId("json-render-renderer");

    expect(stateProvider).toBeInTheDocument();
    expect(visibilityProvider).toBeInTheDocument();
    expect(actionProvider).toBeInTheDocument();
    expect(renderer).toBeInTheDocument();

    // Verify nesting: state > visibility > action > renderer
    expect(stateProvider.contains(visibilityProvider)).toBe(true);
    expect(visibilityProvider.contains(actionProvider)).toBe(true);
    expect(actionProvider.contains(renderer)).toBe(true);
  });

  it("passes spec.state to StateProvider initialState", () => {
    render(
      <ViewRenderer
        spec={{
          root: "metric",
          elements: {},
          state: { stats: { deals: 29 } },
        }}
      />,
    );

    const stateProvider = screen.getByTestId("state-provider");
    expect(JSON.parse(stateProvider.getAttribute("data-initial-state")!)).toEqual({
      stats: { deals: 29 },
    });
  });

  it("defaults state to empty object when spec.state is undefined", () => {
    render(
      <ViewRenderer
        spec={{
          root: "metric",
          elements: {},
        }}
      />,
    );

    const stateProvider = screen.getByTestId("state-provider");
    expect(JSON.parse(stateProvider.getAttribute("data-initial-state")!)).toEqual({});
  });

  it("passes registry, fallback, and loading to Renderer", () => {
    render(
      <ViewRenderer
        spec={{ root: "m", elements: {} }}
        loading={true}
      />,
    );

    const renderer = screen.getByTestId("json-render-renderer");
    expect(renderer).toHaveAttribute("data-has-registry", "true");
    expect(renderer).toHaveAttribute("data-has-fallback", "true");
    expect(renderer).toHaveAttribute("data-loading", "true");
  });

  it("returns null when spec is null", () => {
    const { container } = render(<ViewRenderer spec={null} />);
    expect(container.innerHTML).toBe("");
  });
});
