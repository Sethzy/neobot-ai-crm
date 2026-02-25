
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolsDropdown } from './tools-dropdown';

describe('ToolsDropdown', () => {
  it('renders trigger button', () => {
    render(<ToolsDropdown />);
    expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
  });

  it('opens popover on click', async () => {
    const user = userEvent.setup();
    render(<ToolsDropdown />);

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByText(/active tools/i)).toBeInTheDocument();
  });

  it('shows active and coming soon tools', async () => {
    const user = userEvent.setup();
    render(<ToolsDropdown />);

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByText(/active tools/i)).toBeInTheDocument();
    expect(screen.getByText(/^excel$/i)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/erp integration/i)).toBeInTheDocument();
  });
});
