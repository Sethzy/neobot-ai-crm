/**
 * @fileoverview Tests for the main /chat model selector.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ModelSelector } from "./model-selector";

describe("ModelSelector", () => {
  it("renders all models with cost indicators", () => {
    render(
      <ModelSelector
        onValueChange={vi.fn()}
        value="google/gemini-3-flash"
      />,
    );

    expect(screen.getAllByText("Gemini Flash 3").length).toBeGreaterThan(0);
    expect(screen.getByText("$")).toBeDefined();
    expect(screen.getByText("MiniMax M2.7")).toBeDefined();
    expect(screen.getByText("$$")).toBeDefined();
  });
});
