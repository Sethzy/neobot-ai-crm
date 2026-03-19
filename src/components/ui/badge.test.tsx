/**
 * Tests for semantic Badge variants.
 * @module components/ui/badge.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("uses success semantic tokens", () => {
    render(<Badge variant="success">Success</Badge>);

    const badge = screen.getByText("Success");
    expect(badge).toHaveClass("bg-success/10");
    expect(badge).toHaveClass("text-success");
  });

  it("uses warning semantic tokens", () => {
    render(<Badge variant="warning">Warning</Badge>);

    const badge = screen.getByText("Warning");
    expect(badge).toHaveClass("bg-warning/10");
    expect(badge).toHaveClass("text-warning");
  });

  it("uses info semantic tokens", () => {
    render(<Badge variant="info">Info</Badge>);

    const badge = screen.getByText("Info");
    expect(badge).toHaveClass("bg-info/10");
    expect(badge).toHaveClass("text-info");
  });
});
