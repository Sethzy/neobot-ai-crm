/**
 * Tests for JSON generator.
 * @module lib/docgen/json-generator.test
 */
import { describe, it, expect } from 'vitest';
import { convertSplitsToJSON, type SplitForJSON } from './json-generator';

describe('convertSplitsToJSON', () => {
  it('generates summary with correct counts by document type', () => {
    const splits: SplitForJSON[] = [
      { id: '1', tag_id: 'medical_expense', document_date: null, identifier: null, potential_duplicate: null, extracted_data: {} },
      { id: '2', tag_id: 'medical_expense', document_date: null, identifier: null, potential_duplicate: null, extracted_data: {} },
      { id: '3', tag_id: 'medical_report', document_date: null, identifier: null, potential_duplicate: null, extracted_data: {} },
    ];

    const result = JSON.parse(convertSplitsToJSON(splits));

    expect(result.summary.total_splits).toBe(3);
    expect(result.summary.by_document_type).toEqual({
      medical_expense: 2,
      medical_report: 1,
    });
  });

  it('spreads extracted_data fields into each split', () => {
    const splits: SplitForJSON[] = [{
      id: '1',
      tag_id: 'medical_expense',
      document_date: '2024-01-15',
      identifier: 'INV-001',
      potential_duplicate: null,
      extracted_data: { provider_name: 'SGH', amount: 500 },
    }];

    const result = JSON.parse(convertSplitsToJSON(splits));

    expect(result.splits[0].provider_name).toBe('SGH');
    expect(result.splits[0].amount).toBe(500);
    expect(result.splits[0].split_id).toBe('1');
    expect(result.splits[0].document_date).toBe('2024-01-15');
    expect(result.splits[0].identifier).toBe('INV-001');
  });

  it('handles null extracted_data gracefully', () => {
    const splits: SplitForJSON[] = [{
      id: '1',
      tag_id: 'other',
      document_date: null,
      identifier: null,
      potential_duplicate: null,
      extracted_data: null,
    }];

    const result = JSON.parse(convertSplitsToJSON(splits));

    expect(result.splits[0].split_id).toBe('1');
    expect(result.splits[0].tag_id).toBe('other');
    expect(result.splits[0].document_date).toBeNull();
  });

  it('preserves nested arrays without escaping', () => {
    const splits: SplitForJSON[] = [{
      id: '1',
      tag_id: 'medical_report',
      document_date: null,
      identifier: null,
      potential_duplicate: null,
      extracted_data: {
        anatomical_findings: [
          { region: 'Bones', finding: 'Normal', is_serious: false }
        ]
      },
    }];

    const result = JSON.parse(convertSplitsToJSON(splits));

    expect(result.splits[0].anatomical_findings[0].region).toBe('Bones');
    expect(result.splits[0].anatomical_findings[0].is_serious).toBe(false);
  });

  it('returns valid JSON with empty splits array', () => {
    const result = JSON.parse(convertSplitsToJSON([]));

    expect(result.summary.total_splits).toBe(0);
    expect(result.summary.by_document_type).toEqual({});
    expect(result.splits).toEqual([]);
  });
});
