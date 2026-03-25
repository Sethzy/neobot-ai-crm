/**
 * JSON generator for DocGen AI reports.
 * Converts splits to native JSON with summary metadata.
 * @module lib/docgen/json-generator
 */
import type { DocGenSplit } from './types';

/** @deprecated Use `DocGenSplit` from `./types` instead. */
export type SplitForJSON = DocGenSplit;

interface JSONPayload {
  summary: {
    total_splits: number;
    by_document_type: Record<string, number>;
  };
  splits: Array<{
    split_id: string;
    tag_id: string;
    document_date: string | null;
    identifier: string | null;
    potential_duplicate: string | null;
    [key: string]: unknown;
  }>;
}

/**
 * Converts splits to JSON format with summary metadata.
 * Spreads extracted_data fields into each split for native access.
 */
export function convertSplitsToJSON(splits: SplitForJSON[]): string {
  const byType = splits.reduce((acc, s) => {
    acc[s.tag_id] = (acc[s.tag_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const transformedSplits = splits.map(s => ({
    split_id: s.id,
    tag_id: s.tag_id,
    document_date: s.document_date,
    identifier: s.identifier,
    potential_duplicate: s.potential_duplicate,
    ...(s.extracted_data ?? {}),
  }));

  const payload: JSONPayload = {
    summary: {
      total_splits: splits.length,
      by_document_type: byType,
    },
    splits: transformedSplits,
  };

  return JSON.stringify(payload, null, 2);
}
