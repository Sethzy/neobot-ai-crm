/**
 * Tests for FileDownload component.
 * @module components/analyst/file-download.test
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileDownload } from './file-download';

describe('FileDownload', () => {
  it('renders image inline when mediaType is image/*', () => {
    render(
      <FileDownload
        url="data:image/png;base64,abc123"
        mediaType="image/png"
        filename="chart.png"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
    expect(img).toHaveAttribute('alt', 'chart.png');
  });

  it('renders download link for non-image files', () => {
    render(
      <FileDownload
        url="https://example.com/report.xlsx"
        mediaType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename="report.xlsx"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/report.xlsx');
    expect(link).toHaveAttribute('download', 'report.xlsx');
    expect(screen.getByText('report.xlsx')).toBeInTheDocument();
    // Should show Spreadsheet label for Excel files
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();
    expect(link.querySelector("svg")?.getAttribute("class") ?? "").toContain("text-filetype-spreadsheet");
  });

  it('shows PDF-specific styling and label', () => {
    const { container } = render(
      <FileDownload
        url="https://example.com/document.pdf"
        mediaType="application/pdf"
        filename="document.pdf"
      />
    );

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").toContain("text-filetype-pdf");
  });

  it('shows CSV-specific styling and label', () => {
    render(
      <FileDownload
        url="https://example.com/data.csv"
        mediaType="text/csv"
        filename="data.csv"
      />
    );

    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();
  });

  it('shows fallback text when no filename provided', () => {
    render(
      <FileDownload
        url="https://example.com/file"
        mediaType="application/pdf"
      />
    );

    // Falls back to 'download' as the filename
    expect(screen.getByText('download')).toBeInTheDocument();
    // Shows 'File' label (default, since 'download' has no extension)
    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('renders image with lazy loading', () => {
    render(
      <FileDownload
        url="data:image/png;base64,abc123"
        mediaType="image/png"
        filename="chart.png"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to download link when image fails to load', () => {
    render(
      <FileDownload
        url="https://example.com/broken-image.png"
        mediaType="image/png"
        filename="broken.png"
      />
    );

    // Initially renders as image
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();

    // Simulate image error
    fireEvent.error(img);

    // Should now show download link instead
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.getByText('broken.png')).toBeInTheDocument();
  });
});
