/**
 * Tests for versioned localStorage helpers.
 * @module lib/storage/versioned-local.test
 */
import { beforeEach, describe, expect, it } from "vitest";

import { readVersionedJSON, writeVersionedJSON } from "./versioned-local";

describe("versioned localStorage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the fallback when the stored payload is from another version", () => {
    localStorage.setItem("pref", JSON.stringify({ v: 0, d: "kanban" }));

    expect(readVersionedJSON("pref", 1, "table")).toBe("table");
  });

  it("returns the fallback when the stored payload is a legacy unversioned value", () => {
    localStorage.setItem("pref", "\"kanban\"");

    expect(readVersionedJSON("pref", 1, "table")).toBe("table");
  });

  it("reads the stored payload when the version matches", () => {
    localStorage.setItem("pref", JSON.stringify({ v: 1, d: "kanban" }));

    expect(readVersionedJSON("pref", 1, "table")).toBe("kanban");
  });

  it("writes a versioned envelope", () => {
    writeVersionedJSON("pref", 1, ["a", "b"]);

    expect(localStorage.getItem("pref")).toBe(
      JSON.stringify({ v: 1, d: ["a", "b"] }),
    );
  });
});
