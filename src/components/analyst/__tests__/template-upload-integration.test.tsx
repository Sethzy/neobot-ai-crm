/**
 * @fileoverview Integration tests for template file upload flow.
 * Tests the complete flow from file selection to API request construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../chat-input';
import {
  validateTemplateFile,
  validateTemplateFiles,
  TEMPLATE_MAX_FILES,
  TEMPLATE_MAX_FILE_SIZE,
} from '@/lib/analyst/template-validation';

// Mock toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

describe('Template Upload Integration', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    isLoading: false,
    availableTags: ['invoices', 'receipts'],
    selectedTags: [],
    onTagChange: vi.fn(),
    isFilterLocked: false,
    tagCounts: { invoices: 5, receipts: 3 },
    attachedImages: [],
    onImagesChange: vi.fn(),
    templateFiles: [] as File[],
    onTemplateFilesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File validation', () => {
    it('validates allowed file extensions', () => {
      const validExtensions = ['.xlsx', '.xls', '.pptx', '.docx', '.pdf', '.csv', '.json', '.xml', '.txt', '.md'];

      for (const ext of validExtensions) {
        const file = new File(['content'], `test${ext}`, { type: 'application/octet-stream' });
        const result = validateTemplateFile(file);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects unsupported file types', () => {
      const file = new File(['content'], 'image.png', { type: 'image/png' });
      const result = validateTemplateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('rejects files exceeding size limit', () => {
      const file = new File([''], 'large.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      Object.defineProperty(file, 'size', { value: TEMPLATE_MAX_FILE_SIZE + 1 });

      const result = validateTemplateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds 50MB limit');
    });

    it('rejects more than max files', () => {
      const files = Array(TEMPLATE_MAX_FILES + 1).fill(null).map((_, i) =>
        new File([''], `file${i}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );

      const result = validateTemplateFiles(files);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(`Maximum ${TEMPLATE_MAX_FILES} files`);
    });
  });

  describe('ChatInput template integration', () => {
    it('renders template upload button (paperclip) when onTemplateFilesChange provided', () => {
      render(<ChatInput {...defaultProps} />);

      expect(screen.getByRole('button', { name: /attach template files/i })).toBeInTheDocument();
    });

    it('displays selected template files as cards above input', () => {
      const files = [
        new File([''], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        new File([''], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      ];

      render(<ChatInput {...defaultProps} templateFiles={files} />);

      expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
      expect(screen.getByText('report.docx')).toBeInTheDocument();
      // File extension should be displayed
      expect(screen.getByText('xlsx')).toBeInTheDocument();
      expect(screen.getByText('docx')).toBeInTheDocument();
    });

    it('hides template upload button when filter is locked', () => {
      render(<ChatInput {...defaultProps} isFilterLocked={true} />);

      // Paperclip button should be hidden when locked
      expect(screen.queryByRole('button', { name: /attach template files/i })).not.toBeInTheDocument();
    });

    it('shows lock icon on file cards when locked', () => {
      const files = [
        new File([''], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      ];

      render(<ChatInput {...defaultProps} templateFiles={files} isFilterLocked={true} />);

      expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
      // Remove button should not exist when locked
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('allows removing files when not locked', async () => {
      const user = userEvent.setup();
      const onTemplateFilesChange = vi.fn();
      const files = [
        new File([''], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      ];

      render(
        <ChatInput
          {...defaultProps}
          templateFiles={files}
          onTemplateFilesChange={onTemplateFilesChange}
        />
      );

      const removeButton = screen.getByRole('button', { name: /remove budget\.xlsx/i });
      await user.click(removeButton);

      expect(onTemplateFilesChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Full flow simulation', () => {
    it('complete upload flow: select files -> display cards -> lock on submit', async () => {
      const onTemplateFilesChange = vi.fn();
      const files = [
        new File(['content'], 'template.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ];

      // Step 1: Render with no files
      const { rerender } = render(
        <ChatInput {...defaultProps} onTemplateFilesChange={onTemplateFilesChange} />
      );

      // Verify paperclip button exists
      expect(screen.getByRole('button', { name: /attach template files/i })).toBeInTheDocument();

      // Step 2: Simulate files being added (would happen via file picker)
      rerender(
        <ChatInput
          {...defaultProps}
          templateFiles={files}
          onTemplateFilesChange={onTemplateFilesChange}
        />
      );

      // Verify file card is displayed
      expect(screen.getByText('template.xlsx')).toBeInTheDocument();

      // Step 3: Simulate session starting (filter locked)
      rerender(
        <ChatInput
          {...defaultProps}
          templateFiles={files}
          onTemplateFilesChange={onTemplateFilesChange}
          isFilterLocked={true}
        />
      );

      // Verify paperclip button is hidden when locked
      expect(screen.queryByRole('button', { name: /attach template files/i })).not.toBeInTheDocument();
      // Verify template file input is removed (can't add more)
      const templateInput = document.querySelector('input[type="file"][accept*=".xlsx"]');
      expect(templateInput).not.toBeInTheDocument();
      // Remove buttons are gone
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
      // File card still shows the file
      expect(screen.getByText('template.xlsx')).toBeInTheDocument();
    });
  });
});
