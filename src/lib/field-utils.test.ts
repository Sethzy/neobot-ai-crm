/**
 * @file Tests for field value unwrapping utility
 * @description Tests unwrapFieldValue for currency/object/primitive formatting
 */
import { describe, expect, it } from "vitest";
import { unwrapFieldValue } from "./field-utils";

describe("unwrapFieldValue", () => {
  describe("currency values", () => {
    it("formats currency object as 'CODE amount'", () => {
      const result = unwrapFieldValue({
        amount: 187.3,
        iso_4217_currency_code: "SGD",
      });
      expect(result.displayValue).toBe("SGD 187.30");
      expect(result.rawValue).toBe(187.3);
      expect(result.isCurrency).toBe(true);
      expect(result.currencyCode).toBe("SGD");
      expect(result.isNotFound).toBe(false);
    });

    it("handles zero amount", () => {
      const result = unwrapFieldValue({
        amount: 0,
        iso_4217_currency_code: "USD",
      });
      expect(result.displayValue).toBe("USD 0.00");
      expect(result.rawValue).toBe(0);
    });

    it("handles negative amount", () => {
      const result = unwrapFieldValue({
        amount: -50.5,
        iso_4217_currency_code: "EUR",
      });
      expect(result.displayValue).toBe("EUR -50.50");
    });
  });

  describe("not found values", () => {
    it("returns isNotFound for null", () => {
      const result = unwrapFieldValue(null);
      expect(result.displayValue).toBe("—");
      expect(result.rawValue).toBeNull();
      expect(result.isNotFound).toBe(true);
    });

    it("returns isNotFound for undefined", () => {
      const result = unwrapFieldValue(undefined);
      expect(result.displayValue).toBe("—");
      expect(result.isNotFound).toBe(true);
    });

    it("returns isNotFound for empty string", () => {
      const result = unwrapFieldValue("");
      expect(result.displayValue).toBe("—");
      expect(result.isNotFound).toBe(true);
    });
  });

  describe("primitive values", () => {
    it("formats string value", () => {
      const result = unwrapFieldValue("John Doe");
      expect(result.displayValue).toBe("John Doe");
      expect(result.rawValue).toBe("John Doe");
      expect(result.isNotFound).toBe(false);
      expect(result.isCurrency).toBe(false);
    });

    it("formats number value", () => {
      const result = unwrapFieldValue(42);
      expect(result.displayValue).toBe("42");
      expect(result.rawValue).toBe(42);
    });

    it("formats boolean true", () => {
      const result = unwrapFieldValue(true);
      expect(result.displayValue).toBe("Yes");
    });

    it("formats boolean false", () => {
      const result = unwrapFieldValue(false);
      expect(result.displayValue).toBe("No");
    });
  });

  describe("unknown objects", () => {
    it("JSON stringifies unknown objects", () => {
      const result = unwrapFieldValue({ foo: "bar" });
      expect(result.displayValue).toBe('{"foo":"bar"}');
      expect(result.isCurrency).toBe(false);
    });
  });
});

describe("isCurrencyObject", () => {
  it("returns true for valid currency object", async () => {
    const { isCurrencyObject } = await import("./field-utils");
    expect(
      isCurrencyObject({ amount: 100, iso_4217_currency_code: "USD" })
    ).toBe(true);
  });

  it("returns false for object missing amount", async () => {
    const { isCurrencyObject } = await import("./field-utils");
    expect(isCurrencyObject({ iso_4217_currency_code: "USD" })).toBe(false);
  });

  it("returns false for object missing currency code", async () => {
    const { isCurrencyObject } = await import("./field-utils");
    expect(isCurrencyObject({ amount: 100 })).toBe(false);
  });

  it("returns false for null", async () => {
    const { isCurrencyObject } = await import("./field-utils");
    expect(isCurrencyObject(null)).toBe(false);
  });

  it("returns false for primitives", async () => {
    const { isCurrencyObject } = await import("./field-utils");
    expect(isCurrencyObject("string")).toBe(false);
    expect(isCurrencyObject(123)).toBe(false);
  });
});

describe("getArrayItemType", () => {
  it("returns 'primitive' for array of strings", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType(["foo", "bar", "baz"])).toBe("primitive");
  });

  it("returns 'primitive' for array of numbers", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType([1, 2, 3])).toBe("primitive");
  });

  it("returns 'primitive' for array of booleans", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType([true, false, true])).toBe("primitive");
  });

  it("returns 'object' for array of objects", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType([{ region: "knee", finding: "pain" }])).toBe("object");
  });

  it("returns 'empty' for empty array", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType([])).toBe("empty");
  });

  it("returns 'primitive' for array containing nested arrays", async () => {
    const { getArrayItemType } = await import("./field-utils");
    // Nested arrays are not plain objects, should be 'primitive'
    expect(getArrayItemType([[1, 2], [3, 4]])).toBe("primitive");
  });

  it("returns 'primitive' for array with null first item", async () => {
    const { getArrayItemType } = await import("./field-utils");
    expect(getArrayItemType([null, "foo", "bar"])).toBe("primitive");
  });
});
