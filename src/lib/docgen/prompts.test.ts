/**
 * Tests for DocGen prompts.
 * @module lib/docgen/prompts.test
 */
import { describe, it, expect } from 'vitest';
import { getReportDisplayName } from './prompts';

describe('getReportDisplayName', () => {
  it('returns correct display name for quick_report', () => {
    expect(getReportDisplayName('quick_report')).toBe('Quick Report');
  });
});
