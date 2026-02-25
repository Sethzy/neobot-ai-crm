/**
 * @fileoverview Tests for TemplateUploadButton component.
 * Tests file picker, chip display, and lock behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateUploadButton } from './template-upload-button';

describe('TemplateUploadButton', () => {
  it('renders upload icon with tooltip', () => {
    render(
      <TemplateUploadButton
        files={[]}
        onFilesChange={vi.fn()}
        isLocked={false}
      />
    );

    const button = screen.getByRole('button', { name: /upload templates/i });
    expect(button).toBeInTheDocument();
  });

  it('opens file picker on click when not locked', async () => {
    render(
      <TemplateUploadButton
        files={[]}
        onFilesChange={vi.fn()}
        isLocked={false}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toContain('.xlsx');
    expect(input.multiple).toBe(true);
  });

  it('does not render file input when locked', () => {
    render(
      <TemplateUploadButton
        files={[]}
        onFilesChange={vi.fn()}
        isLocked={true}
      />
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeInTheDocument();
  });

  it('displays file chips for uploaded files', () => {
    const files = [
      new File([''], 'budget.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      new File([''], 'report.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ];

    render(
      <TemplateUploadButton
        files={files}
        onFilesChange={vi.fn()}
        isLocked={false}
      />
    );

    expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
    expect(screen.getByText('report.docx')).toBeInTheDocument();
  });

  it('allows removing files when not locked', async () => {
    const user = userEvent.setup();
    const onFilesChange = vi.fn();
    const files = [
      new File([''], 'budget.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ];

    render(
      <TemplateUploadButton
        files={files}
        onFilesChange={onFilesChange}
        isLocked={false}
      />
    );

    const removeButton = screen.getByRole('button', { name: /remove budget\.xlsx/i });
    await user.click(removeButton);

    expect(onFilesChange).toHaveBeenCalledWith([]);
  });

  it('shows lock icon on chips when locked', () => {
    const files = [
      new File([''], 'budget.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ];

    render(
      <TemplateUploadButton
        files={files}
        onFilesChange={vi.fn()}
        isLocked={true}
      />
    );

    expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    // Badge should have cursor-default class when locked
    const badge = screen.getByText('budget.xlsx').closest('[data-slot="badge"]');
    expect(badge).toHaveClass('cursor-default');
  });
});
