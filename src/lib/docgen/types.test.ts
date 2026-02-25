/**
 * Tests for DocGen Zod schemas.
 * @module lib/docgen/types.test
 */
import { describe, it, expect } from 'vitest';
import { ReportTypeSchema, GenerateReportRequestSchema, GenerateReportResponseSchema } from './types';

describe('ReportTypeSchema', () => {
  it('accepts quick_report', () => {
    expect(ReportTypeSchema.parse('quick_report')).toBe('quick_report');
  });

  it('rejects invalid report types', () => {
    expect(() => ReportTypeSchema.parse('invalid')).toThrow();
    expect(() => ReportTypeSchema.parse('')).toThrow();
    expect(() => ReportTypeSchema.parse(null)).toThrow();
    expect(() => ReportTypeSchema.parse('ai_analysis')).toThrow();
    expect(() => ReportTypeSchema.parse('data_export')).toThrow();
  });
});

describe('GenerateReportRequestSchema', () => {
  it('accepts valid request with required fields', () => {
    const result = GenerateReportRequestSchema.parse({
      caseId: '123e4567-e89b-12d3-a456-426614174000',
      reportType: 'quick_report',
      tagIds: ['medical_expense'],
    });

    expect(result.caseId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(result.reportType).toBe('quick_report');
    expect(result.tagIds).toEqual(['medical_expense']);
  });

  it('rejects invalid UUID', () => {
    expect(() => GenerateReportRequestSchema.parse({
      caseId: 'not-a-uuid',
      reportType: 'quick_report',
      tagIds: ['tag1'],
    })).toThrow();
  });

  it('rejects empty tagIds', () => {
    expect(() => GenerateReportRequestSchema.parse({
      caseId: '123e4567-e89b-12d3-a456-426614174000',
      reportType: 'quick_report',
      tagIds: [],
    })).toThrow();
  });
});

describe('GenerateReportResponseSchema', () => {
  it('accepts valid response', () => {
    const result = GenerateReportResponseSchema.parse({
      reportId: '123e4567-e89b-12d3-a456-426614174000',
      downloadUrl: 'https://example.com/report.xlsx',
      expiresAt: '2026-01-03T12:00:00.000Z',
      metadata: {
        reportType: 'quick_report',
        splitsCount: 10,
        tagsIncluded: ['medical_expense'],
        fileSizeBytes: 1024,
      },
    });

    expect(result.reportId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(result.metadata.splitsCount).toBe(10);
  });
});
