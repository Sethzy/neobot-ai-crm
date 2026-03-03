/**
 * Tests for deal stage badge rendering.
 * @module components/crm/__tests__/stage-badge
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StageBadge } from "../stage-badge";

describe("StageBadge", () => {
  it("renders title-cased text labels", () => {
    render(<StageBadge stage="leads" />);

    expect(screen.getByText("Leads")).toBeInTheDocument();
  });

  it("renders OTP in uppercase", () => {
    render(<StageBadge stage="otp" />);

    expect(screen.getByText("OTP")).toBeInTheDocument();
  });

  it("uses destructive variant for lost stage", () => {
    const { container } = render(<StageBadge stage="lost" />);

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  it("uses success variant for completion stage", () => {
    const { container } = render(<StageBadge stage="completion" />);

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "success");
  });
});
