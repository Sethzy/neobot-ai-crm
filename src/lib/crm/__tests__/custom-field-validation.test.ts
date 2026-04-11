/**
 * Tests for custom field value validation helpers.
 * @module lib/crm/__tests__/custom-field-validation.test
 */
import { describe, expect, it } from "vitest";

import type { CustomFieldDefinition } from "../config";
import {
  checkRequiredCustomFields,
  validateCustomFields,
} from "../custom-field-validation";

const definitions: CustomFieldDefinition[] = [
  { key: "priority", label: "Priority", type: "select", options: ["low", "high"], required: false },
  { key: "close_date", label: "Close Date", type: "date", required: false },
  { key: "score", label: "Score", type: "number", required: false },
  { key: "notes", label: "Notes", type: "text", required: false },
];

describe("validateCustomFields", () => {
  it("accepts valid values", () => {
    const result = validateCustomFields(
      { priority: "high", score: 42, close_date: "2026-04-10", notes: "hello" },
      definitions,
    );

    expect(result.ok).toBe(true);
  });

  it("rejects select value not in options", () => {
    const result = validateCustomFields({ priority: "medium" }, definitions);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/priority.*low.*high/i);
    }
  });

  it("rejects non-numeric score", () => {
    const result = validateCustomFields({ score: "hello" }, definitions);

    expect(result.ok).toBe(false);
  });

  it("rejects unparseable date", () => {
    const result = validateCustomFields({ close_date: "banana" }, definitions);

    expect(result.ok).toBe(false);
  });

  it("accepts unknown keys", () => {
    const result = validateCustomFields({ some_unknown: "value" }, definitions);

    expect(result.ok).toBe(true);
  });
});

describe("checkRequiredCustomFields", () => {
  it("rejects missing required fields", () => {
    const result = checkRequiredCustomFields(
      {},
      [
        { key: "commission_rate", label: "Commission Rate", type: "number", required: true },
      ],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/commission rate/i);
      expect(result.error).toMatch(/required/i);
    }
  });

  it("accepts when all required fields are present", () => {
    const result = checkRequiredCustomFields(
      { commission_rate: 5 },
      [
        { key: "commission_rate", label: "Commission Rate", type: "number", required: true },
      ],
    );

    expect(result.ok).toBe(true);
  });
});
