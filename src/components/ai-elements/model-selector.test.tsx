/**
 * @fileoverview Tests for the main /chat model selector.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ModelSelector } from "./model-selector";

describe("ModelSelector", () => {
  it("renders all models with tier labels and cost indicators in a popover", () => {
    render(
      <ModelSelector
        onValueChange={vi.fn()}
        value="anthropic/claude-sonnet-4-6"
      />,
    );

    // Tier labels render as primary text.
    expect(screen.getByText("Basic")).toBeDefined();
    // "Advanced" appears in trigger + popover list.
    expect(screen.getAllByText("Advanced").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Expert")).toBeDefined();
    // Short model names render as badges.
    expect(screen.getByText("Haiku 4.5")).toBeDefined();
    expect(screen.getAllByText("Sonnet 4.6").length).toBeGreaterThan(0);
    expect(screen.getByText("Opus 4.6")).toBeDefined();
    // Cost tiers render as repeated "$".
    expect(screen.getAllByText("$$$").length).toBeGreaterThan(0);
  });
});
