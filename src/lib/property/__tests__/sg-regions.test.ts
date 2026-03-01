import { describe, expect, it } from "vitest";
import { getRegionForTown } from "../sg-regions";

describe("getRegionForTown", () => {
  it("maps Yishun to North", () => {
    expect(getRegionForTown("YISHUN")).toBe("North");
  });

  it("maps Bedok to East", () => {
    expect(getRegionForTown("BEDOK")).toBe("East");
  });

  it("maps Queenstown to Central", () => {
    expect(getRegionForTown("QUEENSTOWN")).toBe("Central");
  });

  it("returns Unknown for unrecognized towns", () => {
    expect(getRegionForTown("NARNIA")).toBe("Unknown");
  });

  it("is case-insensitive", () => {
    expect(getRegionForTown("yishun")).toBe("North");
  });
});
