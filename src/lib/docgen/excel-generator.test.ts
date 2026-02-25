/**
 * Tests for Excel generator with comprehensive flattening.
 * @module lib/docgen/excel-generator.test
 */
import { describe, it, expect } from 'vitest';
import * as ExcelJS from 'exceljs';
import { isSignatureStructure, detectFieldType, flattenCurrency, flattenSignature, flattenNestedObject, expandArraysToRows, convertSplitsToExcel, type SplitForExcel } from './excel-generator';

describe('isSignatureStructure', () => {
  it('detects signature from 4-field structure', () => {
    const value = {
      printed_name: 'John',
      signature_date: '2024-01-15',
      is_signed: true,
      title_or_role: 'Manager',
    };
    expect(isSignatureStructure(value)).toBe(true);
  });

  it('returns false for currency object', () => {
    const value = { amount: 500, iso_4217_currency_code: 'SGD' };
    expect(isSignatureStructure(value)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSignatureStructure(null)).toBe(false);
  });
});

describe('detectFieldType', () => {
  it('detects currency from {amount, iso_4217_currency_code}', () => {
    const values = [{ amount: 100, iso_4217_currency_code: 'SGD' }];
    expect(detectFieldType('cash_amount', values)).toBe('currency');
  });

  it('detects signature from 4-field structure', () => {
    const values = [{
      printed_name: 'John',
      signature_date: '2024-01-01',
      is_signed: true,
      title_or_role: 'CEO',
    }];
    expect(detectFieldType('auth_sig', values)).toBe('signature');
  });

  it('detects array_of_objects', () => {
    const values = [[{ description: 'Item 1', amount: 100 }]];
    expect(detectFieldType('line_items', values)).toBe('array_of_objects');
  });

  it('detects array_of_primitives for string[]', () => {
    const values = [['MAEU123', 'MAEU456']];
    expect(detectFieldType('containers', values)).toBe('array_of_primitives');
  });

  it('defaults to string for null values', () => {
    const values = [null, null];
    expect(detectFieldType('unknown', values)).toBe('string');
  });

  it('detects nested_object for non-standard objects', () => {
    const values = [{ city: 'Singapore', postal_code: '123456' }];
    expect(detectFieldType('address', values)).toBe('nested_object');
  });

  it('detects number type', () => {
    const values = [100, 200.5];
    expect(detectFieldType('quantity', values)).toBe('number');
  });

  it('detects boolean type', () => {
    const values = [true, false];
    expect(detectFieldType('is_paid', values)).toBe('boolean');
  });

  it('detects date from ISO string', () => {
    const values = ['2024-01-15', '2024-02-20'];
    expect(detectFieldType('invoice_date', values)).toBe('date');
  });
});

describe('flattenCurrency', () => {
  it('expands currency to two columns', () => {
    const result = flattenCurrency('total', { amount: 500, iso_4217_currency_code: 'SGD' });
    expect(result).toEqual({
      total_amount: 500,
      total_currency: 'SGD',
    });
  });

  it('handles null currency values', () => {
    const result = flattenCurrency('total', { amount: null, iso_4217_currency_code: null });
    expect(result).toEqual({
      total_amount: null,
      total_currency: null,
    });
  });

  it('handles partial null (amount only)', () => {
    const result = flattenCurrency('total', { amount: null, iso_4217_currency_code: 'SGD' });
    expect(result).toEqual({
      total_amount: null,
      total_currency: 'SGD',
    });
  });
});

describe('flattenSignature', () => {
  it('expands signature to four columns', () => {
    const sig = {
      printed_name: 'John',
      signature_date: '2024-01-15',
      is_signed: true,
      title_or_role: 'Manager',
    };
    const result = flattenSignature('auth', sig);
    expect(result).toEqual({
      auth_printed_name: 'John',
      auth_signature_date: '2024-01-15',
      auth_is_signed: true,
      auth_title_or_role: 'Manager',
    });
  });

  it('handles null values in signature', () => {
    const sig = {
      printed_name: null,
      signature_date: null,
      is_signed: null,
      title_or_role: null,
    };
    const result = flattenSignature('auth', sig);
    expect(result).toEqual({
      auth_printed_name: null,
      auth_signature_date: null,
      auth_is_signed: null,
      auth_title_or_role: null,
    });
  });
});

describe('flattenNestedObject', () => {
  it('flattens nested object with prefix', () => {
    const obj = { city: 'Singapore', postal_code: '123456' };
    const result = flattenNestedObject('address', obj);
    expect(result).toEqual({
      address_city: 'Singapore',
      address_postal_code: '123456',
    });
  });

  it('flattens 2 levels deep', () => {
    const obj = { level1: { level2: 'value' } };
    const result = flattenNestedObject('root', obj);
    expect(result).toEqual({
      root_level1_level2: 'value',
    });
  });

  it('JSON stringifies at level 3+', () => {
    const obj = { a: { b: { c: { d: 'too deep' } } } };
    const result = flattenNestedObject('root', obj);
    expect(result.root_a_b_c).toBe('{"d":"too deep"}');
  });

  it('handles null values', () => {
    const obj = { city: null, country: 'SG' };
    const result = flattenNestedObject('addr', obj);
    expect(result).toEqual({
      addr_city: null,
      addr_country: 'SG',
    });
  });
});

