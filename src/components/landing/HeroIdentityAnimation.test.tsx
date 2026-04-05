/**
 * Tests the landing hero identity choreography so slot order stays aligned
 * with the approved screenshot sequence.
 * @module components/landing/HeroIdentityAnimation.test
 */
import { act, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(() => false),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & {
    src: string | { src: string };
    fill?: boolean;
  }) => {
    const { src, alt } = props;
    const imgProps = { ...props };

    delete imgProps.src;
    delete imgProps.alt;
    delete imgProps.fill;

    return (
      <img
        src={typeof src === "string" ? src : src.src}
        alt={alt ?? ""}
        {...imgProps}
      />
    );
  },
}));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();

  return {
    ...actual,
    useReducedMotion: mockUseReducedMotion,
  };
});

import {
  HERO_IDENTITY_STEP_DELAYS_MS,
  HeroIdentityAnimation,
} from "./HeroIdentityAnimation";

function expectSlotVisuals(expected: Record<"left" | "middle" | "right", string>) {
  expect(screen.getByTestId("hero-slot-left")).toHaveAttribute(
    "data-slot-visual",
    expected.left,
  );
  expect(screen.getByTestId("hero-slot-middle")).toHaveAttribute(
    "data-slot-visual",
    expected.middle,
  );
  expect(screen.getByTestId("hero-slot-right")).toHaveAttribute(
    "data-slot-visual",
    expected.right,
  );
}

describe("HeroIdentityAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the approved 3-slot choreography order", async () => {
    render(<HeroIdentityAnimation />);

    expect(screen.getByTestId("hero-identity-animation")).toHaveAttribute(
      "data-sequence-step",
      "0",
    );
    expectSlotVisuals({
      left: "empty",
      middle: "empty",
      right: "empty",
    });

    for (const [index, delay] of HERO_IDENTITY_STEP_DELAYS_MS.entries()) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });

      expect(screen.getByTestId("hero-identity-animation")).toHaveAttribute(
        "data-sequence-step",
        String(index + 1),
      );

      const expectedStates = [
        { left: "empty", middle: "empty", right: "contacts" },
        { left: "empty", middle: "messaging", right: "contacts" },
        { left: "tasks", middle: "messaging", right: "contacts" },
        { left: "tasks", middle: "messaging", right: "contacts" },
        { left: "N", middle: "messaging", right: "contacts" },
        { left: "N", middle: "messaging", right: "contacts" },
        { left: "N", middle: "E", right: "contacts" },
        { left: "N", middle: "E", right: "contacts" },
        { left: "N", middle: "E", right: "O" },
      ] as const;

      expectSlotVisuals(expectedStates[index]);
    }
  });

  it("renders static NEO when reduced motion is enabled", () => {
    mockUseReducedMotion.mockReturnValue(true);

    render(<HeroIdentityAnimation />);

    expect(screen.getByTestId("hero-identity-animation")).toHaveAttribute(
      "data-sequence-step",
      "reduced",
    );
    expect(screen.getByText("NEO")).toBeInTheDocument();
    expect(screen.queryByTestId("hero-slot-left")).not.toBeInTheDocument();
  });
});
