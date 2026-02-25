/**
 * Tests for Claude Skills integration.
 * @module lib/docgen/claude-report.test
 */
import { describe, it, expect } from 'vitest';
import { extractExcelFileId, isNonRetryableError, extractTextContent } from './claude-report';

describe('extractExcelFileId', () => {
  it('extracts file ID from bash_code_execution_tool_result block', () => {
    const response = {
      content: [
        { type: 'text', text: 'Here is your report' },
        {
          type: 'bash_code_execution_tool_result',
          content: {
            type: 'output',
            content: [{ type: 'file', file_id: 'file-123' }],
          },
        },
      ],
    };

    expect(extractExcelFileId(response as any)).toBe('file-123');
  });

  it('returns null when no bash_code_execution_tool_result block', () => {
    const response = {
      content: [
        { type: 'text', text: 'No file generated' },
      ],
    };

    expect(extractExcelFileId(response as any)).toBeNull();
  });

  it('returns null when bash_code_execution_tool_result has no file_id', () => {
    const response = {
      content: [
        {
          type: 'bash_code_execution_tool_result',
          content: {
            type: 'output',
            content: [{ type: 'text', text: 'Done' }],
          },
        },
      ],
    };

    expect(extractExcelFileId(response as any)).toBeNull();
  });
});

describe('isNonRetryableError', () => {
  it('returns true for invalid errors', () => {
    expect(isNonRetryableError(new Error('Invalid request'))).toBe(true);
  });

  it('returns true for unauthorized errors', () => {
    expect(isNonRetryableError(new Error('Unauthorized'))).toBe(true);
  });

  it('returns true for forbidden errors', () => {
    expect(isNonRetryableError(new Error('Forbidden'))).toBe(true);
  });

  it('returns true for not found errors', () => {
    expect(isNonRetryableError(new Error('Resource not found'))).toBe(true);
  });

  it('returns false for transient errors', () => {
    expect(isNonRetryableError(new Error('Network timeout'))).toBe(false);
    expect(isNonRetryableError(new Error('Server error'))).toBe(false);
  });
});

describe('extractTextContent', () => {
  it('extracts only the last text block (the summary)', () => {
    const response = {
      content: [
        { type: 'text', text: 'Starting analysis...' },
        { type: 'tool_use', id: 'tool-1', name: 'code_execution', input: {} },
        { type: 'text', text: 'Analyzed 20 invoices totaling $4,230.' },
      ],
    };

    expect(extractTextContent(response as any)).toBe('Analyzed 20 invoices totaling $4,230.');
  });

  it('returns null when no text blocks present', () => {
    const response = {
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'code_execution', input: {} },
        {
          type: 'bash_code_execution_tool_result',
          content: { type: 'output', content: [{ type: 'file', file_id: 'file-123' }] },
        },
      ],
    };

    expect(extractTextContent(response as any)).toBeNull();
  });

  it('returns null for empty content array', () => {
    const response = { content: [] };
    expect(extractTextContent(response as any)).toBeNull();
  });
});
