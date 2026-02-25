/**
 * Tests for ReportItem component.
 * @module components/analyst/report-item.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportItem } from './report-item';

describe('ReportItem', () => {
  const defaultReport = {
    id: 'report-1',
    name: 'Q4_Report.xlsx',
    generated_at: '2026-01-15T10:30:00Z',
    report_type: 'quick_report',
    file_path: '/reports/q4.xlsx',
    splits_count: 25,
    tags_included: ['invoice', 'po'],
  };

  it('renders report name and metadata', () => {
    render(<ReportItem report={defaultReport} onDownload={vi.fn()} />);

    expect(screen.getByText('Q4_Report.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/jan 15/i)).toBeInTheDocument();
  });

  it('calls onDownload when clicked', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<ReportItem report={defaultReport} onDownload={onDownload} />);

    await user.click(screen.getByText('Q4_Report.xlsx'));

    expect(onDownload).toHaveBeenCalledWith('/reports/q4.xlsx');
  });
});
