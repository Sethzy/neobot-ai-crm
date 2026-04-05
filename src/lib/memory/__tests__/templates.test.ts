/**
 * Tests for default memory template content.
 * @module lib/memory/__tests__/templates
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_KEY_DECISIONS_MD,
  DEFAULT_MEMORY_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_PREFERENCES_MD,
  DEFAULT_SOUL_MD,
  DEFAULT_USER_MD,
} from "../templates";

describe("DEFAULT_SOUL_MD", () => {
  it("is non-empty and contains Sunder identity", () => {
    expect(DEFAULT_SOUL_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_SOUL_MD).toContain("Sunder");
    expect(DEFAULT_SOUL_MD).toContain("Have opinions");
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

describe("DEFAULT_PREFERENCES_MD", () => {
  it("starts with a preferences header", () => {
    expect(DEFAULT_PREFERENCES_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_PREFERENCES_MD).toContain("# Preferences");
  });
});

describe("DEFAULT_GROWTH_PLAN_MD", () => {
  it("starts with a growth plan header", () => {
    expect(DEFAULT_GROWTH_PLAN_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_GROWTH_PLAN_MD).toContain("# Growth Plan");
  });
});

describe("DEFAULT_PATTERNS_MD", () => {
  it("starts with a patterns header", () => {
    expect(DEFAULT_PATTERNS_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_PATTERNS_MD).toContain("# Patterns");
  });
});

describe("DEFAULT_KEY_DECISIONS_MD", () => {
  it("starts with a key decisions header", () => {
    expect(DEFAULT_KEY_DECISIONS_MD.length).toBeGreaterThan(0);
    expect(DEFAULT_KEY_DECISIONS_MD).toContain("# Key Decisions");
  });
});
