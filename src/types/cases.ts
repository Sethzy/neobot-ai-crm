/**
 * Case types and Zod schemas for validation.
 * @module types/cases
 */
import { z } from "zod";

/**
 * Schema for a Case record from the database.
 * Validates the full case object returned from Supabase.
 */
export const CaseSchema = z.object({
  id: z.string().uuid(),
  case_name: z.string().min(1),
  case_ref: z.string().min(1),
  description: z.string().nullable(),
  case_opened_at: z.string().datetime(),
  event_date: z.string().nullable(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  validation_review_completed_at: z.string().nullable().optional(),
  validation_review_completed_by: z.string().nullable().optional(),
});

/** Full Case type from database */
export type Case = z.infer<typeof CaseSchema>;

/**
 * Schema for creating a new case.
 * created_by is set automatically from auth context.
 */
export const CreateCaseSchema = z.object({
  case_name: z.string().min(1, "Case name is required"),
  case_ref: z.string().min(1, "Case reference is required"),
  description: z.string().optional(),
  case_opened_at: z.string().datetime(),
  event_date: z.string().optional(),
});

/** Input type for creating a case */
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;

/**
 * Schema for updating an existing case.
 * All fields optional for partial updates.
 */
export const UpdateCaseSchema = z.object({
  case_name: z.string().min(1, "Case name is required").optional(),
  case_ref: z.string().min(1, "Case reference is required").optional(),
  description: z.string().nullable().optional(),
  case_opened_at: z.string().datetime().optional(),
  event_date: z.string().nullable().optional(),
  validation_review_completed_at: z.string().nullable().optional(),
  validation_review_completed_by: z.string().nullable().optional(),
});

/** Input type for updating a case */
export type UpdateCaseInput = z.infer<typeof UpdateCaseSchema>;

/** Filter options for listing cases */
export type CasesFilter = "all" | "mine";
