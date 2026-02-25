import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_THRESHOLD,
  type ValidationFailure,
  type TagDefinition,
  type ClientConfig,
} from "./types";

describe("CONFIDENCE_THRESHOLD", () => {
  it("is defined as 0.85", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.85);
  });
});

describe("ValidationFailure", () => {
  it("accepts valid validation failure object", () => {
    const failure: ValidationFailure = {
      ruleId: "patient_required",
      ruleName: "Patient name required",
      message: "patient_name is required",
      description: "Patient name is required for medical record identification",
      field: "patient_name",
    };

    expect(failure.ruleId).toBe("patient_required");
    expect(failure.ruleName).toBe("Patient name required");
    expect(failure.message).toBe("patient_name is required");
    expect(failure.field).toBe("patient_name");
  });

  it("includes optional description field for business rationale", () => {
    const failure: ValidationFailure = {
      ruleId: "test_required",
      ruleName: "Test required",
      message: "test field is missing",
      field: "test",
      description: "Business reason for this rule",
    };
    expect(failure.description).toBe("Business reason for this rule");
  });

  it("requires description field", () => {
    const failure: ValidationFailure = {
      ruleId: "test_required",
      ruleName: "Test required",
      message: "test field is missing",
      description: "Test field is required for validation",
      field: "test",
    };
    expect(failure.description).toBe("Test field is required for validation");
  });
});

describe("TagDefinition", () => {
  it("accepts tag with all fields including validate function", () => {
    const tag: TagDefinition = {
      id: "medical_bill",
      displayName: "Medical Bill",
      classificationHint: "Hospital bills, clinic invoices",
      extendProcessorId: "dp_medical_001",
      validate: (data) => {
        if (!data.patient_name) {
          return [{ ruleId: "req", ruleName: "Required", message: "patient_name required", description: "Patient name is required for identification", field: "patient_name" }];
        }
        return [];
      },
    };

    expect(tag.id).toBe("medical_bill");
    expect(tag.extendProcessorId).toBe("dp_medical_001");
    expect(tag.validate).toBeDefined();
    expect(tag.validate!({ patient_name: "John" })).toEqual([]);
    expect(tag.validate!({})).toHaveLength(1);
  });

  it("accepts tag without validate function", () => {
    const tag: TagDefinition = {
      id: "other",
      displayName: "Other",
      classificationHint: "Uncategorized documents",
      extendProcessorId: null,
    };

    expect(tag.validate).toBeUndefined();
    expect(tag.extendProcessorId).toBeNull();
  });

  it("accepts extractionConfig with full ExtendAI config", () => {
    const tag: TagDefinition = {
      id: "medical_expense",
      displayName: "Medical Expense",
      classificationHint: "Hospital bills...",
      extendProcessorId: "dp_test123",
      extractionConfig: {
        type: "EXTRACT",
        baseProcessor: "extraction_light",
        baseVersion: "3.4.0",
        schema: {
          type: "object",
          properties: { amount: { type: "number" } },
        },
        advancedOptions: {
          citationsEnabled: true,
        },
      },
    };

    expect(tag.extractionConfig).toBeDefined();
    expect(tag.extractionConfig?.type).toBe("EXTRACT");
    expect(tag.extractionConfig?.baseProcessor).toBe("extraction_light");
  });

  it("extractionConfig is optional (backwards compatible)", () => {
    const tag: TagDefinition = {
      id: "other",
      displayName: "Other",
      classificationHint: "Misc docs",
      extendProcessorId: null,
    };

    expect(tag.extractionConfig).toBeUndefined();
  });
});

describe("ClientConfig", () => {
  it("accepts valid client config with tags array", () => {
    const config: ClientConfig = {
      id: "medical-claims",
      name: "Medical Claims Co",
      tags: [
        {
          id: "medical_bill",
          displayName: "Medical Bill",
          classificationHint: "Hospital invoices",
          extendProcessorId: "dp_001",
        },
        {
          id: "other",
          displayName: "Other",
          classificationHint: "Other docs",
          extendProcessorId: null,
        },
      ],
    };

    expect(config.id).toBe("medical-claims");
    expect(config.tags).toHaveLength(2);
    expect(config.tags[0].id).toBe("medical_bill");
  });
});
