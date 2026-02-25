/**
 * Zod schemas and TypeScript types for DocGen.
 * @module lib/docgen/types
 */
import { z } from 'zod';

export const ReportTypeSchema = z.enum([
  'quick_report',
]);

export type ReportType = z.infer<typeof ReportTypeSchema>;

export const GenerateReportRequestSchema = z.object({
  caseId: z.string().uuid(),
  reportType: ReportTypeSchema,
  tagIds: z.array(z.string()).min(1),
});

export type GenerateReportRequest = z.infer<typeof GenerateReportRequestSchema>;

export const GenerateReportResponseSchema = z.object({
  reportId: z.string().uuid(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  metadata: z.object({
    reportType: ReportTypeSchema,
    splitsCount: z.number(),
    tagsIncluded: z.array(z.string()),
    fileSizeBytes: z.number(),
  }),
});

export type GenerateReportResponse = z.infer<typeof GenerateReportResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
