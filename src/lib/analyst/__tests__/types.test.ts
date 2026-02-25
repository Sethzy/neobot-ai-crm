/**
 * @fileoverview Tests for analyst type definitions.
 * Validates UploadedFile and ChatSession types for template file support.
 */

import { describe, it, expect } from 'vitest';
import type { UploadedFile, ChatSession } from '../types';

describe('UploadedFile type', () => {
  it('accepts valid uploaded file metadata', () => {
    const file: UploadedFile = {
      name: 'template.xlsx',
      size: 1024,
    };

    expect(file.name).toBe('template.xlsx');
    expect(file.size).toBe(1024);
  });
});

describe('ChatSession type', () => {
  it('accepts uploadedFiles as optional array', () => {
    const session: ChatSession = {
      caseId: 'case-123',
      messages: [],
      containerId: null,
      startedAt: new Date().toISOString(),
      selectedTags: [],
      uploadedFiles: [
        { name: 'budget.xlsx', size: 2048 },
        { name: 'report.docx', size: 4096 },
      ],
    };

    expect(session.uploadedFiles).toHaveLength(2);
    expect(session.uploadedFiles?.[0].name).toBe('budget.xlsx');
  });

  it('allows ChatSession without uploadedFiles', () => {
    const session: ChatSession = {
      caseId: 'case-123',
      messages: [],
      containerId: null,
      startedAt: new Date().toISOString(),
    };

    expect(session.uploadedFiles).toBeUndefined();
  });
});
