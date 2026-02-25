import { describe, expect, it } from "vitest";
import { defaultConfig } from "./default";

describe("defaultConfig", () => {
  it("has id 'default'", () => {
    expect(defaultConfig.id).toBe("default");
  });

  it("has name 'Default Configuration'", () => {
    expect(defaultConfig.name).toBe("Default Configuration");
  });

  it("has tags array with at least one tag", () => {
    expect(defaultConfig.tags.length).toBeGreaterThan(0);
  });
});

describe("defaultConfig tags", () => {
  const expectedTagIds = [
    "invoices",
    "reports",
    "contracts",
    "images",
    "correspondence",
    "other",
  ];

  it("contains all 6 standard tags", () => {
    const tagIds = defaultConfig.tags.map((t) => t.id);
    expect(tagIds).toEqual(expectedTagIds);
  });

  it("has 'other' as the last tag", () => {
    const lastTag = defaultConfig.tags[defaultConfig.tags.length - 1];
    expect(lastTag.id).toBe("other");
  });

  it("has no extraction configured (all extendProcessorId are null)", () => {
    for (const tag of defaultConfig.tags) {
      expect(tag.extendProcessorId).toBeNull();
    }
  });

  it("has classification hints for all tags", () => {
    for (const tag of defaultConfig.tags) {
      expect(tag.classificationHint.length).toBeGreaterThan(20);
    }
  });
});
