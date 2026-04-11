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
  it("renders the single catalog model as a static label with its cost tier", () => {
    render(
      <ModelSelector
        onValueChange={vi.fn()}
        value="anthropic/claude-sonnet-4-6"
      />,
    );

    expect(screen.getByText("Claude Sonnet 4.6")).toBeDefined();
    expect(screen.getByText("$$")).toBeDefined();
  });
});