describe('expandArraysToRows', () => {
  it('generates multiple rows for array of objects', () => {
    const baseRow = { invoice_number: 'INV-001' };
    const extractedData = {
      invoice_number: 'INV-001',
      line_items: [
        { description: 'Item 1', amount: 100 },
        { description: 'Item 2', amount: 200 },
      ],
    };

    const rows = expandArraysToRows(baseRow, extractedData);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      invoice_number: 'INV-001',
      line_items_description: 'Item 1',
      line_items_amount: 100,
    });
    expect(rows[1]).toEqual({
      invoice_number: 'INV-001',
      line_items_description: 'Item 2',
      line_items_amount: 200,
    });
  });

  it('produces single row with nulls for empty array', () => {
    const baseRow = { invoice_number: 'INV-002' };
    const extractedData = {
      invoice_number: 'INV-002',
      line_items: [],
    };

    const rows = expandArraysToRows(baseRow, extractedData);

    expect(rows).toHaveLength(1);
    expect(rows[0].invoice_number).toBe('INV-002');
  });

  it('returns base row when no arrays present', () => {
    const baseRow = { name: 'John' };
    const extractedData = { name: 'John', age: 30 };

    const rows = expandArraysToRows(baseRow, extractedData);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'John' });
  });

  it('handles nested currency in array items', () => {
    const baseRow = { id: '1' };
    const extractedData = {
      charges: [
        { type: 'Fee', amount: { amount: 50, iso_4217_currency_code: 'SGD' } },
      ],
    };

    const rows = expandArraysToRows(baseRow, extractedData);

    expect(rows[0].charges_amount_amount).toBe(50);
    expect(rows[0].charges_amount_currency).toBe('SGD');
  });
});

describe('convertSplitsToExcel', () => {
  it('generates valid xlsx buffer', async () => {
    const splits: SplitForExcel[] = [
      {
        id: 'test-1',
        tag_id: 'medical_expense',
        document_date: '2024-01-15',
        identifier: 'INV-001',
        potential_duplicate: null,
        extracted_data: {
          provider_name: 'SGH',
          cash_amount: { amount: 500, iso_4217_currency_code: 'SGD' },
        },
      },
    ];

    const buffer = await convertSplitsToExcel(splits);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // Verify xlsx magic bytes (PK for zip)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('handles empty splits array', async () => {
    const buffer = await convertSplitsToExcel([]);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles null extracted_data', async () => {
    const splits: SplitForExcel[] = [
      {
        id: 'x',
        tag_id: 'other',
        document_date: null,
        identifier: null,
        potential_duplicate: null,
        extracted_data: null,
      },
    ];

    const buffer = await convertSplitsToExcel(splits);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('flattens currency fields into separate columns', async () => {
    const splits: SplitForExcel[] = [
      {
        id: '1',
        tag_id: 'invoice',
        document_date: null,
        identifier: null,
        potential_duplicate: null,
        extracted_data: {
          total: { amount: 1000, iso_4217_currency_code: 'SGD' },
        },
      },
    ];

    const buffer = await convertSplitsToExcel(splits);

    // Parse buffer to verify columns
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = workbook.getWorksheet('Data Export');
    const headers = ws?.getRow(1).values as string[];

    expect(headers).toContain('total_amount');
    expect(headers).toContain('total_currency');
  });

  it('expands line_items into multiple rows', async () => {
    const splits: SplitForExcel[] = [
      {
        id: '1',
        tag_id: 'invoice',
        document_date: null,
        identifier: null,
        potential_duplicate: null,
        extracted_data: {
          invoice_number: 'INV-001',
          line_items: [
            { description: 'Item A', amount: 100 },
            { description: 'Item B', amount: 200 },
          ],
        },
      },
    ];

    const buffer = await convertSplitsToExcel(splits);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = workbook.getWorksheet('Data Export');

    // Header + 2 data rows + sum row = 4
    expect(ws?.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('joins primitive arrays with semicolon', async () => {
    const splits: SplitForExcel[] = [
      {
        id: '1',
        tag_id: 'shipping',
        document_date: null,
        identifier: null,
        potential_duplicate: null,
        extracted_data: {
          container_numbers: ['MAEU123', 'MAEU456', 'MAEU789'],
        },
      },
    ];

    const buffer = await convertSplitsToExcel(splits);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = workbook.getWorksheet('Data Export');
    const dataRow = ws?.getRow(2);

    // Find container_numbers column
    const headers = ws?.getRow(1).values as string[];
    const colIdx = headers.indexOf('container_numbers');
    const cellValue = dataRow?.getCell(colIdx).value;

    expect(cellValue).toBe('MAEU123; MAEU456; MAEU789');
  });
});
