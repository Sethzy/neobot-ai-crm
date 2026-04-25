/**
 * Tests for the shared mobile touch-target contract.
 * @module components/ui/__tests__/touch-targets
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button";
import { InputGroupButton } from "../input-group";
import { Switch } from "../switch";
import { Toggle } from "../toggle";

describe("mobile touch target contract", () => {
  it("keeps compact desktop button sizes but adds phone-safe classes", () => {
    render(
      <div>
        <Button size="sm">Filter</Button>
        <Button size="icon-sm" aria-label="Open menu" />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Filter" })).toHaveClass("max-sm:h-11");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveClass("max-sm:size-11");
  });

  it("applies the same phone-safe contract to toggles and input-group buttons", () => {
    render(
      <div>
        <Toggle size="sm">Table</Toggle>
        <InputGroupButton aria-label="Attach files" size="icon-sm" />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Table" })).toHaveClass("max-sm:h-11");
    expect(screen.getByRole("button", { name: "Attach files" })).toHaveClass("max-sm:size-11");
  });

  it("expands switch hit area on phones without changing the visual track", () => {
    render(<Switch aria-label="Enable automation" />);

    expect(screen.getByRole("switch", { name: "Enable automation" })).toHaveClass("max-sm:after:-inset-3");
  });
});
