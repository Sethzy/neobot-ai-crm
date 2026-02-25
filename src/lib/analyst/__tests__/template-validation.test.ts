/**
 * @fileoverview Tests for template file validation utilities.
 * Validates file type, size, and count constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_ALLOWED_EXTENSIONS,
  TEMPLATE_MAX_FILES,
  TEMPLATE_MAX_FILE_SIZE,
  TEMPLATE_MAX_TOTAL_SIZE,
  validateTemplateFile,
  validateTemplateFiles,
} from '../template-validation';

describe('Template validation constants', () => {
  it('allows correct file extensions', () => {
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.xlsx');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.xls');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.pptx');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.docx');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.pdf');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.csv');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.json');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.xml');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.txt');
    expect(TEMPLATE_ALLOWED_EXTENSIONS).toContain('.md');
  });

  it('has correct limits', () => {
    expect(TEMPLATE_MAX_FILES).toBe(3);
    expect(TEMPLATE_MAX_FILE_SIZE).toBe(50 * 1024 * 1024); // 50MB
    expect(TEMPLATE_MAX_TOTAL_SIZE).toBe(100 * 1024 * 1024); // 100MB
  });
});

describe('validateTemplateFile', () => {
  it('accepts valid xlsx file', () => {
    const file = new File(['content'], 'template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(file, 'size', { value: 1024 });

    const result = validateTemplateFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts valid docx file', () => {
    const file = new File(['content'], 'report.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    Object.defineProperty(file, 'size', { value: 2048 });

    const result = validateTemplateFile(file);
    expect(result.valid).toBe(true);
  });

  it('accepts valid pdf file', () => {
    const file = new File(['content'], 'document.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(file, 'size', { value: 1024 });

    const result = validateTemplateFile(file);
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported file type', () => {
    const file = new File(['content'], 'image.png', {
      type: 'image/png',
    });

    const result = validateTemplateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('rejects file exceeding size limit', () => {
    const file = new File(['content'], 'huge.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(file, 'size', { value: 60 * 1024 * 1024 }); // 60MB

    const result = validateTemplateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 50MB limit');
  });
});

describe('validateTemplateFiles', () => {
  it('accepts valid file set', () => {
    const files = [
      createMockFile('a.xlsx', 1024),
      createMockFile('b.docx', 2048),
    ];

    const result = validateTemplateFiles(files);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects more than 3 files', () => {
    const files = [
      createMockFile('a.xlsx', 1024),
      createMockFile('b.xlsx', 1024),
      createMockFile('c.xlsx', 1024),
      createMockFile('d.xlsx', 1024),
    ];

    const result = validateTemplateFiles(files);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Maximum 3 files');
  });

  it('rejects when total size exceeds limit', () => {
    const files = [
      createMockFile('a.xlsx', 40 * 1024 * 1024),
      createMockFile('b.xlsx', 40 * 1024 * 1024),
      createMockFile('c.xlsx', 30 * 1024 * 1024), // Total: 110MB
    ];

    const result = validateTemplateFiles(files);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds 100MB');
  });

  it('collects individual file errors', () => {
    const files = [
      createMockFile('valid.xlsx', 1024),
      createMockFile('invalid.png', 1024),
    ];

    const result = validateTemplateFiles(files);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid.png');
  });
});

function createMockFile(name: string, size: number): File {
  const ext = name.split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    png: 'image/png',
  };
  const file = new File([''], name, { type: mimeTypes[ext] || '' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
