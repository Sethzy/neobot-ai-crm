import { describe, expect, it } from "vitest";

import { RESIZE_MIN_WIDTH, getDefaultWidthForFieldType } from "../column-widths";
import {
  COMPANY_DEFAULT_FIELDS,
  CONTACT_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "../field-definitions";

describe("getDefaultWidthForFieldType", () => {
  it("returns wider defaults for primary identifier fields", () => {
    expect(getDefaultWidthForFieldType("full_name")).toBe(240);
  });

  it("returns medium defaults for text-like fields", () => {
    expect(getDefaultWidthForFieldType("text")).toBe(180);
    expect(getDefaultWidthForFieldType("email")).toBe(220);
    expect(getDefaultWidthForFieldType("url")).toBe(200);
  });

  it("returns compact defaults for dates and numbers", () => {
    expect(getDefaultWidthForFieldType("date")).toBe(140);
    expect(getDefaultWidthForFieldType("number")).toBe(120);
    expect(getDefaultWidthForFieldType("currency")).toBe(140);
  });

  it("returns 180 for unknown values as a safe fallback", () => {
    // @ts-expect-error Intentionally exercising the runtime fallback path.
    expect(getDefaultWidthForFieldType("martian")).toBe(180);
  });

  it("exports the shared resize min width", () => {
    expect(RESIZE_MIN_WIDTH).toBe(104);
  });
});

describe("default field arrays", () => {
  it.each([
    ["contacts", CONTACT_DEFAULT_FIELDS],
    ["companies", COMPANY_DEFAULT_FIELDS],
    ["deals", DEAL_DEFAULT_FIELDS],
  ])("gives every %s field an explicit positive width", (_entity, fields) => {
    for (const field of fields) {
      expect(field.width, `${field.key} is missing width`).toBeGreaterThan(0);
    }
  });
});
