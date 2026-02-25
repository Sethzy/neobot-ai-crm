/**
 * Tests for DocGen hooks.
 * @module hooks/use-docgen.test
 */
import { describe, it, expect } from "vitest";
import { docgenKeys } from "./use-docgen";

describe("docgenKeys", () => {
  it("creates correct history key", () => {
    const key = docgenKeys.history("case-123");
    expect(key).toEqual(["docgen", "history", "case-123"]);
  });

  it("creates correct all key", () => {
    expect(docgenKeys.all).toEqual(["docgen"]);
  });
});
