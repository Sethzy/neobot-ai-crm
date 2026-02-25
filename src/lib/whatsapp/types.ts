/**
 * Type definitions and Zod schemas for WhatsApp API endpoints.
 * Used by both Sunder endpoints and OpenClaw plugin.
 */

import { z } from "zod";

// ============================================
// Common Schemas
// ============================================

/** E.164 phone number format: +15551234567 */
export const PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Invalid E.164 phone number");

/** Allowed MIME types for document uploads */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/heic",
  "image/heif",
] as const;

export const MimeTypeSchema = z.enum(ALLOWED_MIME_TYPES);

// ============================================
// GET /api/whatsapp/cases
// ============================================

export const GetCasesRequestSchema = z.object({
  phone: PhoneSchema,
});

export type GetCasesRequest = z.infer<typeof GetCasesRequestSchema>;

export interface CaseInfo {
  id: string;
  name: string;
  lastActivity: string;
}

export interface GetCasesResponse {
  cases: CaseInfo[];
}

// ============================================
// POST /api/whatsapp/upload-url
// ============================================

export const UploadUrlRequestSchema = z.object({
  phone: PhoneSchema,
  caseId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
});

export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>;

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  documentId: string;
  expiresAt: string;
}

// ============================================
// POST /api/whatsapp/intake
// ============================================

export const IntakeRequestSchema = z.object({
  phone: PhoneSchema,
  messageId: z.string().min(1),
  documentId: z.string().uuid(),
  storagePath: z.string().min(1),
  text: z.string().optional(),
});

export type IntakeRequest = z.infer<typeof IntakeRequestSchema>;

export interface IntakeResponse {
  ack: boolean;
  message: string;
}

// ============================================
// Callback to OpenClaw
// ============================================

export interface OpenClawCallbackPayload {
  message: string;
  deliver: boolean;
  channel: "whatsapp";
  to: string; // Phone number
}

// ============================================
// Error Codes
// ============================================

export type WhatsAppErrorCode =
  | "UNKNOWN_PHONE"
  | "INVALID_CASE"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export interface WhatsAppError {
  error: WhatsAppErrorCode;
  message: string;
}
