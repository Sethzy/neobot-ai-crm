/**
 * @file Gemini processing API helpers
 * @description Shared utilities for the Gemini document processing endpoint.
 * The actual Vercel handler is in /api/gemini/process.ts
 */
import { z } from "zod";
import type { DynamicSplitterResponse } from "@/types/gemini";

/**
 * Request body schema for document processing.
 */
const ProcessRequestSchema = z.object({
  documentId: z.string().uuid(),
});

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;

/**
 * Validates incoming request body.
 * Returns a discriminated union with success flag.
 */
export function validateRequest(body: unknown) {
  return ProcessRequestSchema.safeParse(body);
}

/**
 * Extracts JWT from Authorization header.
 * Expected format: "Bearer <token>"
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1] || null;
}

export interface SuccessResponse {
  success: true;
  data: DynamicSplitterResponse;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Creates a success response with processed data.
 */
export function createSuccessResponse(
  data: DynamicSplitterResponse
): SuccessResponse {
  return { success: true, data };
}

/**
 * Creates an error response with message.
 */
export function createErrorResponse(error: string): ErrorResponse {
  return { success: false, error };
}
