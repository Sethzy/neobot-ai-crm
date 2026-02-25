/**
 * @file Utility functions for extraction field value formatting
 * @description Handles unwrapping currency objects and formatting for display
 */

/**
 * Result of unwrapping a field value for display.
 */
export interface UnwrappedValue {
  /** Formatted for display (e.g., "SGD 187.30") */
  displayValue: string;
  /** Original value for editing */
  rawValue: unknown;
  /** True if value couldn't be extracted */
  isNotFound: boolean;
  /** True if currency type detected */
  isCurrency: boolean;
  /** Currency code if applicable (e.g., "SGD") */
  currencyCode: string | null;
}

/**
 * Currency value shape from ExtendAI.
 * Allows null values since API returns null for not-found fields.
 */
export interface CurrencyValue {
  amount: number | null;
  iso_4217_currency_code: string | null;
}

/**
 * Type guard for currency object from ExtendAI.
 * Exported for use in inferFieldType.
 */
export function isCurrencyObject(value: unknown): value is CurrencyValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "iso_4217_currency_code" in value &&
    typeof (value as Record<string, unknown>).amount === "number" &&
    typeof (value as Record<string, unknown>).iso_4217_currency_code === "string"
  );
}

/**
 * Detects null currency objects from ExtendAI.
 * When a currency field is not found, ExtendAI returns {amount: null, iso_4217_currency_code: null}
 * instead of just null.
 */
export function isNullCurrencyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "iso_4217_currency_code" in value &&
    (value as Record<string, unknown>).amount === null &&
    (value as Record<string, unknown>).iso_4217_currency_code === null
  );
}

/**
 * Checks if value has currency object STRUCTURE (shape only, not value types).
 * Use for rendering decisions - any currency-shaped object should render as currency.
 *
 * Returns true for:
 * - Valid: { amount: 100, iso_4217_currency_code: "SGD" }
 * - Null: { amount: null, iso_4217_currency_code: null }
 * - Partial: { amount: null, iso_4217_currency_code: "SGD" }
 */
export function isCurrencyStructure(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "iso_4217_currency_code" in value
  );
}

/**
 * Detects objects where ALL properties are empty (null, undefined, or "").
 * ExtendAI returns nested objects (addresses, signatures, etc.) with all-null properties
 * when the data is not found, instead of returning null for the whole object.
 * Also treats "" as empty for user-cleared fields.
 */
export function isAllNullObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const values = Object.values(value as Record<string, unknown>);
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
  return values.length > 0 && values.every(isEmpty);
}

/**
 * Unwraps a field value for display and editing.
 * Handles currency objects, primitives, and null/undefined.
 *
 * @param value - Raw value from extraction
 * @returns UnwrappedValue with display and raw values
 *
 * @example
 * unwrapFieldValue({ amount: 187.3, iso_4217_currency_code: "SGD" })
 * // { displayValue: "SGD 187.30", rawValue: 187.3, isCurrency: true, ... }
 *
 * unwrapFieldValue(null)
 * // { displayValue: "—", rawValue: null, isNotFound: true, ... }
 */
export function unwrapFieldValue(value: unknown): UnwrappedValue {
  // Handle null/undefined/empty
  if (value === null || value === undefined || value === "") {
    return {
      displayValue: "—",
      rawValue: value ?? null,
      isNotFound: true,
      isCurrency: false,
      currencyCode: null,
    };
  }

  // Handle any currency structure (valid, null, or partial)
  if (isCurrencyStructure(value)) {
    const currency = value as { amount: number | null; iso_4217_currency_code: string | null };

    if (typeof currency.amount === "number") {
      // Valid currency with numeric amount
      const formatted = `${currency.iso_4217_currency_code} ${currency.amount.toFixed(2)}`;
      return {
        displayValue: formatted,
        rawValue: currency.amount,
        isNotFound: false,
        isCurrency: true,
        currencyCode: currency.iso_4217_currency_code,
      };
    } else {
      // Null or partial currency (amount is null)
      return {
        displayValue: "—",
        rawValue: null,
        isNotFound: true,
        isCurrency: true,
        currencyCode: currency.iso_4217_currency_code, // May be string or null
      };
    }
  }

  // Handle booleans
  if (typeof value === "boolean") {
    return {
      displayValue: value ? "Yes" : "No",
      rawValue: value,
      isNotFound: false,
      isCurrency: false,
      currencyCode: null,
    };
  }

  // Handle numbers
  if (typeof value === "number") {
    return {
      displayValue: String(value),
      rawValue: value,
      isNotFound: false,
      isCurrency: false,
      currencyCode: null,
    };
  }

  // Handle strings
  if (typeof value === "string") {
    return {
      displayValue: value,
      rawValue: value,
      isNotFound: false,
      isCurrency: false,
      currencyCode: null,
    };
  }

  // Handle objects where all properties are null (addresses, signatures, etc.)
  if (isAllNullObject(value)) {
    return {
      displayValue: "—",
      rawValue: null,
      isNotFound: true,
      isCurrency: false,
      currencyCode: null,
    };
  }

  // Handle unknown objects - JSON stringify
  return {
    displayValue: JSON.stringify(value),
    rawValue: value,
    isNotFound: false,
    isCurrency: false,
    currencyCode: null,
  };
}

/**
 * Detects the item type for an array.
 * Returns 'object' for arrays of objects, 'primitive' for strings/numbers/booleans.
 *
 * @param arr - Array to analyze
 * @returns 'object' | 'primitive' | 'empty'
 *
 * @example
 * getArrayItemType(["a", "b"]) // 'primitive'
 * getArrayItemType([{x: 1}])   // 'object'
 * getArrayItemType([])         // 'empty'
 */
export function getArrayItemType(arr: unknown[]): "object" | "primitive" | "empty" {
  if (arr.length === 0) return "empty";
  const firstItem = arr[0];
  if (typeof firstItem === "object" && firstItem !== null && !Array.isArray(firstItem)) {
    return "object";
  }
  return "primitive";
}

/**
 * Normalizes empty values for comparison.
 * Treats "", null, undefined as equivalent (all become null).
 * Recursively normalizes objects and arrays.
 *
 * @example
 * normalizeForComparison({ amount: "" }) // { amount: null }
 * normalizeForComparison({ amount: null }) // { amount: null }
 * // These are now equal when JSON.stringify'd
 */
export function normalizeForComparison(value: unknown): unknown {
  if (value === "" || value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      normalized[k] = normalizeForComparison(v);
    }
    return normalized;
  }
  return value;
}
