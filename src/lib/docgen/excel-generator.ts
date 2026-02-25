/**
 * Excel generator for DocGen data export.
 * Converts splits to Excel with comprehensive flattening.
 * @module lib/docgen/excel-generator
 */
import ExcelJS from 'exceljs';
import { isCurrencyStructure, getArrayItemType } from '../field-utils';

export interface SplitForExcel {
  id: string;
  tag_id: string;
  document_date: string | null;
  identifier: string | null;
  potential_duplicate: string | null;
  extracted_data: Record<string, unknown> | null;
}

/**
 * Type guard for signature object from ExtendAI.
 * Signature has: printed_name, signature_date, is_signed, title_or_role
 */
export function isSignatureStructure(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'printed_name' in value &&
    'signature_date' in value &&
    'is_signed' in value &&
    'title_or_role' in value
  );
}

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'currency'
  | 'signature'
  | 'nested_object'
  | 'array_of_objects'
  | 'array_of_primitives';

/**
 * Detects the field type from sample values.
 * Used to determine flattening strategy.
 */
export function detectFieldType(_key: string, values: unknown[]): FieldType {
  const nonNullValues = values.filter(v => v !== null && v !== undefined);
  if (nonNullValues.length === 0) return 'string';

  const sample = nonNullValues[0];

  // Currency: {amount, iso_4217_currency_code}
  if (isCurrencyStructure(sample)) return 'currency';

  // Signature: {printed_name, signature_date, is_signed, title_or_role}
  if (isSignatureStructure(sample)) return 'signature';

  // Array of objects
  if (Array.isArray(sample)) {
    const itemType = getArrayItemType(sample);
    return itemType === 'object' ? 'array_of_objects' : 'array_of_primitives';
  }

  // Nested object (not currency/signature)
  if (typeof sample === 'object' && sample !== null) return 'nested_object';

  // Primitives
  if (typeof sample === 'boolean') return 'boolean';
  if (typeof sample === 'number') return 'number';

  // Date detection (ISO format: yyyy-mm-dd)
  if (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sample)) {
    return 'date';
  }

  return 'string';
}

export interface CurrencyValue {
  amount: number | null;
  iso_4217_currency_code: string | null;
}

/**
 * Flattens a currency object into two columns: {prefix}_amount and {prefix}_currency.
 */
export function flattenCurrency(
  prefix: string,
  value: CurrencyValue
): Record<string, unknown> {
  return {
    [`${prefix}_amount`]: value.amount,
    [`${prefix}_currency`]: value.iso_4217_currency_code,
  };
}

export interface SignatureValue {
  printed_name: string | null;
  signature_date: string | null;
  is_signed: boolean | null;
  title_or_role: string | null;
}

/**
 * Flattens a signature object into four columns.
 */
export function flattenSignature(
  prefix: string,
  value: SignatureValue
): Record<string, unknown> {
  return {
    [`${prefix}_printed_name`]: value.printed_name,
    [`${prefix}_signature_date`]: value.signature_date,
    [`${prefix}_is_signed`]: value.is_signed,
    [`${prefix}_title_or_role`]: value.title_or_role,
  };
}

/**
 * Flattens a nested object into prefixed columns.
 * Max depth: 2 levels. Beyond that, JSON.stringify.
 */
