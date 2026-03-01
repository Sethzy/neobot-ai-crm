import { describe, expect, it } from "vitest";
import { parseFloorMidpoint } from "../utils";

describe("parseFloorMidpoint", () => {
  it("parses '06 TO 10' to 8", () => {
    expect(parseFloorMidpoint("06 TO 10")).toBe(8);
  });

  it("parses '01 TO 05' to 3", () => {
    expect(parseFloorMidpoint("01 TO 05")).toBe(3);
  });

  it("parses '16 TO 20' to 18", () => {
    expect(parseFloorMidpoint("16 TO 20")).toBe(18);
  });

  it("returns null for null/undefined", () => {
    expect(parseFloorMidpoint(null)).toBeNull();
    expect(parseFloorMidpoint(undefined)).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(parseFloorMidpoint("B1")).toBeNull();
    expect(parseFloorMidpoint("")).toBeNull();
  });
});
