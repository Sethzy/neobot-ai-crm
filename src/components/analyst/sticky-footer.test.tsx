/**
 * Tests for StickyFooter component.
 * @module components/analyst/sticky-footer.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickyFooter } from './sticky-footer';

describe('StickyFooter', () => {
  const defaultProps = {
    onNewChat: vi.fn(),
    onQuickExport: vi.fn(),
    isExporting: false,
    isStale: false,
    children: <div data-testid="input-slot">Input goes here</div>,
  };

  it('renders input slot', () => {
    render(<StickyFooter {...defaultProps} />);

    expect(screen.getByTestId('input-slot')).toBeInTheDocument();
  });

  it('renders controls row with New Chat button', () => {
    render(<StickyFooter {...defaultProps} />);

    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('renders Quick Export dropdown', () => {
    render(<StickyFooter {...defaultProps} />);

    expect(screen.getByRole('button', { name: /export totals/i })).toBeInTheDocument();
  });

  it('hides stale indicator when not stale', () => {
    render(<StickyFooter {...defaultProps} isStale={false} />);

    expect(screen.queryByLabelText(/new uploads detected/i)).not.toBeInTheDocument();
  });

  it('shows stale indicator when stale', () => {
    render(<StickyFooter {...defaultProps} isStale={true} />);

    expect(screen.getByLabelText(/new uploads detected/i)).toBeInTheDocument();
  });

  it('calls onNewChat when New Chat clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<StickyFooter {...defaultProps} onNewChat={onNewChat} />);

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    expect(onNewChat).toHaveBeenCalled();
  });
});
