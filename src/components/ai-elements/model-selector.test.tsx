/**
 * @fileoverview Tests for the main /chat model selector.
 */

import { render } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { mockNextImage } = vi.hoisted(() => ({
  mockNextImage: vi.fn(
    ({ unoptimized: _unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
      <img {...props} alt={props.alt ?? ""} />
    ),
  ),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => mockNextImage(props),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ModelSelector } from "./model-selector";

describe("ModelSelector", () => {
  it("marks remote provider SVGs as unoptimized", () => {
    render(
      <ModelSelector
        onValueChange={vi.fn()}
        value="google/gemini-3-flash"
      />,
    );

    expect(mockNextImage).toHaveBeenCalled();
    expect(
      mockNextImage.mock.calls.every(([props]) =>
        typeof props.src === "string" &&
        props.src.startsWith("https://models.dev/logos/") &&
        props.unoptimized === true
      ),
    ).toBe(true);
  });
});
