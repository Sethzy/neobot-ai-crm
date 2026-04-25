import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { getFieldValue, formatFieldDisplay, renderFieldCell } from "../field-renderers";

describe("getFieldValue", () => {
  it("reads column source from row directly", () => {
    const row = { email: "test@example.com", custom_fields: {} };
    expect(getFieldValue(row, "email", "column")).toBe("test@example.com");
  });

  it("reads custom source from custom_fields", () => {
    const row = { custom_fields: { budget: 500000 } };
    expect(getFieldValue(row, "budget", "custom")).toBe(500000);
  });

  it("returns undefined for missing column value", () => {
    const row = { name: "Test" };
    expect(getFieldValue(row, "phone", "column")).toBeUndefined();
  });

  it("returns undefined for missing custom field", () => {
    const row = { custom_fields: {} };
    expect(getFieldValue(row, "nonexistent", "custom")).toBeUndefined();
  });

  it("handles null custom_fields gracefully", () => {
    const row = { custom_fields: null };
    expect(getFieldValue(row, "budget", "custom")).toBeUndefined();
  });
});

describe("formatFieldDisplay", () => {
  it("formats currency values", () => {
    expect(formatFieldDisplay("currency", 1500000)).toBe("$1,500,000");
  });

  it("formats date values", () => {
    const result = formatFieldDisplay("date", "2026-04-01T00:00:00Z");
    expect(result).toContain("Apr");
    expect(result).toContain("2026");
  });

  it("formats boolean true", () => {
    expect(formatFieldDisplay("boolean", true)).toBe("Yes");
  });

  it("formats boolean false", () => {
    expect(formatFieldDisplay("boolean", false)).toBe("No");
  });

  it("returns text as-is for text type", () => {
    expect(formatFieldDisplay("text", "hello")).toBe("hello");
  });

  it("returns null for null/undefined values", () => {
    expect(formatFieldDisplay("text", null)).toBeNull();
    expect(formatFieldDisplay("text", undefined)).toBeNull();
  });

  it("formats number values with separators", () => {
    expect(formatFieldDisplay("number", 1234567)).toBe("1,234,567");
  });
});

describe("renderFieldCell", () => {
  it("renders boolean cells as Yes and No", () => {
    const { rerender } = render(renderFieldCell("boolean", true));

    expect(screen.getByText("Yes")).toBeInTheDocument();

    rerender(renderFieldCell("boolean", false));

    expect(screen.getByText("No")).toBeInTheDocument();
  });
});
