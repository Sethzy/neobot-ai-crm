/**
 * Tests for ReportSidebar component.
 * @module components/analyst/report-sidebar.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportSidebar } from './report-sidebar';

describe('ReportSidebar', () => {
  it('shows empty state when no reports', () => {
    render(<ReportSidebar reports={[]} onDownload={vi.fn()} />);

    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
  });

  it('renders report items when reports exist', () => {
    const reports = [
      {
        id: 'report-1',
        name: 'Q4_Report.xlsx',
        generated_at: '2026-01-15T10:30:00Z',
        report_type: 'quick_report',
        file_path: '/reports/q4.xlsx',
        splits_count: 25,
        tags_included: ['invoice'],
      },
      {
        id: 'report-2',
        name: 'January_Summary.xlsx',
        generated_at: '2026-01-10T09:00:00Z',
        report_type: 'ai_analysis',
        file_path: '/reports/jan.xlsx',
        splits_count: 10,
        tags_included: ['po'],
      },
    ];

    render(<ReportSidebar reports={reports} onDownload={vi.fn()} />);

    expect(screen.getByText('Q4_Report.xlsx')).toBeInTheDocument();
    expect(screen.getByText('January_Summary.xlsx')).toBeInTheDocument();
  });

  it('displays Reports header', () => {
    render(<ReportSidebar reports={[]} onDownload={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
  });

  describe('mobile behavior', () => {
    it('accepts isOpen and onClose props for drawer mode', () => {
      const onClose = vi.fn();
      render(
        <ReportSidebar
          reports={[]}
          onDownload={vi.fn()}
          isOpen={true}
          onClose={onClose}
          isMobile={true}
        />
      );

      // In mobile mode, should render as sheet/drawer
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders as sidebar when isMobile is false', () => {
      render(
        <ReportSidebar
          reports={[]}
          onDownload={vi.fn()}
          isMobile={false}
        />
      );

      // Should not render as dialog
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Should render as aside
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });
  });
});
