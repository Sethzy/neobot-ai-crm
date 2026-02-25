/**
 * Tests for Case type and Zod schemas.
 * @module types/cases.test
 */
import { describe, it, expect } from "vitest";
import { CaseSchema, CreateCaseSchema, UpdateCaseSchema } from "./cases";

describe("CaseSchema", () => {
  it("validates a complete case object", () => {
    const validCase = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_name: "Smith v Jones",
      case_ref: "CASE-001",
      description: "Motor accident claim",
      case_opened_at: "2025-12-19T10:00:00Z",
      event_date: "2025-11-15",
      created_by: "123e4567-e89b-12d3-a456-426614174001",
      created_at: "2025-12-19T10:00:00Z",
      updated_at: "2025-12-19T10:00:00Z",
    };

    const result = CaseSchema.safeParse(validCase);
    expect(result.success).toBe(true);
  });

  it("allows null description and event_date", () => {
    const caseWithNulls = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      case_name: "Smith v Jones",
      case_ref: "CASE-001",
      description: null,
      case_opened_at: "2025-12-19T10:00:00Z",
      event_date: null,
      created_by: "123e4567-e89b-12d3-a456-426614174001",
      created_at: "2025-12-19T10:00:00Z",
      updated_at: "2025-12-19T10:00:00Z",
    };

    const result = CaseSchema.safeParse(caseWithNulls);
    expect(result.success).toBe(true);
  });
});

describe("CreateCaseSchema", () => {
  it("validates create case input with required fields", () => {
    const input = {
      case_name: "New Case",
      case_ref: "REF-001",
      case_opened_at: "2025-12-19T10:00:00Z",
    };

    const result = CreateCaseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects empty case_name", () => {
    const input = {
      case_name: "",
      case_ref: "REF-001",
      case_opened_at: "2025-12-19T10:00:00Z",
    };

    const result = CreateCaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty case_ref", () => {
    const input = {
      case_name: "New Case",
      case_ref: "",
      case_opened_at: "2025-12-19T10:00:00Z",
    };

    const result = CreateCaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("UpdateCaseSchema", () => {
  it("allows partial updates", () => {
    const input = {
      case_name: "Updated Name",
    };

    const result = UpdateCaseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
