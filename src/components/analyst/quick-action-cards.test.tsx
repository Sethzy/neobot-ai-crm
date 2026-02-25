/**
 * Tests for QuickActionCards component.
 * @module components/analyst/quick-action-cards.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickActionCards } from './quick-action-cards';

describe('QuickActionCards', () => {
  it('renders all three action cards', () => {
    render(<QuickActionCards onSelectAction={vi.fn()} />);

    expect(screen.getByText('Reconcile')).toBeInTheDocument();
    expect(screen.getByText('Analyze patterns')).toBeInTheDocument();
    expect(screen.getByText('Find issues')).toBeInTheDocument();
  });

  it('calls onSelectAction with reconcile prompt when clicked', async () => {
    const user = userEvent.setup();
    const onSelectAction = vi.fn();
    render(<QuickActionCards onSelectAction={onSelectAction} />);

    await user.click(screen.getByText('Reconcile'));

    expect(onSelectAction).toHaveBeenCalledWith(
      expect.stringContaining('Cross-reference and match documents')
    );
  });

  it('calls onSelectAction with analyze prompt when clicked', async () => {
    const user = userEvent.setup();
    const onSelectAction = vi.fn();
    render(<QuickActionCards onSelectAction={onSelectAction} />);

    await user.click(screen.getByText('Analyze patterns'));

    expect(onSelectAction).toHaveBeenCalledWith(
      expect.stringContaining('Analyze patterns in this data')
    );
  });

  it('calls onSelectAction with issues prompt when clicked', async () => {
    const user = userEvent.setup();
    const onSelectAction = vi.fn();
    render(<QuickActionCards onSelectAction={onSelectAction} />);

    await user.click(screen.getByText('Find issues'));

    expect(onSelectAction).toHaveBeenCalledWith(
      expect.stringContaining('Audit these documents for issues')
    );
  });
});