export function flattenNestedObject(
  prefix: string,
  obj: Record<string, unknown>,
  currentDepth = 0
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const maxDepth = 3;

  for (const [key, value] of Object.entries(obj)) {
    const newKey = `${prefix}_${key}`;

    if (value === null || value === undefined) {
      result[newKey] = null;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      if (currentDepth < maxDepth - 1) {
        // Recurse
        const nested = flattenNestedObject(newKey, value as Record<string, unknown>, currentDepth + 1);
        Object.assign(result, nested);
      } else {
        // Max depth reached, stringify
        result[newKey] = JSON.stringify(value);
      }
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Expands arrays of objects into multiple rows.
 * Duplicates non-array fields across all rows.
 * Flattens array item fields with {arrayName}_ prefix.
 */
export function expandArraysToRows(
  baseRow: Record<string, unknown>,
  extractedData: Record<string, unknown>
): Record<string, unknown>[] {
  // Find array-of-objects fields
  const arrayFields: Array<{ key: string; items: Record<string, unknown>[] }> = [];

  for (const [key, value] of Object.entries(extractedData)) {
    if (Array.isArray(value) && getArrayItemType(value) === 'object') {
      arrayFields.push({ key, items: value as Record<string, unknown>[] });
    }
  }

  // No arrays to expand
  if (arrayFields.length === 0) {
    return [{ ...baseRow }];
  }

  // Expand arrays sequentially
  const rows: Record<string, unknown>[] = [];

  for (const { key, items } of arrayFields) {
    if (items.length === 0) {
      // Empty array: one row with base data
      rows.push({ ...baseRow });
    } else {
      for (const item of items) {
        const row = { ...baseRow };
        // Flatten each array item with prefix
        for (const [itemKey, itemValue] of Object.entries(item)) {
          const flatKey = `${key}_${itemKey}`;

          if (isCurrencyStructure(itemValue)) {
            const flattened = flattenCurrency(flatKey, itemValue as CurrencyValue);
            Object.assign(row, flattened);
          } else if (typeof itemValue === 'object' && itemValue !== null && !Array.isArray(itemValue)) {
            const flattened = flattenNestedObject(flatKey, itemValue as Record<string, unknown>);
            Object.assign(row, flattened);
          } else {
            row[flatKey] = itemValue;
          }
        }
        rows.push(row);
      }
    }
  }

  return rows.length > 0 ? rows : [{ ...baseRow }];
}

/**
 * Converts splits to Excel format with comprehensive flattening.
 * - Currency objects → {field}_amount, {field}_currency columns
 * - Signature objects → 4 prefixed columns
 * - Nested objects → {parent}_{child} columns (2 levels max)
 * - Array of objects → Row expansion with duplicated parent fields
 * - Array of primitives → Joined with "; " delimiter
 *
 * @param splits - Array of splits with extracted_data
 * @returns Buffer containing xlsx file
 */
export async function convertSplitsToExcel(splits: SplitForExcel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sunder';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data Export', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  if (splits.length === 0) {
    // Empty workbook with base headers only
    worksheet.addRow(['split_id', 'tag_id', 'document_date', 'identifier', 'potential_duplicate']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // Phase 1: Analyze all splits to build column definitions
  const columnSet = new Set<string>(['split_id', 'tag_id', 'document_date', 'identifier', 'potential_duplicate']);
  const allRows: Record<string, unknown>[] = [];

  for (const split of splits) {
    const baseRow: Record<string, unknown> = {
      split_id: split.id,
      tag_id: split.tag_id,
      document_date: split.document_date,
      identifier: split.identifier,
      potential_duplicate: split.potential_duplicate,
    };

    if (!split.extracted_data) {
      allRows.push(baseRow);
      continue;
    }

    // Flatten extracted_data fields
    for (const [key, value] of Object.entries(split.extracted_data)) {
      if (value === null || value === undefined) {
        baseRow[key] = null;
        columnSet.add(key);
      } else if (isCurrencyStructure(value)) {
        const flattened = flattenCurrency(key, value as CurrencyValue);
        Object.assign(baseRow, flattened);
        Object.keys(flattened).forEach(k => columnSet.add(k));
      } else if (isSignatureStructure(value)) {
        const flattened = flattenSignature(key, value as SignatureValue);
        Object.assign(baseRow, flattened);
        Object.keys(flattened).forEach(k => columnSet.add(k));
      } else if (Array.isArray(value)) {
        const itemType = getArrayItemType(value);
        if (itemType === 'object') {
          // Will be handled by row expansion - collect column names from items
          for (const item of value as Record<string, unknown>[]) {
            for (const itemKey of Object.keys(item)) {
              columnSet.add(`${key}_${itemKey}`);
            }
          }
        } else if (itemType === 'primitive') {
          // Join primitives
          baseRow[key] = (value as unknown[]).join('; ');
          columnSet.add(key);
        }
      } else if (typeof value === 'object') {
        const flattened = flattenNestedObject(key, value as Record<string, unknown>);
        Object.assign(baseRow, flattened);
        Object.keys(flattened).forEach(k => columnSet.add(k));
      } else {
        baseRow[key] = value;
        columnSet.add(key);
      }
    }

    // Expand arrays to rows
    const expanded = expandArraysToRows(baseRow, split.extracted_data);
    allRows.push(...expanded);
  }

  // Phase 2: Build worksheet
  const columns = Array.from(columnSet);

  // Header row
  worksheet.addRow(columns);
  styleHeaderRow(worksheet);

  // Data rows
  const numericColumns = new Set<number>();

  for (const row of allRows) {
    const rowValues = columns.map((col, idx) => {
      const value = row[col];

      // Track numeric columns for auto-sum
      if (typeof value === 'number') {
        numericColumns.add(idx);
      }

      // Escape formula-like strings
      if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
        return "'" + value;
      }

      // Convert date strings to Date objects
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d);
      }

      return value ?? null;
    });
    worksheet.addRow(rowValues);
  }

  // Apply column formatting
  columns.forEach((col, idx) => {
    const excelCol = worksheet.getColumn(idx + 1);

    if (col.endsWith('_amount') || col.includes('amount') || col.includes('price') || col.includes('total')) {
      excelCol.numFmt = '#,##0.00';
      excelCol.width = 15;
    } else if (col.includes('date')) {
      excelCol.numFmt = 'yyyy-mm-dd';
      excelCol.width = 12;
    } else {
      excelCol.width = Math.min(Math.max(col.length + 2, 10), 30);
    }
  });

  // Auto-sum row
  if (allRows.length > 0) {
    addAutoSumRow(worksheet, columns, numericColumns, allRows.length);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Sunder brand colors for Excel formatting */
const EXCEL_COLORS = {
  sunderBlue: 'FF012BCB',
  sunderNavy: 'FF011F9A',
  contentGray: 'FF1F2937',
  borderGray: 'FFE4E4E7',
  alternateRow: 'FFF8F9FA',
  white: 'FFFFFFFF',
};

/**
 * Style the header row with Sunder brand colors.
 * White bold text on Sunder Blue background.
 */
function styleHeaderRow(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: EXCEL_COLORS.white } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: EXCEL_COLORS.sunderBlue },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Add borders to header cells
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: EXCEL_COLORS.borderGray } },
      left: { style: 'thin', color: { argb: EXCEL_COLORS.borderGray } },
      bottom: { style: 'thin', color: { argb: EXCEL_COLORS.borderGray } },
      right: { style: 'thin', color: { argb: EXCEL_COLORS.borderGray } },
    };
  });
}

/**
 * Add a TOTAL row with SUM formulas for numeric columns.
 */
function addAutoSumRow(
  worksheet: ExcelJS.Worksheet,
  columns: string[],
  numericColumns: Set<number>,
  dataRowCount: number
) {
  const sumRowValues = columns.map((_col, idx) => {
    if (idx === 0) return 'TOTAL';
    if (numericColumns.has(idx)) {
      const colLetter = getExcelColumnLetter(idx + 1);
      return { formula: `SUM(${colLetter}2:${colLetter}${dataRowCount + 1})` };
    }
    return null;
  });

  const sumRow = worksheet.addRow(sumRowValues);
  sumRow.font = { bold: true };
}

/**
 * Convert column number to Excel letter (1→A, 27→AA).
 */
function getExcelColumnLetter(colNum: number): string {
  let letter = '';
  while (colNum > 0) {
    const mod = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return letter;
}
