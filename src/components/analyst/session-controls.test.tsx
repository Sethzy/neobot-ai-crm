/**
 * Tests for SessionControls component.
 * @module components/analyst/session-controls.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionControls } from './session-controls';

describe('SessionControls', () => {
  const defaultProps = {
    onNewChat: vi.fn(),
    onQuickExport: vi.fn(),
    isExporting: false,
    isStale: false,
  };

  it('always shows New Chat button', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('calls onNewChat when New Chat clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<SessionControls {...defaultProps} onNewChat={onNewChat} />);

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    expect(onNewChat).toHaveBeenCalled();
  });

  it('renders Quick Export dropdown', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.getByRole('button', { name: /export totals/i })).toBeInTheDocument();
  });

  it('disables Quick Export when exporting', () => {
    render(<SessionControls {...defaultProps} isExporting={true} />);

    expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled();
  });

  it('calls onQuickExport with excel when Export Totals clicked', async () => {
    const user = userEvent.setup();
    const onQuickExport = vi.fn();
    render(<SessionControls {...defaultProps} onQuickExport={onQuickExport} />);

    await user.click(screen.getByRole('button', { name: /export totals/i }));

    expect(onQuickExport).toHaveBeenCalledWith('excel');
  });

  it('hides stale indicator when not stale', () => {
    render(<SessionControls {...defaultProps} isStale={false} />);

    expect(screen.queryByLabelText(/new uploads detected/i)).not.toBeInTheDocument();
  });

  it('shows stale indicator when stale', () => {
    render(<SessionControls {...defaultProps} isStale={true} />);

    expect(screen.getByLabelText(/new uploads detected/i)).toBeInTheDocument();
  });
});
