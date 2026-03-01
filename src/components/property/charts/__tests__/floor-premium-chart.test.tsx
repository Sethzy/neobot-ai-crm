import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FloorPremiumChart } from "../floor-premium-chart";

describe("FloorPremiumChart", () => {
  it("renders the chart title and subtitle", () => {
    render(
      <FloorPremiumChart
        data={[
          { floor: 3, psf: 1000 },
          { floor: 8, psf: 1100 },
          { floor: 15, psf: 1250 },
          { floor: 18, psf: 1300 },
          { floor: 22, psf: 1400 },
        ]}
      />
    );
    expect(screen.getByText("Floor Level Premium")).toBeInTheDocument();
    expect(screen.getByText(/floor level and PSF/i)).toBeInTheDocument();
  });

  it("returns null when fewer than 5 data points", () => {
    const { container } = render(
      <FloorPremiumChart data={[{ floor: 3, psf: 1000 }]} />
    );
    expect(container.firstChild).toBeNull();
  });
});
