/**
 * @file Extraction validator tests
 */
import { describe, expect, it } from "vitest";
import type { LowConfidenceField } from "./validator";
import { validateExtraction } from "./validator";
import type { TagDefinition } from "./types";

describe("LowConfidenceField", () => {
  it("accepts valid low confidence field object", () => {
    const field: LowConfidenceField = {
      field: "patient_name",
      ocrConfidence: 0.72,
    };

    expect(field.field).toBe("patient_name");
    expect(field.ocrConfidence).toBe(0.72);
  });
});

describe("ValidationFailure type", () => {
  it("should include field property in validation failures", () => {
    const tag: TagDefinition = {
      id: "test_tag",
      displayName: "Test Tag",
      classificationHint: "Test hint",
      extendProcessorId: null,
      validate: (data) => {
        const failures = [];
        if (!data.test_field) {
          failures.push({
            ruleId: "test_required",
            ruleName: "Test required",
            message: "test_field is missing",
            description: "Test field is required for validation",
            field: "test_field",
          });
        }
        return failures;
      },
    };

    const result = validateExtraction(
      { value: {}, metadata: {} },
      tag
    );

    expect(result.failures[0].field).toBe("test_field");
  });
});

describe("validateExtraction", () => {
  const tagWithValidation: TagDefinition = {
    id: "medical_bill",
    displayName: "Medical Bill",
    classificationHint: "Hospital bills",
    extendProcessorId: "dp_001",
    validate: (data) => {
      const failures = [];
      if (!data.patient_name) {
        failures.push({
          ruleId: "patient_required",
          ruleName: "Patient name required",
          message: "patient_name is required",
          description: "Patient name is required for medical record identification",
          field: "patient_name",
        });
      }
      return failures;
    },
  };

  it("returns valid=true when no failures and high confidence", () => {
    const output = {
      value: { patient_name: "John Doe", total: 100 },
      metadata: {
        patient_name: { ocrConfidence: 0.99 },
        total: { ocrConfidence: 0.95 },
      },
    };

    const result = validateExtraction(output, tagWithValidation);

    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.lowConfidenceFields).toHaveLength(0);
  });

  it("returns valid=false when validation fails", () => {
    const output = {
      value: { total: 100 }, // missing patient_name
      metadata: {
        total: { ocrConfidence: 0.99 },
      },
    };

    const result = validateExtraction(output, tagWithValidation);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].ruleId).toBe("patient_required");
    expect(result.lowConfidenceFields).toHaveLength(0);
  });

  it("returns valid=false when confidence below threshold", () => {
    const output = {
      value: { patient_name: "John Doe", total: 100 },
      metadata: {
        patient_name: { ocrConfidence: 0.70 }, // below 0.85
        total: { ocrConfidence: 0.95 },
      },
    };

    const result = validateExtraction(output, tagWithValidation);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(0);
    expect(result.lowConfidenceFields).toHaveLength(1);
    expect(result.lowConfidenceFields[0].field).toBe("patient_name");
    expect(result.lowConfidenceFields[0].ocrConfidence).toBe(0.70);
  });

  it("ignores null ocrConfidence (digital/typed documents)", () => {
    const output = {
      value: { patient_name: "John Doe" },
      metadata: {
        patient_name: { ocrConfidence: null },
      },
    };

    const result = validateExtraction(output, tagWithValidation);

    expect(result.valid).toBe(true);
    expect(result.lowConfidenceFields).toHaveLength(0);
  });

  it("skips validation when tag has no validate function", () => {
    const tagNoValidation: TagDefinition = {
      id: "other",
      displayName: "Other",
      classificationHint: "Other docs",
      extendProcessorId: null,
      // no validate function
    };

    const output = {
      value: { any_field: "value" },
      metadata: {
        any_field: { ocrConfidence: 0.99 },
      },
    };

    const result = validateExtraction(output, tagNoValidation);

    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("does not flag confidence exactly at threshold (0.85)", () => {
    const output = {
      value: { patient_name: "John Doe" },
      metadata: {
        patient_name: { ocrConfidence: 0.85 }, // exactly at threshold
      },
    };

    const result = validateExtraction(output, tagWithValidation);

    expect(result.valid).toBe(true);
    expect(result.lowConfidenceFields).toHaveLength(0);
  });
});
