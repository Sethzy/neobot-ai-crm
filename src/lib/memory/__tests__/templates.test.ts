/**
 * Tests for default memory template content.
 * @module lib/memory/__tests__/templates
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from "../templates";

describe("DEFAULT_SOUL_MD", () => {
  it("is non-empty and contains Sunder identity", () => {
    expect(DEFAULT_SOUL_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_SOUL_MD).toContain("Sunder");
    expect(DEFAULT_SOUL_MD).toContain("Singapore");
  });
});

describe("DEFAULT_USER_MD", () => {
  it("starts with a profile header", () => {
    expect(DEFAULT_USER_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_USER_MD).toContain("# User Profile");
  });
});

describe("DEFAULT_MEMORY_MD", () => {
  it("starts with a working memory header", () => {
    expect(DEFAULT_MEMORY_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_MEMORY_MD).toContain("# Working Memory");
  });
});
