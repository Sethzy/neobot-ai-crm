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

    expect(screen.getByRole('button', { name: /export totals/i })).toBeDisabled();
  });

  it('shows export options in dropdown', async () => {
    const user = userEvent.setup();
    render(<SessionControls {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /export totals/i }));

    expect(screen.getByRole('menuitem', { name: /export to excel/i })).toBeInTheDocument();
  });

  it('calls onQuickExport with excel when Excel option clicked', async () => {
    const user = userEvent.setup();
    const onQuickExport = vi.fn();
    render(<SessionControls {...defaultProps} onQuickExport={onQuickExport} />);

    await user.click(screen.getByRole('button', { name: /export totals/i }));
    await user.click(screen.getByRole('menuitem', { name: /export to excel/i }));

    expect(onQuickExport).toHaveBeenCalledWith('excel');
  });

  it('hides stale indicator when not stale', () => {
    render(<SessionControls {...defaultProps} isStale={false} />);

    expect(screen.queryByLabelText(/new documents available/i)).not.toBeInTheDocument();
  });

  it('shows stale indicator when stale', () => {
    render(<SessionControls {...defaultProps} isStale={true} />);

    expect(screen.getByLabelText(/new documents available/i)).toBeInTheDocument();
  });
});
